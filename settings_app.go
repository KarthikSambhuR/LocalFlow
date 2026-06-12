package main

import (
	"context"
	"os"
	"path/filepath"
	"runtime"
)

// SettingsApp is a lightweight app struct for the settings window.
type SettingsApp struct {
	ctx          context.Context
	InitialRoute string
}

func NewSettingsApp(route string) *SettingsApp {
	return &SettingsApp{InitialRoute: route}
}

func (s *SettingsApp) startup(ctx context.Context) {
	s.ctx = ctx
	initDB()
	cfg := loadConfig()
	pruneAudioCache(cfg.AudioRetentionDays)
	pruneRecordings(cfg.TranscriptionRetentionDays)
}

func (s *SettingsApp) SetRetention(audioDays int, transcriptionDays int) {
	cfg := loadConfig()
	cfg.AudioRetentionDays = audioDays
	cfg.TranscriptionRetentionDays = transcriptionDays
	saveConfig(cfg)
}

func (s *SettingsApp) PurgeNow() {
	// 1. Delete all WAV files in the audio cache directory
	entries, err := os.ReadDir(audioCacheDir)
	if err == nil {
		for _, entry := range entries {
			if !entry.IsDir() && filepath.Ext(entry.Name()) == ".wav" {
				_ = os.Remove(filepath.Join(audioCacheDir, entry.Name()))
			}
		}
	}
	// 2. Clear all rows from recordings table
	if db != nil {
		_, _ = db.Exec("DELETE FROM recordings")
	}
}

func (s *SettingsApp) GetInitialRoute() string {
	return s.InitialRoute
}

func (s *SettingsApp) GetRecordings() []Recording {
	recs, _ := GetRecordings()
	return recs
}

func (s *SettingsApp) GetAnalytics() []Analytics {
	an, _ := GetAnalytics()
	return an
}

func (s *SettingsApp) GetConfig() Config {
	return loadConfig()
}

func (s *SettingsApp) SetInputBoost(enabled bool, gain float32) {
	cfg := loadConfig()
	cfg.InputBoostEnabled = enabled
	cfg.InputBoostGain = gain
	saveConfig(cfg)
}

func (s *SettingsApp) SetKeybinds(key1 uint16, name1 string, key2 uint16, name2 string) {
	cfg := loadConfig()
	cfg.Keybind1Rawcode = key1
	cfg.Keybind1Name = name1
	cfg.Keybind2Rawcode = key2
	cfg.Keybind2Name = name2
	cfg.KeybindCaptureActive = false
	saveConfig(cfg)
}

func (s *SettingsApp) SetKeybindCaptureActive(active bool) {
	cfg := loadConfig()
	cfg.KeybindCaptureActive = active
	saveConfig(cfg)
}

func (s *SettingsApp) SetStartOnStartup(enabled bool) {
	cfg := loadConfig()
	cfg.StartOnStartup = enabled
	saveConfig(cfg)
	setAutoStart(enabled)
}

func (s *SettingsApp) GetPlatform() string {
	return runtime.GOOS
}
