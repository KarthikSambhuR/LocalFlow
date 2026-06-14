package main

import (
	"context"
	"embed"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"unsafe"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/windows"
	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

var (
	kernel32            = syscall.NewLazyDLL("kernel32.dll")
	createMutex         = kernel32.NewProc("CreateMutexW")
	findWindowEx        = user32.NewProc("FindWindowExW")
	isWindowVisible     = user32.NewProc("IsWindowVisible")
	setForegroundWindow = user32.NewProc("SetForegroundWindow")
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	// Unset any inherited visible devices so we can enumerate all GPUs
	os.Unsetenv("GGML_VK_VISIBLE_DEVICES")

	// Initialize database to check setup status
	_ = initDB()
	setupCompleted := GetProfileValue("setup_completed") == "true"
	closeDB()

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
		if arg == "--startup" {
			continue
		}
		if strings.Contains(arg, "wails") || strings.HasPrefix(arg, "-") {
			checkMutex = false
		}
	}

	if !setupCompleted {
		// Launch settings/home window to perform onboarding
		runSettingsWindow("home")
		return
	}

	cfg := loadConfig()
	if !cfg.StartMinimized {
		startDetachedHomeWindow()
	}
	runPillOverlay(checkMutex)
}

func startDetachedHomeWindow() {
	if err := exec.Command(os.Args[0], "--home").Start(); err != nil {
		println("Failed to open LocalFlow home on startup:", err.Error())
	}
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
	// Single instance check for settings/home window
	mutexName, _ := syscall.UTF16PtrFromString("LocalFlowSettingsMutex")
	_, _, mutexErr := createMutex.Call(0, 1, uintptr(unsafe.Pointer(mutexName)))
	if mutexErr != nil && mutexErr.(syscall.Errno) == 183 { // ERROR_ALREADY_EXISTS
		// Find already running Settings window and bring to foreground
		title, _ := syscall.UTF16PtrFromString("LocalFlow")
		var hwnd uintptr
		for {
			hwnd, _, _ = findWindowEx.Call(0, hwnd, 0, uintptr(unsafe.Pointer(title)))
			if hwnd == 0 {
				break
			}
			visible, _, _ := isWindowVisible.Call(hwnd)
			if visible != 0 {
				// SW_RESTORE = 9
				procShowWindow.Call(hwnd, 9)
				setForegroundWindow.Call(hwnd)
				break
			}
		}
		return
	}

	settingsApp := NewSettingsApp(route)

	// Load saved window geometry so we can pass it as the initial size.
	cfg := loadConfig()

	// assetHandler serves WAV files and custom TrueType font files from the local storage
	// directory via the Wails AssetServer. This avoids WebView2 CORS blocks.
	assetHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/audio/") {
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
			return
		}

		if strings.HasPrefix(r.URL.Path, "/fonts/") {
			fileName := strings.TrimPrefix(r.URL.Path, "/fonts/")
			cfg := loadConfig()
			dataDir := getBaseAppDir()
			if cfg.DataFolder != "" && cfg.DataFolder != "Default" {
				dataDir = cfg.DataFolder
			}
			filePath := filepath.Join(dataDir, "fonts", filepath.Base(fileName))
			data, err := os.ReadFile(filePath)
			if err != nil {
				w.WriteHeader(http.StatusNotFound)
				return
			}
			w.Header().Set("Content-Type", "font/ttf")
			w.Header().Set("Cache-Control", "public, max-age=31536000")
			w.Write(data)
			return
		}

		w.WriteHeader(http.StatusNotFound)
	})

	err := wails.Run(&options.App{
		Title:             "LocalFlow",
		Width:             cfg.WindowWidth,
		Height:            cfg.WindowHeight,
		MinWidth:          860,
		MinHeight:         560,
		Frameless:         true,
		HideWindowOnClose: false,
		StartHidden:       false,
		AssetServer: &assetserver.Options{
			Assets:  assets,
			Handler: assetHandler,
		},
		BackgroundColour: &options.RGBA{R: 15, G: 16, B: 18, A: 255},
		OnStartup:        settingsApp.startup,
		OnBeforeClose: func(ctx context.Context) bool {
			// Capture current window state and persist it so the next launch
			// opens at the same size / maximized state.
			isMaximized := wailsRuntime.WindowIsMaximised(ctx)
			saveCfg := loadConfig()
			saveCfg.WindowMaximized = isMaximized
			if !isMaximized {
				w, h := wailsRuntime.WindowGetSize(ctx)
				if w >= 860 {
					saveCfg.WindowWidth = w
				}
				if h >= 560 {
					saveCfg.WindowHeight = h
				}
			}
			_ = saveConfig(saveCfg)
			return false // false = allow the window to close
		},
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
