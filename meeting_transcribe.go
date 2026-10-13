package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"unsafe"
)

/*
#cgo CFLAGS: -I./lib
#cgo LDFLAGS: -L./lib/dll -lwhisper -lggml -lggml-base -lggml-cpu -lggml-vulkan -lstdc++ -lgomp -lpthread -lm
#include "whisper.h"
#include <stdlib.h>
*/
import "C"

var (
	meetingWhisperCtx   *C.struct_whisper_context
	meetingWhisperMutex sync.Mutex
	meetingLoadedModel  string
	meetingLoadedEngine string
)

func getMeetingWhisperContext(cfg Config, modelName string) *C.struct_whisper_context {
	meetingWhisperMutex.Lock()
	defer meetingWhisperMutex.Unlock()

	engine := cfg.ProcessingEngine
	if engine != "vulkan" {
		engine = "cpu"
	}

	if meetingWhisperCtx != nil && meetingLoadedModel == modelName && meetingLoadedEngine == engine {
		return meetingWhisperCtx
	}

	if meetingWhisperCtx != nil {
		C.whisper_free(meetingWhisperCtx)
		meetingWhisperCtx = nil
		meetingLoadedModel = ""
		meetingLoadedEngine = ""
	}

	dataDir := getDataDir(cfg)
	modelsDir := filepath.Join(dataDir, "models")
	targetPath := filepath.Join(modelsDir, modelName)

	if _, err := os.Stat(targetPath); err != nil {
		// Fall back to any downloaded .bin model
		entries, _ := os.ReadDir(modelsDir)
		for _, e := range entries {
			if !e.IsDir() && strings.HasSuffix(e.Name(), ".bin") {
				targetPath = filepath.Join(modelsDir, e.Name())
				modelName = e.Name()
				break
			}
		}
	}

	if _, err := os.Stat(targetPath); err != nil {
		fmt.Printf("[Meeting STT] No whisper model found at %s or in %s\n", targetPath, modelsDir)
		return nil
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

	ctx := C.whisper_init_from_file_with_params(modelPathC, params)
	if ctx == nil {
		// If Vulkan failed, fallback to CPU
		if engine == "vulkan" {
			fmt.Printf("[Meeting STT] Vulkan init failed for %s, falling back to CPU...\n", targetPath)
			params.use_gpu = C.bool(false)
			params.gpu_device = 0
			ctx = C.whisper_init_from_file_with_params(modelPathC, params)
			engine = "cpu"
		}
	}

	if ctx == nil {
		fmt.Printf("[Meeting STT] Failed to initialize whisper context from %s\n", targetPath)
		return nil
	}

	meetingWhisperCtx = ctx
	meetingLoadedModel = modelName
	meetingLoadedEngine = engine
	fmt.Printf("[Meeting STT] Successfully loaded Whisper model: %s (engine: %s)\n", modelName, engine)
	return meetingWhisperCtx
}

// transcribeMeetingChunk transcribes an audio chunk using either Conformer or Whisper,
// adhering to the user's active model and bilingual routing configuration.
func transcribeMeetingChunk(samples []float32) (string, string) {
	if len(samples) == 0 {
		return "", "en"
	}

	cfg := loadConfig()
	whisperBuf := samples

	if cfg.InputBoostEnabled && cfg.InputBoostGain > 1.0 {
		boosted := make([]float32, len(samples))
		for i, s := range samples {
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

	meetingModel := cfg.MeetingModel
	if meetingModel == "" {
		meetingModel = cfg.ActiveModel
	}
	if meetingModel == "" {
		meetingModel = "ggml-tiny.en.bin"
	}
	meetingBilingual := cfg.MeetingBilingual

	if IsNeedleWhistleActive(meetingModel) {
		whistlePath := ResolveWhistleModelPath(cfg)
		if err := LoadNeedleWhistle(whistlePath); err == nil {
			text, err := TranscribeNeedleWhistle(whisperBuf, "")
			if err == nil && text != "" {
				return cleanSoundTags(text), "en"
			}
		}
	}
	useConformer := false
	detectedLang := "en"

	if meetingBilingual {
		detectedLang = detectMeetingChunkLanguage(whisperBuf, cfg)
		useConformer = (detectedLang == "ml")
	} else if strings.Contains(meetingModel, "indicconformer") {
		useConformer = true
		detectedLang = "ml"
	} else if strings.HasSuffix(meetingModel, ".en.bin") {
		detectedLang = "en"
		useConformer = false
	} else {
		// Multilingual Whisper model (e.g. ggml-base.bin, ggml-small.bin, etc.)
		detectedLang = "auto"
		useConformer = false
	}

	if useConformer {
		_ = LoadConformerSessions()
		text, err := TranscribeIndicConformer(whisperBuf)
		if err == nil && text != "" {
			return cleanSoundTags(text), "ml"
		}
	}

	// Transcribe using meeting-specific Whisper model
	text := transcribeWithWhisper(whisperBuf, detectedLang)
	return cleanSoundTags(text), detectedLang
}

func detectMeetingChunkLanguage(samples []float32, cfg Config) string {
	targetModel := cfg.BilingualWhisperModel
	if targetModel == "" {
		targetModel = "ggml-base.bin"
	}
	ctx := getMeetingWhisperContext(cfg, targetModel)
	if ctx == nil {
		return "en"
	}

	meetingWhisperMutex.Lock()
	defer meetingWhisperMutex.Unlock()

	if code := C.whisper_pcm_to_mel(ctx, (*C.float)(unsafe.Pointer(&samples[0])), C.int(len(samples)), C.int(4)); code == 0 {
		langID := C.whisper_lang_auto_detect(ctx, 0, C.int(4), nil)
		if langID >= 0 {
			lang := C.GoString(C.whisper_lang_str(langID))
			if lang == "ml" {
				return "ml"
			}
		}
	}
	return "en"
}

func transcribeWithWhisper(samples []float32, lang string) string {
	cfg := loadConfig()
	modelName := cfg.MeetingModel
	if modelName == "" {
		modelName = cfg.ActiveModel
	}
	if cfg.MeetingBilingual && cfg.BilingualWhisperModel != "" {
		modelName = cfg.BilingualWhisperModel
	}
	if modelName == "" {
		modelName = "ggml-tiny.en.bin"
	}

	ctx := getMeetingWhisperContext(cfg, modelName)
	if ctx == nil {
		fmt.Println("[Meeting STT] getMeetingWhisperContext returned nil")
		return ""
	}

	meetingWhisperMutex.Lock()
	defer meetingWhisperMutex.Unlock()

	wParams := C.whisper_full_default_params(C.WHISPER_SAMPLING_GREEDY)
	wParams.translate = C.bool(false)
	wParams.suppress_blank = C.bool(true)
	wParams.suppress_nst = C.bool(true)
	wParams.no_speech_thold = C.float(0.7)

	langC := C.CString(lang)
	defer C.free(unsafe.Pointer(langC))
	if strings.HasSuffix(modelName, ".en.bin") {
		wParams.language = nil
	} else {
		wParams.language = langC
	}

	if code := C.whisper_full(ctx, wParams, (*C.float)(unsafe.Pointer(&samples[0])), C.int(len(samples))); code != 0 {
		fmt.Printf("[Meeting STT] whisper_full failed with code: %d\n", int(code))
		return ""
	}

	numSegments := int(C.whisper_full_n_segments(ctx))
	var result strings.Builder
	for i := 0; i < numSegments; i++ {
		result.WriteString(C.GoString(C.whisper_full_get_segment_text(ctx, C.int(i))))
		result.WriteString(" ")
	}

	trimmed := strings.TrimSpace(result.String())
	fmt.Printf("[Meeting STT] Transcribed chunk (%d samples, lang=%s): '%s'\n", len(samples), lang, trimmed)
	return trimmed
}
