package main

import (
	"embed"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"syscall"
	"unsafe"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/windows"
)

var (
	kernel32    = syscall.NewLazyDLL("kernel32.dll")
	createMutex = kernel32.NewProc("CreateMutexW")
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	// Check if this is being launched as a Settings or Home window
	checkMutex := true
	for _, arg := range os.Args[1:] {
		if arg == "--settings" {
			runSettingsWindow("settings")
			return
		}
		if arg == "--home" {
			runSettingsWindow("home")
			return
		}
		if strings.Contains(arg, "wails") || strings.HasPrefix(arg, "-") {
			checkMutex = false
		}
	}

	// Default: run as the invisible pill overlay
	runPillOverlay(checkMutex)
}

// runPillOverlay is the main transparent fullscreen ghost window for dictation.
func runPillOverlay(checkMutex bool) {
	if checkMutex {
		name, _ := syscall.UTF16PtrFromString("LocalFlowPillMutex")
		_, _, mutexErr := createMutex.Call(0, 1, uintptr(unsafe.Pointer(name)))
		if mutexErr != nil && mutexErr.(syscall.Errno) == 183 { // ERROR_ALREADY_EXISTS
			println("LocalFlow Pill Overlay is already running.")
			return
		}
	}

	app := NewApp()

	err := wails.Run(&options.App{
		Title:             "LocalFlow",
		Width:             1920,
		Height:            1080,
		Frameless:         true,
		AlwaysOnTop:       true,
		HideWindowOnClose: true,
		StartHidden:       true,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 0, G: 0, B: 0, A: 0},
		OnStartup:        app.startup,
		Bind: []interface{}{
			app,
		},
		Windows: &windows.Options{
			WebviewIsTransparent:              true,
			WindowIsTranslucent:               false,
			DisableFramelessWindowDecorations: true,
		},
	})
	if err != nil {
		println("Pill Error:", err.Error())
	}
}

// runSettingsWindow is a normal, framed, resizable desktop window for settings.
func runSettingsWindow(route string) {
	settingsApp := NewSettingsApp(route)

	// audioHandler serves WAV files from the audio_cache directory via the
	// Wails AssetServer (/audio/<filename>). This avoids a separate HTTP port
	// and bypasses WebView2 network isolation that blocks cross-origin fetch().
	audioHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.URL.Path, "/audio/") {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		fileName := strings.TrimPrefix(r.URL.Path, "/audio/")
		filePath := filepath.Join(audioCacheDir, filepath.Base(fileName))
		data, err := os.ReadFile(filePath)
		if err != nil {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "audio/wav")
		w.Header().Set("Cache-Control", "no-store")
		w.Write(data)
	})

	err := wails.Run(&options.App{
		Title:             "LocalFlow",
		Width:             860,
		Height:            600,
		MinWidth:          860,
		MinHeight:         560,
		HideWindowOnClose: false,
		StartHidden:       false,
		AssetServer: &assetserver.Options{
			Assets:  assets,
			Handler: audioHandler,
		},
		BackgroundColour: &options.RGBA{R: 15, G: 16, B: 18, A: 255},
		OnStartup:        settingsApp.startup,
		Bind: []interface{}{
			settingsApp,
		},
		Windows: &windows.Options{
			WebviewIsTransparent:              false,
			WindowIsTranslucent:               false,
			DisableFramelessWindowDecorations: false,
		},
	})
	if err != nil {
		println("Settings Error:", err.Error())
	}
}
