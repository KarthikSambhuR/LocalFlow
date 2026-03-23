package main

import (
	"context"
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
	// Note: audio is served by the Wails AssetServer handler in main.go (/audio/<file>)
	// No separate HTTP server needed.
}

func (s *SettingsApp) GetInitialRoute() string {
	return s.InitialRoute
}

func (s *SettingsApp) GetRecordings() []Recording {
	recs, _ := GetRecordings()
	return recs
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

func (s *SettingsApp) GetPlatform() string {
	return runtime.GOOS
}
