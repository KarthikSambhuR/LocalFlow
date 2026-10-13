package main

/*
#cgo CFLAGS: -I./lib
#cgo LDFLAGS: -L./lib/dll -lneedle3
#include "needle.h"
#include <stdlib.h>
*/
import "C"

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"unsafe"
)

var (
	needleMutex            sync.Mutex
	loadedNeedleModelPath  string
	loadedNeedleCactBuffer []byte
)

type needleTranscriptionResult struct {
	Text      string  `json:"text"`
	Language  string  `json:"language"`
	TTFTMs    float64 `json:"ttft_ms"`
	DecodeTPS float64 `json:"decode_tps"`
}

// IsNeedleWhistleActive returns true if the specified model is the Cactus Whistle .cact model.
func IsNeedleWhistleActive(modelName string) bool {
	return modelName == "whistle.cact" || strings.HasSuffix(modelName, ".cact")
}

// ResolveWhistleModelPath locates whistle.cact in data/models, models, or fallback paths.
func ResolveWhistleModelPath(cfg Config) string {
	dataDir := getDataDir(cfg)
	modelsDir := filepath.Join(dataDir, "models")
	targetPath := filepath.Join(modelsDir, "whistle.cact")
	if fileExists(targetPath) {
		return targetPath
	}
	legacyPath := filepath.Join("models", "whistle.cact")
	if fileExists(legacyPath) {
		return legacyPath
	}
	scratchPath := filepath.Join("scratch", "whistle.cact")
	if fileExists(scratchPath) {
		return scratchPath
	}
	return targetPath
}

// LoadNeedleWhistle loads a .cact model (such as whistle.cact) into the process memory using cgo.
func LoadNeedleWhistle(modelPath string) error {
	needleMutex.Lock()
	defer needleMutex.Unlock()

	// If already loaded and speech capability is present, reuse it
	if loadedNeedleModelPath == modelPath && (int(C.needle_models())&C.NEEDLE_SPEECH != 0) {
		return nil
	}

	data, err := os.ReadFile(modelPath)
	if err != nil {
		return fmt.Errorf("failed to read Whistle model at %s: %w", modelPath, err)
	}

	// Retain the slice so Go's GC does not collect the buffer while in use by C engine
	loadedNeedleCactBuffer = data

	ret := C.needle_load((*C.uchar)(unsafe.Pointer(&loadedNeedleCactBuffer[0])), C.ulonglong(len(loadedNeedleCactBuffer)))
	if int(ret) < 0 {
		errMsg := "unknown error"
		if cErr := C.needle_last_error(); cErr != nil {
			errMsg = C.GoString(cErr)
		}
		return fmt.Errorf("needle_load failed (code %d): %s", int(ret), errMsg)
	}

	models := int(C.needle_models())
	if models&C.NEEDLE_SPEECH == 0 {
		return fmt.Errorf("loaded model does not provide speech ASR capabilities (needle_models=%d)", models)
	}

	loadedNeedleModelPath = modelPath
	fmt.Printf("[Needle Whistle] Successfully loaded Whistle model from %s (%d bytes, models=%d)\n", modelPath, len(data), models)
	return nil
}

// UnloadNeedleWhistle resets the needle runtime and frees loaded model memory.
func UnloadNeedleWhistle() {
	needleMutex.Lock()
	defer needleMutex.Unlock()

	C.needle_reset()
	loadedNeedleModelPath = ""
	loadedNeedleCactBuffer = nil
}

// TranscribeNeedleWhistle transcribes 16kHz float32 mono PCM samples using the Cactus Whistle engine.
func TranscribeNeedleWhistle(samples []float32, lang string) (string, error) {
	if len(samples) == 0 {
		return "", nil
	}

	needleMutex.Lock()
	defer needleMutex.Unlock()

	if int(C.needle_models())&C.NEEDLE_SPEECH == 0 {
		return "", fmt.Errorf("needle speech model is not loaded")
	}

	outBuf := make([]byte, 65536)

	var cLang *C.char
	validLangs := map[string]bool{"en": true, "de": true, "fr": true, "es": true, "it": true, "nl": true, "pl": true}
	if validLangs[lang] {
		cLang = C.CString(lang)
		defer C.free(unsafe.Pointer(cLang))
	}

	nTokens := C.needle_transcribe(
		(*C.float)(unsafe.Pointer(&samples[0])),
		C.int(len(samples)),
		cLang,
		nil,      // keywords
		C.int(0), // word_timestamps: 0 for dictation
		(*C.char)(unsafe.Pointer(&outBuf[0])),
		C.int(len(outBuf)),
	)

	if int(nTokens) < 0 {
		errMsg := "unknown error"
		if cErr := C.needle_last_error(); cErr != nil {
			errMsg = C.GoString(cErr)
		}
		return "", fmt.Errorf("needle_transcribe failed (code %d): %s", int(nTokens), errMsg)
	}

	cStr := C.GoString((*C.char)(unsafe.Pointer(&outBuf[0])))
	if cStr == "" {
		return "", nil
	}

	var res needleTranscriptionResult
	if err := json.Unmarshal([]byte(cStr), &res); err != nil {
		return cleanSoundTags(cStr), nil
	}

	return cleanSoundTags(res.Text), nil
}
