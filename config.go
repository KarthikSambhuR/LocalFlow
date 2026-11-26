package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

var (
	configCacheMu      sync.RWMutex
	cachedConfig       Config
	cachedConfigPath   string
	cachedConfigMod    time.Time
	cachedConfigLoaded bool
)

func getBaseAppDir() string {
	exePath, err := os.Executable()
	if err != nil {
		return "data"
	}
	exeLower := strings.ToLower(exePath)
	if strings.Contains(exeLower, "temp") || strings.Contains(exeLower, "go-build") {
		for _, candidate := range []string{
			filepath.Join("build", "bin", "data"),
			"data",
		} {
			if _, err := os.Stat(filepath.Join(candidate, "localflow_config.json")); err == nil {
				abs, errAbs := filepath.Abs(candidate)
				if errAbs == nil {
					return abs
				}
				return candidate
			}
		}
	}
	appDir := filepath.Join(filepath.Dir(exePath), "data")
	_ = os.MkdirAll(appDir, 0755)
	return appDir
}

func getConfigPath() string {
	return filepath.Join(getBaseAppDir(), "localflow_config.json")
}

// Config holds user-configurable settings shared between the pill and home processes via disk.
type Config struct {
	InputBoostEnabled          bool    `json:"input_boost_enabled"`
	InputBoostGain             float32 `json:"input_boost_gain"`
	Keybind1Rawcode            uint16  `json:"keybind1_rawcode"`
	Keybind2Rawcode            uint16  `json:"keybind2_rawcode"`
	Keybind1Name               string  `json:"keybind1_name"`
	Keybind2Name               string  `json:"keybind2_name"`
	StartOnStartup             bool    `json:"start_on_startup"`
	StartMinimized             bool    `json:"start_minimized"`
	KeybindCaptureActive       bool    `json:"keybind_capture_active"`
	AudioRetentionDays         int     `json:"audio_retention_days"`
	TranscriptionRetentionDays int     `json:"transcription_retention_days"`
	ActiveMicrophone           string  `json:"active_microphone"`
	DataFolder                 string  `json:"data_folder"`
	ActiveModel                string  `json:"active_model"`
	ProcessingEngine           string  `json:"processing_engine"`
	SelectedGPU                string  `json:"selected_gpu"`
	LLMEnabled                 bool    `json:"llm_enabled"`
	LLMActiveModel             string  `json:"llm_active_model"`
	LLMRefinementMode          string  `json:"llm_refinement_mode"`
	LLMTone                    string  `json:"llm_tone"`
	LLMContextSize             int     `json:"llm_context_size"`
	LLMEnableThinking          bool    `json:"llm_enable_thinking"`
	PhoneticDictEnabled        bool    `json:"phonetic_dict_enabled"`
	ManglishEnabled            bool    `json:"manglish_enabled"`
	ManglishExample1           string  `json:"manglish_example_1"`
	ManglishExample2           string  `json:"manglish_example_2"`
	ManglishExample3           string  `json:"manglish_example_3"`
	ManglishExample4           string  `json:"manglish_example_4"`
	ManglishExample5           string  `json:"manglish_example_5"`
	BilingualRoutingEnabled    bool    `json:"bilingual_routing_enabled"`
	BilingualWhisperModel      string  `json:"bilingual_whisper_model"`
	BilingualConformerModel    string  `json:"bilingual_conformer_model"`
	GemmaAudioLanguage         string  `json:"gemma_audio_language"`
	GemmaAudioManglish         bool    `json:"gemma_audio_manglish"`

	// Meeting-specific model configurations (independent of user dictation settings)
	MeetingModel               string  `json:"meeting_model"`
	MeetingBilingual           bool    `json:"meeting_bilingual"`
	MeetingLLMModel            string  `json:"meeting_llm_model"`

	// Window geometry — persisted so the home/settings window reopens at the same size.
	WindowWidth     int    `json:"window_width"`
	WindowHeight    int    `json:"window_height"`
	WindowMaximized bool   `json:"window_maximized"`
	PillStyle       string `json:"pill_style"`
}

