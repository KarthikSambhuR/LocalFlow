package main

import (
	"encoding/json"
	"os"
	"path/filepath"
)

func getBaseAppDir() string {
	dir, err := os.UserConfigDir()
	if err != nil {
		return "."
	}
	appDir := filepath.Join(dir, "LocalFlow")
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
	KeybindCaptureActive       bool    `json:"keybind_capture_active"`
	AudioRetentionDays         int     `json:"audio_retention_days"`
	TranscriptionRetentionDays int     `json:"transcription_retention_days"`
	ActiveMicrophone           string  `json:"active_microphone"`
	DataFolder                 string  `json:"data_folder"`
	ActiveModel                string  `json:"active_model"`
	ProcessingEngine           string  `json:"processing_engine"`
	SelectedGPU                string  `json:"selected_gpu"`

	// Window geometry — persisted so the home/settings window reopens at the same size.
	WindowWidth     int  `json:"window_width"`
	WindowHeight    int  `json:"window_height"`
	WindowMaximized bool `json:"window_maximized"`
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
		ActiveModel:                "ggml-tiny.en.bin",
		ProcessingEngine:           "cpu",
		SelectedGPU:                "Default",
		WindowWidth:                1100,
		WindowHeight:               720,
		WindowMaximized:            false,
	}

	// Migrate legacy config file if present in current directory but not in AppDir
	legacyPath := "localflow_config.json"
	newPath := getConfigPath()
	if _, err := os.Stat(newPath); err != nil {
		if _, errLegacy := os.Stat(legacyPath); errLegacy == nil {
			if data, errRead := os.ReadFile(legacyPath); errRead == nil {
				_ = os.WriteFile(newPath, data, 0644)
				_ = os.Remove(legacyPath)
			}
		}
	}

	data, err := os.ReadFile(newPath)
	if err != nil {
		return defaultCfg
	}

	var cfg Config
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
		cfg.ActiveModel = "ggml-tiny.en.bin"
	}
	if cfg.ProcessingEngine != "vulkan" {
		cfg.ProcessingEngine = "cpu"
	}
	if cfg.SelectedGPU == "" {
		cfg.SelectedGPU = "Default"
	}
	if cfg.WindowWidth < 860 {
		cfg.WindowWidth = 1100
	}
	if cfg.WindowHeight < 560 {
		cfg.WindowHeight = 720
	}
	return cfg
}

func saveConfig(cfg Config) error {
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(getConfigPath(), data, 0644)
}
