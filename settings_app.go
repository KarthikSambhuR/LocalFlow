package main

import (
	"context"
	"os"
	"path/filepath"
	"runtime"

	"github.com/gen2brain/malgo"
	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
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

func (s *SettingsApp) GetMicrophones() []string {
	mctx, err := malgo.InitContext(nil, malgo.ContextConfig{}, nil)
	if err != nil {
		return []string{"Default"}
	}
	defer mctx.Free()
	devices, err := mctx.Devices(malgo.Capture)
	if err != nil {
		return []string{"Default"}
	}
	out := []string{"Default"}
	for _, info := range devices {
		out = append(out, info.Name())
	}
	return out
}

func (s *SettingsApp) SetMicrophone(name string) {
	cfg := loadConfig()
	cfg.ActiveMicrophone = name
	saveConfig(cfg)
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

func (s *SettingsApp) SelectDataFolder() (string, error) {
	return wailsRuntime.OpenDirectoryDialog(s.ctx, wailsRuntime.OpenDialogOptions{
		Title: "Select LocalFlow Data Folder",
	})
}

func (s *SettingsApp) SetDataFolder(path string) error {
	cfg := loadConfig()
	if cfg.DataFolder == path {
		return nil
	}

	// Create the new folder if it doesn't exist
	err := os.MkdirAll(path, 0755)
	if err != nil {
		return err
	}

	oldDataDir := "."
	if cfg.DataFolder != "" && cfg.DataFolder != "Default" {
		oldDataDir = cfg.DataFolder
	}

	oldDbPath := filepath.Join(oldDataDir, "localflow.db")
	newDbPath := filepath.Join(path, "localflow.db")

	// 1. Close current database connection
	closeDB()

	// 2. Copy SQLite database file if it exists at old location
	if _, err := os.Stat(oldDbPath); err == nil {
		dbData, err := os.ReadFile(oldDbPath)
		if err == nil {
			_ = os.WriteFile(newDbPath, dbData, 0644)
		}
	}

	// 3. Copy WAV files from old audio_cache to new audio_cache
	oldAudioDir := filepath.Join(oldDataDir, "audio_cache")
	newAudioDir := filepath.Join(path, "audio_cache")
	_ = os.MkdirAll(newAudioDir, 0755)

	entries, err := os.ReadDir(oldAudioDir)
	if err == nil {
		for _, entry := range entries {
			if !entry.IsDir() && filepath.Ext(entry.Name()) == ".wav" {
				oldFile := filepath.Join(oldAudioDir, entry.Name())
				newFile := filepath.Join(newAudioDir, entry.Name())
				fileData, err := os.ReadFile(oldFile)
				if err == nil {
					_ = os.WriteFile(newFile, fileData, 0644)
					_ = os.Remove(oldFile)
				}
			}
		}
	}

	// Update config
	cfg.DataFolder = path
	saveConfig(cfg)

	// 4. Re-open / initialize database at new path
	return initDB()
}
