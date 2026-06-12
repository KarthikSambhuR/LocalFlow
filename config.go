package main

import (
	"encoding/json"
	"os"
)

const configPath = "localflow_config.json"

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
	}

	data, err := os.ReadFile(configPath)
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
	return cfg
}

func saveConfig(cfg Config) error {
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(configPath, data, 0644)
}
