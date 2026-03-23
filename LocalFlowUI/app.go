package main

/*
#cgo CFLAGS: -I./lib
#cgo LDFLAGS: -L./lib -lwhisper -lggml -lggml-base -lggml-cpu -static -lstdc++ -lgomp -lpthread -lm
#include "whisper.h"
#include <stdlib.h>
*/
import "C"
import (
	"context"
	"math"
	"strings"
	"sync"
	"time"
	"unsafe"

	"github.com/atotto/clipboard"
	"github.com/gen2brain/malgo"
	"github.com/go-vgo/robotgo"
	hook "github.com/robotn/gohook"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

type App struct {
	ctx         context.Context
	whisperCtx  *C.struct_whisper_context
	audioBuffer []float32
	mutex       sync.Mutex
}

func NewApp() *App {
	return &App{}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx

	// 1. Apply click-through + no-focus-steal window styles
	go applyOverlayStyles()

	// 2. Prune audio cache (delete recordings older than 1 week) — only at startup
	pruneAudioCache()

	// 3. Open / create local SQLite database
	initDB()

	// 4. Initialize Whisper
	modelPath := C.CString("models/ggml-tiny.en.bin")
	defer C.free(unsafe.Pointer(modelPath))
	params := C.whisper_context_default_params()
	a.whisperCtx = C.whisper_init_from_file_with_params(modelPath, params)

	// 5. Setup System Tray
	a.setupTray()

	// 6. Start Global Hook in a Goroutine
	go a.listenToKeyboard()
}

func (a *App) listenToKeyboard() {
	evChan := hook.Start()
	var (
		isRecording  = false
		lCtrlPressed = false
		lWinPressed  = false
		lockoutEnd   time.Time
	)

	// Audio Config
	mctx, _ := malgo.InitContext(nil, malgo.ContextConfig{}, nil)
	deviceConfig := malgo.DefaultDeviceConfig(malgo.Capture)
	deviceConfig.Capture.Format = malgo.FormatF32
	deviceConfig.Capture.Channels = 1
	deviceConfig.SampleRate = 16000
	var device *malgo.Device

	for ev := range evChan {
		// Key Rawcodes for Windows:
		// Left Ctrl: 162
		// Left Windows: 91

		if ev.Rawcode == 162 { // Left Ctrl
			if ev.Kind == hook.KeyDown {
				lCtrlPressed = true
			} else if ev.Kind == hook.KeyUp {
				lCtrlPressed = false
			}
		} else if ev.Rawcode == 91 { // Left Windows
			if ev.Kind == hook.KeyDown {
				lWinPressed = true
			} else if ev.Kind == hook.KeyUp {
				lWinPressed = false
				// If the Windows key is released alone right after we finish recording,
				// tap Ctrl one more time to catch it.
				if time.Now().Before(lockoutEnd) {
					go robotgo.KeyTap("ctrl")
				}
			}
		}

		// Check if the combination is active
		shouldBeRecording := lCtrlPressed && lWinPressed

		if shouldBeRecording && !isRecording {
			a.mutex.Lock()
			isRecording = true
			a.audioBuffer = []float32{}
			a.mutex.Unlock()

			// Show the window WITHOUT stealing focus
			go showWindowNoActivate()
			
			// Tell UI to show the INITIALIZING spinner
			runtime.EventsEmit(a.ctx, "recording-state", "initializing")

			isMicReady := false

			onRec := func(pSample2, pSample []byte, frameCount uint32) {
				if !isMicReady {
					isMicReady = true
					// Tell UI the mic is warm and actually streaming
					runtime.EventsEmit(a.ctx, "recording-state", "listening")
				}

				samples := (*[1 << 30]float32)(unsafe.Pointer(&pSample[0]))[:frameCount]

				// Calculate volume for the "bars" animation
				var sum float32
				for _, s := range samples {
					sum += s * s
				}
				vol := float32(math.Sqrt(float64(sum / float32(len(samples)))))
				runtime.EventsEmit(a.ctx, "volume-data", vol*100)

				a.mutex.Lock()
				a.audioBuffer = append(a.audioBuffer, samples...)
				a.mutex.Unlock()
			}

			// ONLY initialize and start the microphone when the hotkey is pressed
			device, _ = malgo.InitDevice(mctx.Context, deviceConfig, malgo.DeviceCallbacks{Data: onRec})
			device.Start()

		} else if !shouldBeRecording && isRecording {
			// TRICK: Stop Windows from opening the Start/Search menu
			robotgo.KeyTap("ctrl")
			lockoutEnd = time.Now().Add(500 * time.Millisecond)

			a.mutex.Lock()
			isRecording = false
			a.mutex.Unlock()

			// Tell UI to shrink and show processing spinner
			runtime.EventsEmit(a.ctx, "recording-state", "processing")

			// Let the microphone keep recording natively for 400ms
			// in the background to capture the trailing parts of speech
			go func(dev *malgo.Device) {
				time.Sleep(400 * time.Millisecond)

				dev.Stop()
				dev.Uninit()

				a.mutex.Lock()
				// Add a tiny silence pad just in case even with the 400ms trail it's below Whisper minimums
				padding := make([]float32, 1600)
				a.audioBuffer = append(a.audioBuffer, padding...)
				a.mutex.Unlock()

				a.transcribe()
			}(device)
		}
	}
}

func (a *App) transcribe() {
	recordedAt := time.Now()

	a.mutex.Lock()
	if len(a.audioBuffer) > 0 {
		// Snapshot buffer for cache saving — always use the RAW (unmodified) samples
		cacheCopy := make([]float32, len(a.audioBuffer))
		copy(cacheCopy, a.audioBuffer)

		// Duration in milliseconds: samples / sample_rate * 1000
		durationMs := int64(len(a.audioBuffer)) * 1000 / 16000

		// Apply Whisper input boost if enabled in config.
		// We modify a separate copy so the raw WAV saved to disk stays unaffected.
		whisperBuf := a.audioBuffer
		cfg := loadConfig()
		if cfg.InputBoostEnabled && cfg.InputBoostGain > 1.0 {
			boosted := make([]float32, len(a.audioBuffer))
			for i, s := range a.audioBuffer {
				s *= cfg.InputBoostGain
				if s > 1.0 {
					s = 1.0
				} else if s < -1.0 {
					s = -1.0
				}
				boosted[i] = s
			}
			whisperBuf = boosted
		}

		wParams := C.whisper_full_default_params(C.WHISPER_SAMPLING_GREEDY)
		C.whisper_full(a.whisperCtx, wParams, (*C.float)(unsafe.Pointer(&whisperBuf[0])), C.int(len(whisperBuf)))

		numSegments := int(C.whisper_full_n_segments(a.whisperCtx))
		result := ""
		for i := 0; i < numSegments; i++ {
			result += C.GoString(C.whisper_full_get_segment_text(a.whisperCtx, C.int(i)))
		}

		// Trim whitespace and filter Whisper noise/hallucination tokens
		result = strings.TrimSpace(result)
		isBlank := result == "" ||
			result == "[BLANK_AUDIO]" ||
			result == "(blank audio)" ||
			result == "[silence]" ||
			result == "(silence)"

		a.mutex.Unlock()

		// Save WAV + log to DB (both happen concurrently, non-blocking)
		go func(buf []float32, ts time.Time, durMs int64, text string) {
			filename, _ := saveAudioToCache(buf)
			saveRecording(filename, ts, durMs, text)
		}(cacheCopy, recordedAt, durationMs, result)

		if !isBlank {
			// Write text to clipboard
			clipboard.WriteAll(result)

			// Give the previous window time to fully regain focus before pasting.
			// The pill spinner remains visible during this entire wait — good UX feedback.
			time.Sleep(350 * time.Millisecond)

			// Paste via Ctrl+V — atomic and reliable regardless of focus timing
			robotgo.KeyTap("v", "ctrl")

			// NOW signal the pill to animate away — the user has their text
			runtime.EventsEmit(a.ctx, "recording-done")
			time.Sleep(650 * time.Millisecond) // Wait for pill hide animation
			runtime.WindowHide(a.ctx)
		} else {
			// Still hide the pill even on blank audio
			runtime.EventsEmit(a.ctx, "recording-done")
			time.Sleep(650 * time.Millisecond)
			runtime.WindowHide(a.ctx)
		}
	} else {
		a.mutex.Unlock()

		// No audio at all — still dismiss the pill
		runtime.EventsEmit(a.ctx, "recording-done")
		time.Sleep(650 * time.Millisecond)
		runtime.WindowHide(a.ctx)
	}
}
