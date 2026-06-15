package main

import (
	_ "embed"
	"os"
	"os/exec"
	"syscall"
	"unsafe"

	"github.com/getlantern/systray"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

//go:embed build/windows/icon.ico
var trayIcon []byte

func (a *App) setupTray() {
	go systray.Run(a.onTrayReady, func() {})
}

func (a *App) onTrayReady() {
	systray.SetIcon(trayIcon)
	systray.SetTitle("LocalFlow")
	systray.SetTooltip("LocalFlow — Press Ctrl+Win to dictate")

	mHome := systray.AddMenuItem("Home", "View recording history")
	mQuit := systray.AddMenuItem("Exit", "Quit the whole app")

	go func() {
		for {
			select {
			case <-mHome.ClickedCh:
				exec.Command(os.Args[0], "--home").Start()

			case <-mQuit.ClickedCh:
				// Close any open Home/Settings windows before exiting
				closeAllLocalFlowWindows()
				systray.Quit()
				runtime.Quit(a.ctx)
				return
			}
		}
	}()
}

// closeAllLocalFlowWindows sends WM_CLOSE to every visible window titled "LocalFlow"
// that is NOT the pill overlay (the pill overlay is hidden/invisible).
func closeAllLocalFlowWindows() {
	postMessage := user32.NewProc("PostMessageW")
	title, _ := syscall.UTF16PtrFromString("LocalFlow")
	const wmClose = 0x0010
	var hwnd uintptr
	for {
		hwnd, _, _ = findWindowEx.Call(0, hwnd, 0, uintptr(unsafe.Pointer(title)))
		if hwnd == 0 {
			break
		}
		visible, _, _ := isWindowVisible.Call(hwnd)
		if visible != 0 {
			postMessage.Call(hwnd, wmClose, 0, 0)
		}
	}
}