func loadConfig() Config {
	defaultCfg := Config{
		InputBoostEnabled:          false,
		InputBoostGain:             1.0,
		Keybind1Rawcode:            162, // LCtrl
		Keybind2Rawcode:            91,  // LWin
		Keybind1Name:               "Ctrl",
		Keybind2Name:               "Win",
		AudioRetentionDays:         7,
		TranscriptionRetentionDays: 30,
		ActiveMicrophone:           "Default",
		DataFolder:                 "Default",
		ActiveModel:                "whistle.cact",
		ProcessingEngine:           "cpu",
		SelectedGPU:                "Default",
		LLMEnabled:                 false,
		LLMActiveModel:             "Qwen3-0.6B-UD-Q4_K_XL.gguf",
		LLMRefinementMode:          "low",
		LLMTone:                    "auto",
		LLMContextSize:             4096,
		LLMEnableThinking:          false,
		PhoneticDictEnabled:        true,
		ManglishEnabled:            false,
		ManglishExample1:           "Hello, sukhamano enth cheyyunnu?",
		ManglishExample2:           "Enik naale varaan pattilla.",
		ManglishExample3:           "Nee naale collegil varunnundo? Namukku orumichu pokam.",
		ManglishExample4:           "Njan aa kaaryam avalodu paranju, pakshe avalkku manassilayilla.",
		ManglishExample5:           "Nee aa file enikk WhatsAppil ayachu tharumo? Njan ippozhe download cheyyam.",
		BilingualRoutingEnabled:    false,
		BilingualWhisperModel:      "ggml-tiny.en.bin",
		BilingualConformerModel:    "indicconformer.int8.onnx",
		GemmaAudioLanguage:         "auto",
		GemmaAudioManglish:         false,
		MeetingModel:               "ggml-tiny.en.bin",
		MeetingBilingual:           false,
		MeetingLLMModel:            "gemma-4-E2B-it-UD-Q4_K_XL.gguf",
		WindowWidth:                1100,
		WindowHeight:               720,
		WindowMaximized:            false,
		PillStyle:                  "bars",
	}

	newPath := getConfigPath()
	stat, statErr := os.Stat(newPath)
	if statErr == nil {
		configCacheMu.RLock()
		if cachedConfigLoaded && cachedConfigPath == newPath && stat.ModTime().Equal(cachedConfigMod) {
			cfg := cachedConfig
			configCacheMu.RUnlock()
			return cfg
		}
		configCacheMu.RUnlock()
	}

	// Migrate legacy config file if present in current directory but not in AppDir
	legacyPath := "localflow_config.json"
	if statErr != nil {
		if _, errLegacy := os.Stat(legacyPath); errLegacy == nil {
			if data, errRead := os.ReadFile(legacyPath); errRead == nil {
				_ = os.WriteFile(newPath, data, 0644)
				_ = os.Remove(legacyPath)
				stat, statErr = os.Stat(newPath)
			}
		}
	}

	data, err := os.ReadFile(newPath)
	if err != nil {
		return defaultCfg
	}

	cfg := defaultCfg
	if err := json.Unmarshal(data, &cfg); err != nil {
		return defaultCfg
	}

	if cfg.InputBoostGain < 1.0 {
		cfg.InputBoostGain = 1.0
	}
	if cfg.Keybind1Rawcode == 0 {
		cfg.Keybind1Rawcode = 162
	}
	if cfg.Keybind2Rawcode == 0 {
		cfg.Keybind2Rawcode = 91
	}
	if cfg.AudioRetentionDays == 0 {
		cfg.AudioRetentionDays = 7
	}
	if cfg.TranscriptionRetentionDays == 0 {
		cfg.TranscriptionRetentionDays = 30
	}
	if cfg.ActiveMicrophone == "" {
		cfg.ActiveMicrophone = "Default"
	}
	if cfg.DataFolder == "" {
		cfg.DataFolder = "Default"
	}
	if cfg.ActiveModel == "" {
		cfg.ActiveModel = "whistle.cact"
	}
	if cfg.ProcessingEngine != "vulkan" {
		cfg.ProcessingEngine = "cpu"
	}
	if cfg.SelectedGPU == "" {
		cfg.SelectedGPU = "Default"
	}
	if cfg.LLMActiveModel == "" {
		cfg.LLMActiveModel = "Qwen3-0.6B-UD-Q4_K_XL.gguf"
	}
	cfg.LLMRefinementMode = normalizeLLMRefinementMode(cfg.LLMRefinementMode)
	cfg.LLMTone = normalizeLLMTone(cfg.LLMTone)
	cfg.LLMContextSize = normalizeLLMContextSize(cfg.LLMContextSize)
	if cfg.WindowWidth < 860 {
		cfg.WindowWidth = 1100
	}
	if cfg.WindowHeight < 560 {
		cfg.WindowHeight = 720
	}
	if cfg.ManglishExample1 == "" {
		cfg.ManglishExample1 = "Hello, sukhamano enth cheyyunnu?"
	}
	if cfg.ManglishExample2 == "" {
		cfg.ManglishExample2 = "Enik naale varaan pattilla."
	}
	if cfg.ManglishExample3 == "" {
		cfg.ManglishExample3 = "Nee naale collegil varunnundo? Namukku orumichu pokam."
	}
	if cfg.ManglishExample4 == "" {
		cfg.ManglishExample4 = "Njan aa kaaryam avalodu paranju, pakshe avalkku manassilayilla."
	}
	if cfg.ManglishExample5 == "" {
		cfg.ManglishExample5 = "Nee aa file enikk WhatsAppil ayachu tharumo? Njan ippozhe download cheyyam."
	}
	if cfg.BilingualWhisperModel == "" {
		cfg.BilingualWhisperModel = "ggml-tiny.en.bin"
	}
	if cfg.GemmaAudioLanguage == "" {
		cfg.GemmaAudioLanguage = "auto"
	}
	if cfg.BilingualConformerModel == "" {
		cfg.BilingualConformerModel = "indicconformer.int8.onnx"
	}
	cfg.PillStyle = normalizePillStyle(cfg.PillStyle)

	if statErr == nil {
		configCacheMu.Lock()
		cachedConfig = cfg
		cachedConfigPath = newPath
		cachedConfigMod = stat.ModTime()
		cachedConfigLoaded = true
		configCacheMu.Unlock()
	}
	return cfg
}

