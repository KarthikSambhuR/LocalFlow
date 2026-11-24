package main

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
	"unsafe"

	"golang.org/x/sys/windows/registry"
)

func showMessageBox(title, text string, style uintptr) int {
	user32 := syscall.NewLazyDLL("user32.dll")
	messageBox := user32.NewProc("MessageBoxW")
	lpText, _ := syscall.UTF16PtrFromString(text)
	lpCaption, _ := syscall.UTF16PtrFromString(title)
	ret, _, _ := messageBox.Call(0, uintptr(unsafe.Pointer(lpText)), uintptr(unsafe.Pointer(lpCaption)), style)
	return int(ret)
}

func main() {
	if err := performUninstall(); err != nil {
		showMessageBox("Uninstallation Failed", fmt.Sprintf("Error during uninstall: %v", err), 0x00000010)
		os.Exit(1)
	}
	showMessageBox("Uninstallation Complete", "LocalFlow has been successfully removed from your computer.", 0x00000040)
}

func performUninstall() error {
	selfPath, _ := os.Executable()
	targetDir := filepath.Dir(selfPath)

	// Terminate running processes so DLLs/EXEs can be removed cleanly
	_ = exec.Command("taskkill", "/f", "/im", "LocalFlow.exe").Run()
	_ = exec.Command("taskkill", "/f", "/im", "llama-server.exe").Run()

	// Remove Startup registry entry
	if kRun, err := registry.OpenKey(registry.CURRENT_USER, `Software\Microsoft\Windows\CurrentVersion\Run`, registry.ALL_ACCESS); err == nil {
		_ = kRun.DeleteValue("LocalFlow")
		kRun.Close()
	}

	// Remove Uninstall registry entries (both HKCU and HKLM)
	for _, root := range []registry.Key{registry.CURRENT_USER, registry.LOCAL_MACHINE} {
		if k, err := registry.OpenKey(root, `Software\Microsoft\Windows\CurrentVersion\Uninstall`, registry.ALL_ACCESS); err == nil {
			_ = registry.DeleteKey(k, "LocalFlow")
			k.Close()
		}
	}

	// Remove Shortcuts
	if up := os.Getenv("USERPROFILE"); up != "" {
		_ = os.Remove(filepath.Join(up, "Desktop", "LocalFlow.lnk"))
	}
	if appData := os.Getenv("APPDATA"); appData != "" {
		_ = os.Remove(filepath.Join(appData, `Microsoft\Windows\Start Menu\Programs\LocalFlow.lnk`))
	}
	if progData := os.Getenv("ProgramData"); progData != "" {
		_ = os.Remove(filepath.Join(progData, `Microsoft\Windows\Start Menu\Programs\LocalFlow.lnk`))
	}

	// Resolve data directory
	defaultDataDir := filepath.Join(targetDir, "data")
	dataDir := defaultDataDir
	if configData, err := os.ReadFile(filepath.Join(defaultDataDir, "localflow_config.json")); err == nil {
		var cfg struct {
			DataFolder string `json:"data_folder"`
		}
		if json.Unmarshal(configData, &cfg) == nil && cfg.DataFolder != "" && cfg.DataFolder != "Default" {
			dataDir = cfg.DataFolder
		}
	}

	// MB_YESNO | MB_ICONQUESTION = 0x24; IDYES = 6
	retainData := showMessageBox("Retain App Data?", "Do you want to keep your dictation history, database, and audio cache?", 0x00000004|0x00000020) == 6

	if retainData {
		_ = os.RemoveAll(filepath.Join(dataDir, "models"))
		_ = os.RemoveAll(filepath.Join(dataDir, "fonts"))
		_ = os.Remove(filepath.Join(dataDir, "localflow_config.json"))
		if dataDir != defaultDataDir {
			_ = os.RemoveAll(defaultDataDir)
		} else if entries, err := os.ReadDir(defaultDataDir); err == nil {
			for _, e := range entries {
				if e.Name() != "localflow.db" && e.Name() != "audio_cache" {
					_ = os.RemoveAll(filepath.Join(defaultDataDir, e.Name()))
				}
			}
		}
	} else {
		_ = os.RemoveAll(dataDir)
		_ = os.RemoveAll(defaultDataDir)
	}

	if entries, err := os.ReadDir(targetDir); err == nil {
		for _, e := range entries {
			name := e.Name()
			if name == "uninstall.exe" || (retainData && name == "data") {
				continue
			}
			_ = os.RemoveAll(filepath.Join(targetDir, name))
		}
	}

	// Bounded self-cleanup script (max 15 attempts)
	tempDir := os.Getenv("TEMP")
	batchScript := filepath.Join(tempDir, "uninstall_localflow.bat")
	rdCmd := fmt.Sprintf(`rd /s /q "%s"`, targetDir)
	if retainData {
		rdCmd = fmt.Sprintf(`rd "%s" 2>nul`, targetDir)
	}
	scriptContent := fmt.Sprintf(`@echo off
for /L %%%%i in (1,1,15) do (
  del "%s" 2>nul
  if not exist "%s" goto done
  timeout /t 1 /nobreak > nul
)
:done
%s
del "%%~f0"
`, selfPath, selfPath, rdCmd)
	_ = os.WriteFile(batchScript, []byte(scriptContent), 0644)

	cmd := exec.Command("cmd.exe", "/c", batchScript)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000}
	_ = cmd.Start()
	return nil
}
