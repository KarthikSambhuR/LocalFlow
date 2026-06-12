package main

import (
	_ "embed"
	"os"
	"os/exec"

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
				systray.Quit()
				runtime.Quit(a.ctx)
				return
			}
		}
	}()
}