func normalizeLLMRefinementMode(mode string) string {
	switch strings.ToLower(strings.TrimSpace(mode)) {
	case "minimal", "low", "medium", "high":
		return strings.ToLower(strings.TrimSpace(mode))
	default:
		return "low"
	}
}

func normalizeLLMTone(tone string) string {
	switch strings.ToLower(strings.TrimSpace(tone)) {
	case "auto", "casual", "concise", "professional":
		return strings.ToLower(strings.TrimSpace(tone))
	default:
		return "auto"
	}
}

// normalizeLLMContextSize clamps to the nearest valid power-of-2 in [2048, 32768].
func normalizeLLMContextSize(size int) int {
	valid := []int{2048, 4096, 8192, 16384, 32768}
	for _, v := range valid {
		if size <= v {
			return v
		}
	}
	return valid[len(valid)-1]
}

func normalizePillStyle(style string) string {
	switch strings.ToLower(strings.TrimSpace(style)) {
	case "bars", "spectrum", "wave", "bubble":
		return strings.ToLower(strings.TrimSpace(style))
	default:
		return "bars"
	}
}

func saveConfig(cfg Config) error {
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	cfgPath := getConfigPath()
	if err := os.WriteFile(cfgPath, data, 0644); err != nil {
		return err
	}
	if stat, err := os.Stat(cfgPath); err == nil {
		configCacheMu.Lock()
		cachedConfig = cfg
		cachedConfigPath = cfgPath
		cachedConfigMod = stat.ModTime()
		cachedConfigLoaded = true
		configCacheMu.Unlock()
	}
	return nil
}
