package main

/*
#cgo CFLAGS: -I./lib
#cgo LDFLAGS: -L./lib -lwhisper -lggml -lggml-base -lggml-cpu -static -lstdc++ -lgomp -lpthread -lm
#include "whisper.h"
#include <stdlib.h>
*/
import "C"
import (
	"fmt"
	"sync"
	"unsafe"

	"github.com/atotto/clipboard"
	"github.com/gen2brain/malgo"
	"github.com/go-vgo/robotgo"
	hook "github.com/robotn/gohook"
)

var (
	audioBuffer []float32
	bufferMutex sync.Mutex
)

func main() {
	// 1. Initialize Whisper
	modelPath := C.CString("models/ggml-small.en.bin")
	defer C.free(unsafe.Pointer(modelPath))

	params := C.whisper_context_default_params()
	ctx := C.whisper_init_from_file_with_params(modelPath, params)
	if ctx == nil {
		fmt.Println("❌ Error: Could not load Whisper model! Check if models/ggml-tiny.en.bin exists.")
		return
	}
	defer C.whisper_free(ctx)

	// 2. Initialize Audio Context
	mctx, err := malgo.InitContext(nil, malgo.ContextConfig{}, nil)
	if err != nil {
		fmt.Println("❌ Audio Init Error:", err)
		return
	}
	defer mctx.Uninit()

	deviceConfig := malgo.DefaultDeviceConfig(malgo.Capture)
	deviceConfig.Capture.Format = malgo.FormatF32
	deviceConfig.Capture.Channels = 1
	deviceConfig.SampleRate = 16000

	var device *malgo.Device
	isRecording := false

	fmt.Println("🚀 LocalFlow Active!")
	fmt.Println("Hold 'Caps Lock' to speak, release to transcribe...")

	// 3. Start Global Hook
	evChan := hook.Start()
	defer hook.End()

	for ev := range evChan {
		// 20 is the Rawcode for Caps Lock. Use 62 for F4.
		if ev.Rawcode == 20 {
			if ev.Kind == hook.KeyDown && !isRecording {
				isRecording = true
				audioBuffer = []float32{} // Clear old data
				fmt.Print("\r🔴 Recording...          ")

				onRec := func(pSample2, pSample []byte, frameCount uint32) {
					samples := (*[1 << 30]float32)(unsafe.Pointer(&pSample[0]))[:frameCount]
					bufferMutex.Lock()
					audioBuffer = append(audioBuffer, samples...)
					bufferMutex.Unlock()
				}

				captureCallbacks := malgo.DeviceCallbacks{Data: onRec}
				device, _ = malgo.InitDevice(mctx.Context, deviceConfig, captureCallbacks)
				device.Start()

			} else if ev.Kind == hook.KeyUp && isRecording {
				isRecording = false
				if device != nil {
					device.Stop()
					device.Uninit()
				}
				fmt.Print("\r⌛ Transcribing...       ")

				// 4. Run Whisper Inference
				wParams := C.whisper_full_default_params(C.WHISPER_SAMPLING_GREEDY)

				bufferMutex.Lock()
				if len(audioBuffer) > 0 {
					C.whisper_full(ctx, wParams, (*C.float)(unsafe.Pointer(&audioBuffer[0])), C.int(len(audioBuffer)))

					// 5. Extract Result
					numSegments := int(C.whisper_full_n_segments(ctx))
					resultText := ""
					for i := 0; i < numSegments; i++ {
						resultText += C.GoString(C.whisper_full_get_segment_text(ctx, C.int(i)))
					}

					if resultText != "" {
						fmt.Printf("\r✨ Result: %s\n", resultText)
						clipboard.WriteAll(resultText)
						robotgo.TypeStr(resultText) // Types into focused window
					}
				}
				bufferMutex.Unlock()
				fmt.Println("Ready for next input...")
			}
		}
	}
}
