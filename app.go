package main

/*
#cgo CFLAGS: -I./lib
#cgo LDFLAGS: -L./lib/dll -lwhisper -lggml -lggml-base -lggml-cpu -lggml-vulkan -lstdc++ -lgomp -lpthread -lm
#include "whisper.h"
#include <stdlib.h>

int ggml_backend_vk_get_device_count(void);
void ggml_backend_vk_get_device_description(int device, char * description, size_t description_size);
*/
import "C"
import (
	"context"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"time"
	"unsafe"

	"github.com/atotto/clipboard"
	"github.com/gen2brain/malgo"
	"github.com/go-vgo/robotgo"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

const (
	wmKeyDown    = 0x0100
	wmKeyUp      = 0x0101
	wmSysKeyDown = 0x0104
	wmSysKeyUp   = 0x0105

	llkhfInjected  = 0x00000010
	keyeventfKeyup = 0x0002

	vkLControl = 0xA2
	vkRControl = 0xA3
	vkLWin     = 0x5B
	vkRWin     = 0x5C

	whKeyboardLL = 13
)

type keyEvent struct {
	rawcode uint16
	down    bool
	cancel  bool
}

type kbdLLHookStruct struct {
	vkCode      uint32
	scanCode    uint32
	flags       uint32
	time        uint32
	dwExtraInfo uintptr
}

type App struct {
	ctx              context.Context
	whisperCtx       *C.struct_whisper_context
	audioBuffer      []float32
	mutex            sync.Mutex
	whisperMutex     sync.Mutex
	keyStateMutex    sync.RWMutex
	shortcutKeysDown bool
	isMicReady       bool
	loadedModelPath  string
	loadedEngine     string
	loadedGPU        string
}

func NewApp() *App {
	return &App{}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	cfg := loadConfig()
	if cfg.KeybindCaptureActive {
		cfg.KeybindCaptureActive = false
		saveConfig(cfg)
	}

	// 1. Apply click-through + no-focus-steal window styles
	go applyOverlayStyles()

	// 2. Prune audio cache and transcriptions — only at startup
	pruneAudioCache(cfg.AudioRetentionDays)
	pruneRecordings(cfg.TranscriptionRetentionDays)

	// 3. Open / create local SQLite database
	initDB()

	// 4. Initialize Whisper
	a.ensureActiveModel()

	// 5. Setup System Tray
	a.setupTray()

	// 6. Start Global Hook in a Goroutine
	go a.listenToKeyboard()
}

func (a *App) listenToKeyboard() {
	var (
		isRecording          = false
		isProcessing         = false
		lCtrlPressed         = false
		lWinPressed          = false
		acceptingUntil       time.Time
		keyMutex             sync.RWMutex
		key1Rawcode          uint16
		key2Rawcode          uint16
		keybindCaptureActive bool
	)

	// 7. Initialize Microphone persistently (don't init/uninit on every key press)
	mctx, err := malgo.InitContext(nil, malgo.ContextConfig{}, nil)
	if err != nil {
		fmt.Println("Error initializing malgo context:", err)
	}
	cfg := loadConfig()
	activeMicName := cfg.ActiveMicrophone

	var selectedID unsafe.Pointer
	if activeMicName != "" && activeMicName != "Default" {
		devices, err := mctx.Devices(malgo.Capture)
		if err == nil {
			for _, info := range devices {
				if info.Name() == activeMicName {
					selectedID = info.ID.Pointer()
					break
				}
			}
		}
	}

	deviceConfig := malgo.DefaultDeviceConfig(malgo.Capture)
	deviceConfig.Capture.Format = malgo.FormatF32
	deviceConfig.Capture.Channels = 1
	deviceConfig.SampleRate = 16000
	if selectedID != nil {
		deviceConfig.Capture.DeviceID = selectedID
	}

	var device *malgo.Device

	onRec := func(pSample2, pSample []byte, frameCount uint32) {
		a.mutex.Lock()
		active := isRecording || time.Now().Before(acceptingUntil)
		a.mutex.Unlock()

		if !active {
			return
		}
		if len(pSample) == 0 || frameCount == 0 {
			return
		}

		if !a.isMicReady {
			a.isMicReady = true
			runtime.EventsEmit(a.ctx, "recording-state", "listening")
		}

		samples := (*[1 << 30]float32)(unsafe.Pointer(&pSample[0]))[:frameCount]

		// Calculate volume for the UI visualizer
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

	device, err = malgo.InitDevice(mctx.Context, deviceConfig, malgo.DeviceCallbacks{Data: onRec})
	if err != nil {
		fmt.Println("Error initializing audio device:", err)
	}

	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	cfg = loadConfig()
	key1Rawcode = cfg.Keybind1Rawcode
	key2Rawcode = cfg.Keybind2Rawcode
	keybindCaptureActive = cfg.KeybindCaptureActive

	evChan := startSuppressingKeyboardHook(func() (uint16, uint16) {
		cfg := loadConfig()
		keyMutex.Lock()
		key1Rawcode = cfg.Keybind1Rawcode
		key2Rawcode = cfg.Keybind2Rawcode
		keybindCaptureActive = cfg.KeybindCaptureActive
		keyMutex.Unlock()
		if cfg.KeybindCaptureActive {
			return 0, 0
		}
		return cfg.Keybind1Rawcode, cfg.Keybind2Rawcode
	})

	for {
		select {
		case <-ticker.C:
			// Periodically refresh keybind configuration from disk
			cfg = loadConfig()
			keyMutex.Lock()
			key1Rawcode = cfg.Keybind1Rawcode
			key2Rawcode = cfg.Keybind2Rawcode
			keybindCaptureActive = cfg.KeybindCaptureActive
			keyMutex.Unlock()

			if cfg.ActiveMicrophone != activeMicName {
				activeMicName = cfg.ActiveMicrophone
				if device != nil {
					device.Uninit()
				}

				var selectedID unsafe.Pointer
				if activeMicName != "" && activeMicName != "Default" {
					devices, err := mctx.Devices(malgo.Capture)
					if err == nil {
						for _, info := range devices {
							if info.Name() == activeMicName {
								selectedID = info.ID.Pointer()
								break
							}
						}
					}
				}

				deviceConfig = malgo.DefaultDeviceConfig(malgo.Capture)
				deviceConfig.Capture.Format = malgo.FormatF32
				deviceConfig.Capture.Channels = 1
				deviceConfig.SampleRate = 16000
				if selectedID != nil {
					deviceConfig.Capture.DeviceID = selectedID
				}

				device, err = malgo.InitDevice(mctx.Context, deviceConfig, malgo.DeviceCallbacks{Data: onRec})
				if err != nil {
					fmt.Println("Error reinitializing audio device:", err)
				}
			}

			a.mutex.Lock()
			recordingNow := isRecording
			processingNow := isProcessing
			a.mutex.Unlock()
			if !recordingNow && !processingNow {
				a.ensureActiveModel()
			}

		case ev := <-evChan:
			cfg = loadConfig()
			keyMutex.Lock()
			key1Rawcode = cfg.Keybind1Rawcode
			key2Rawcode = cfg.Keybind2Rawcode
			keybindCaptureActive = cfg.KeybindCaptureActive
			keyMutex.Unlock()

			if ev.cancel {
				a.mutex.Lock()
				wasRecording := isRecording
				isRecording = false
				acceptingUntil = time.Time{}
				a.audioBuffer = nil
				a.mutex.Unlock()

				lCtrlPressed = false
				lWinPressed = false
				a.setShortcutKeysDown(false)

				if wasRecording {
					runtime.EventsEmit(a.ctx, "recording-done")
					go func() {
						time.Sleep(650 * time.Millisecond)
						runtime.WindowHide(a.ctx)
					}()
				}
				continue
			}

			keyMutex.RLock()
			currentKey1Rawcode := key1Rawcode
			currentKey2Rawcode := key2Rawcode
			currentKeybindCaptureActive := keybindCaptureActive
			keyMutex.RUnlock()
			if currentKeybindCaptureActive {
				lCtrlPressed = false
				lWinPressed = false
				a.setShortcutKeysDown(false)
				continue
			}

			if ev.rawcode == currentKey1Rawcode {
				if ev.down {
					lCtrlPressed = true
				} else {
					lCtrlPressed = false
				}
			} else if ev.rawcode == currentKey2Rawcode {
				if ev.down {
					lWinPressed = true
				} else {
					lWinPressed = false
				}
			}

			a.setShortcutKeysDown(lCtrlPressed || lWinPressed)
			shouldBeRecording := lCtrlPressed && lWinPressed

			a.mutex.Lock()
			recordingNow := isRecording
			processingNow := isProcessing
			a.mutex.Unlock()

			if shouldBeRecording && !recordingNow && !processingNow {
				a.mutex.Lock()
				isRecording = true
				a.isMicReady = false
				a.audioBuffer = make([]float32, 0)
				a.mutex.Unlock()

				// Show the window WITHOUT stealing focus
				go showWindowNoActivate()

				// Tell UI to show the INITIALIZING spinner
				runtime.EventsEmit(a.ctx, "recording-state", "initializing")

				if device != nil {
					if err := device.Start(); err != nil {
						fmt.Println("Error starting audio device:", err)
					}
				}

			} else if !shouldBeRecording && recordingNow {
				a.mutex.Lock()
				isRecording = false
				isProcessing = true
				acceptingUntil = time.Now().Add(400 * time.Millisecond)
				a.mutex.Unlock()

				// Tell UI to shrink and show processing spinner
				runtime.EventsEmit(a.ctx, "recording-state", "processing")

				// Keep accepting samples briefly after key release to capture trailing speech.
				go func() {
					defer func() {
						a.mutex.Lock()
						isProcessing = false
						a.mutex.Unlock()
					}()

					time.Sleep(400 * time.Millisecond)

					if device != nil {
						if err := device.Stop(); err != nil {
							fmt.Println("Error stopping audio device:", err)
						}
					}

					a.mutex.Lock()
					// Add a tiny silence pad just in case even with the 400ms trail it's below Whisper minimums
					padding := make([]float32, 1600)
					a.audioBuffer = append(a.audioBuffer, padding...)
					acceptingUntil = time.Time{}
					a.mutex.Unlock()

					a.transcribe()
				}()
			}
		} // close select
	} // close for
} // close func

func startSuppressingKeyboardHook(getHotkey func() (uint16, uint16)) <-chan keyEvent {
	events := make(chan keyEvent, 32)
	pressed := make(map[uint16]bool)
	var winDown bool
	var winOwned bool
	var winOwnedRawcode uint16
	var winReplayed bool
	var localFlowGesture bool
	var thirdKeySeen bool

	procCallNextHookEx := user32.NewProc("CallNextHookEx")
	procSetWindowsHookExW := user32.NewProc("SetWindowsHookExW")
	procGetMessageW := user32.NewProc("GetMessageW")

	hookProc := syscall.NewCallback(func(nCode int, wParam uintptr, lParam uintptr) uintptr {
		if nCode >= 0 {
			info := (*kbdLLHookStruct)(unsafe.Pointer(lParam))
			if info.flags&llkhfInjected != 0 {
				ret, _, _ := procCallNextHookEx.Call(0, uintptr(nCode), wParam, lParam)
				return ret
			}

			rawcode := normalizeRawcode(info.vkCode)
			isDown := wParam == wmKeyDown || wParam == wmSysKeyDown
			isUp := wParam == wmKeyUp || wParam == wmSysKeyUp

			if isDown || isUp {
				key1Rawcode, key2Rawcode := getHotkey()
				hotkeyUsesThisWin := isWinRawcode(rawcode) && (isSameHotkeyKey(rawcode, key1Rawcode) || isSameHotkeyKey(rawcode, key2Rawcode))
				isHotkeyKey := isSameHotkeyKey(rawcode, key1Rawcode) || isSameHotkeyKey(rawcode, key2Rawcode)
				otherHotkeyDown := isOtherHotkeyDown(pressed, rawcode, key1Rawcode, key2Rawcode)

				select {
				case events <- keyEvent{rawcode: rawcode, down: isDown}:
				default:
				}

				if isDown {
					pressed[rawcode] = true
				} else {
					delete(pressed, rawcode)
				}

				if isDown && winDown && winOwned && isHotkeyKey && !isWinRawcode(rawcode) {
					localFlowGesture = true
				}

				if hotkeyUsesThisWin {
					if isDown {
						if winDown && winOwned {
							localFlowGesture = localFlowGesture || otherHotkeyDown
							return 1
						}
						winDown = true
						winOwned = hotkeyUsesThisWin
						winOwnedRawcode = rawcode
						winReplayed = false
						localFlowGesture = localFlowGesture || otherHotkeyDown
						thirdKeySeen = false
						if winOwned {
							return 1
						}
					}
					if isUp {
						winDown = false
						if winOwned {
							if thirdKeySeen {
								if winReplayed {
									synthKey(rawcode, false)
								}
							} else if !localFlowGesture {
								synthKey(rawcode, true)
								synthKey(rawcode, false)
							}

							winOwned = false
							winOwnedRawcode = 0
							winReplayed = false
							localFlowGesture = false
							thirdKeySeen = false
							return 1
						}
					}

					ret, _, _ := procCallNextHookEx.Call(0, uintptr(nCode), wParam, lParam)
					return ret
				}

				if isWinRawcode(rawcode) {
					if isDown {
						winDown = true
					}
					if isUp {
						winDown = false
					}
				}

				if isDown && winDown && winOwned && !isHotkeyKey {
					thirdKeySeen = true
					if !winReplayed {
						synthKey(winOwnedRawcode, true)
						winReplayed = true
					}
					select {
					case events <- keyEvent{cancel: true}:
					default:
					}
				}
			}
		}

		ret, _, _ := procCallNextHookEx.Call(0, uintptr(nCode), wParam, lParam)
		return ret
	})

	go func() {
		hook, _, err := procSetWindowsHookExW.Call(whKeyboardLL, hookProc, 0, 0)
		if hook == 0 {
			fmt.Println("Error installing keyboard hook:", err)
			return
		}

		var msg struct {
			hwnd    uintptr
			message uint32
			wParam  uintptr
			lParam  uintptr
			time    uint32
			pt      struct{ x, y int32 }
		}
		for {
			ret, _, _ := procGetMessageW.Call(uintptr(unsafe.Pointer(&msg)), 0, 0, 0)
			if int32(ret) <= 0 {
				return
			}
		}
	}()

	return events
}

func normalizeRawcode(vkCode uint32) uint16 {
	switch vkCode {
	case 0x11:
		return vkLControl
	case 0x5B:
		return vkLWin
	case 0x5C:
		return vkRWin
	default:
		return uint16(vkCode)
	}
}

func isCtrlRawcode(rawcode uint16) bool {
	return rawcode == vkLControl || rawcode == vkRControl
}

func isWinRawcode(rawcode uint16) bool {
	return rawcode == vkLWin || rawcode == vkRWin
}

func isSameHotkeyKey(rawcode uint16, configured uint16) bool {
	return rawcode == configured
}

func isOtherHotkeyDown(pressed map[uint16]bool, rawcode uint16, key1Rawcode uint16, key2Rawcode uint16) bool {
	if isSameHotkeyKey(rawcode, key1Rawcode) {
		return pressed[key2Rawcode]
	}
	if isSameHotkeyKey(rawcode, key2Rawcode) {
		return pressed[key1Rawcode]
	}
	if isWinRawcode(rawcode) {
		if isWinRawcode(key1Rawcode) {
			return pressed[key2Rawcode]
		}
		if isWinRawcode(key2Rawcode) {
			return pressed[key1Rawcode]
		}
	}
	return false
}

func synthKey(rawcode uint16, down bool) {
	flags := uintptr(0)
	if !down {
		flags = keyeventfKeyup
	}
	procKeybdEvent := user32.NewProc("keybd_event")
	procKeybdEvent.Call(uintptr(rawcode), 0, flags, 0)
}

func (a *App) setShortcutKeysDown(down bool) {
	a.keyStateMutex.Lock()
	a.shortcutKeysDown = down
	a.keyStateMutex.Unlock()
}

func (a *App) waitForShortcutRelease(timeout time.Duration) {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		a.keyStateMutex.RLock()
		down := a.shortcutKeysDown
		a.keyStateMutex.RUnlock()
		if !down {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	fmt.Println("Timed out waiting for shortcut keys to release before paste")
}

func releasePasteModifiers() {
	robotgo.KeyToggle("command", "up")
	robotgo.KeyToggle("ctrl", "up")
}

func (a *App) transcribeOld() {
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
			saveRecording(filename, ts, durMs, text, 0)
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

func (a *App) getModelsDir() string {
	cfg := loadConfig()
	dataDir := getDataDir(cfg)
	dir := filepath.Join(dataDir, "models")
	_ = os.MkdirAll(dir, 0755)
	return dir
}

func (a *App) ensureActiveModel() {
	a.whisperMutex.Lock()
	defer a.whisperMutex.Unlock()

	cfg := loadConfig()
	activeModel := cfg.ActiveModel
	if activeModel == "" {
		activeModel = "ggml-tiny.en.bin"
	}
	engine := cfg.ProcessingEngine
	if engine != "vulkan" {
		engine = "cpu"
	}

	modelsDir := a.getModelsDir()
	targetPath := filepath.Join(modelsDir, activeModel)

	legacyActivePath := filepath.Join("models", activeModel)
	if !fileExists(targetPath) && fileExists(legacyActivePath) {
		if err := copyFile(legacyActivePath, targetPath); err == nil {
			_ = os.Remove(legacyActivePath)
		}
	}

	// If the active model file does not exist, fall back to another downloaded model.
	if _, err := os.Stat(targetPath); err != nil {
		found := false
		entries, _ := os.ReadDir(modelsDir)
		for _, entry := range entries {
			if !entry.IsDir() && filepath.Ext(entry.Name()) == ".bin" {
				targetPath = filepath.Join(modelsDir, entry.Name())
				activeModel = entry.Name()
				found = true
				break
			}
		}

		if !found {
			// Migrate one legacy model into the active data folder if needed.
			fallbackDir := "models"
			entries, _ = os.ReadDir(fallbackDir)
			for _, entry := range entries {
				if !entry.IsDir() && filepath.Ext(entry.Name()) == ".bin" {
					legacyPath := filepath.Join(fallbackDir, entry.Name())
					targetPath = filepath.Join(modelsDir, entry.Name())
					if err := copyFile(legacyPath, targetPath); err == nil {
						_ = os.Remove(legacyPath)
					} else {
						fmt.Printf("Failed to migrate legacy model %s: %v\n", legacyPath, err)
						continue
					}
					activeModel = entry.Name()
					found = true
					break
				}
			}
		}

		if found {
			// Update config to match the fallback active model
			cfg.ActiveModel = activeModel
			_ = saveConfig(cfg)
		} else {
			fmt.Println("No Whisper model file found anywhere!")
			return
		}
	}

	if a.loadedModelPath == targetPath && a.loadedEngine == engine && a.loadedGPU == cfg.SelectedGPU && a.whisperCtx != nil {
		return
	}

	fmt.Printf("Loading Whisper model: %s with %s engine (GPU: %s)...\n", targetPath, engine, cfg.SelectedGPU)
	if a.whisperCtx != nil {
		C.whisper_free(a.whisperCtx)
		a.whisperCtx = nil
		a.loadedModelPath = ""
		a.loadedEngine = ""
		a.loadedGPU = ""
	}

	modelPathC := C.CString(targetPath)
	defer C.free(unsafe.Pointer(modelPathC))
	params := C.whisper_context_default_params()
	params.use_gpu = C.bool(engine == "vulkan")
	gpuIndex := 0
	if engine == "vulkan" && cfg.SelectedGPU != "Default" {
		gpus := GetGPUDevicesList()
		for i, name := range gpus {
			if name == cfg.SelectedGPU {
				gpuIndex = i
				break
			}
		}
	}
	params.gpu_device = C.int(gpuIndex)
	a.whisperCtx = C.whisper_init_from_file_with_params(modelPathC, params)
	if a.whisperCtx == nil {
		fmt.Printf("Error initializing Whisper model from %s with %s engine\n", targetPath, engine)
	} else {
		a.loadedModelPath = targetPath
		a.loadedEngine = engine
		a.loadedGPU = cfg.SelectedGPU
		fmt.Printf("Successfully loaded Whisper model: %s with %s engine (GPU: %s)\n", targetPath, engine, cfg.SelectedGPU)
	}
}

func (a *App) transcribe() {
	recordedAt := time.Now()

	a.ensureActiveModel()

	a.mutex.Lock()
	if len(a.audioBuffer) == 0 {
		a.mutex.Unlock()

		fmt.Println("No audio captured for transcription")
		runtime.EventsEmit(a.ctx, "recording-done")
		time.Sleep(650 * time.Millisecond)
		runtime.WindowHide(a.ctx)
		return
	}

	// Snapshot buffer for cache saving. The raw WAV stays unaffected by input boost.
	cacheCopy := make([]float32, len(a.audioBuffer))
	copy(cacheCopy, a.audioBuffer)
	a.mutex.Unlock()

	// Duration in milliseconds: samples / sample_rate * 1000.
	durationMs := int64(len(cacheCopy)) * 1000 / 16000

	whisperBuf := cacheCopy
	cfg := loadConfig()
	if cfg.InputBoostEnabled && cfg.InputBoostGain > 1.0 {
		boosted := make([]float32, len(cacheCopy))
		for i, s := range cacheCopy {
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

	result := ""
	whisperFailed := false

	transcribeStart := time.Now()
	a.whisperMutex.Lock()
	if a.whisperCtx == nil {
		fmt.Println("Whisper context is nil; transcription skipped")
		whisperFailed = true
	} else {
		wParams := C.whisper_full_default_params(C.WHISPER_SAMPLING_GREEDY)
		wParams.translate = C.bool(false)

		modelLang := "en"

		langC := C.CString(modelLang)
		wParams.language = langC

		if code := C.whisper_full(a.whisperCtx, wParams, (*C.float)(unsafe.Pointer(&whisperBuf[0])), C.int(len(whisperBuf))); code != 0 {
			fmt.Println("Whisper transcription failed with code:", int(code), "samples:", len(whisperBuf), "duration_ms:", durationMs)
			whisperFailed = true
		} else {
			numSegments := int(C.whisper_full_n_segments(a.whisperCtx))
			for i := 0; i < numSegments; i++ {
				result += C.GoString(C.whisper_full_get_segment_text(a.whisperCtx, C.int(i)))
			}
		}
		C.free(unsafe.Pointer(langC))
	}
	a.whisperMutex.Unlock()
	transcribeTimeUs := time.Since(transcribeStart).Microseconds()

	result = strings.TrimSpace(result)
	isBlank := result == "" ||
		result == "[BLANK_AUDIO]" ||
		result == "(blank audio)" ||
		result == "[silence]" ||
		result == "(silence)"

	if isBlank {
		fmt.Println("Blank transcription; samples:", len(cacheCopy), "duration_ms:", durationMs, "whisper_failed:", whisperFailed)
	}

	go func(buf []float32, ts time.Time, durMs int64, text string, transTimeUs int64) {
		filename, err := saveAudioToCache(buf)
		if err != nil {
			fmt.Println("Error saving audio cache:", err)
			return
		}
		saveRecording(filename, ts, durMs, text, transTimeUs)
	}(cacheCopy, recordedAt, durationMs, result, transcribeTimeUs)

	if !isBlank && !whisperFailed {
		if err := clipboard.WriteAll(result); err != nil {
			fmt.Println("Error writing transcription to clipboard:", err)
		} else {
			a.waitForShortcutRelease(2 * time.Second)
			releasePasteModifiers()
			time.Sleep(350 * time.Millisecond)
			robotgo.KeyTap("v", "ctrl")
		}
	}

	runtime.EventsEmit(a.ctx, "recording-done")
	time.Sleep(650 * time.Millisecond)
	runtime.WindowHide(a.ctx)
}

func GetGPUDevicesList() []string {
	count := int(C.ggml_backend_vk_get_device_count())
	fmt.Printf("GetGPUDevicesList: count=%d\n", count)
	var list []string
	for i := 0; i < count; i++ {
		var desc [256]C.char
		C.ggml_backend_vk_get_device_description(C.int(i), &desc[0], 256)
		gpuName := C.GoString(&desc[0])
		fmt.Printf("GPU %d: %s\n", i, gpuName)
		list = append(list, gpuName)
	}
	return list
}
