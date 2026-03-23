package main

import (
	"encoding/json"
	"os"
)

const configPath = "localflow_config.json"

// Config holds user-configurable settings shared between the pill and home processes via disk.
type Config struct {
	InputBoostEnabled bool    `json:"input_boost_enabled"`
	InputBoostGain    float32 `json:"input_boost_gain"`
}

func loadConfig() Config {
	data, err := os.ReadFile(configPath)
	if err != nil {
		return Config{InputBoostEnabled: false, InputBoostGain: 1.0}
	}
	var cfg Config
	if err := json.Unmarshal(data, &cfg); err != nil {
		return Config{InputBoostEnabled: false, InputBoostGain: 1.0}
	}
	if cfg.InputBoostGain < 1.0 {
		cfg.InputBoostGain = 1.0
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
