package main

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"time"
	"unsafe"

	"github.com/wailsapp/wails/v2/pkg/runtime"
	"golang.org/x/sys/windows/registry"
)

type App struct {
	ctx context.Context
}

func NewApp() *App {
	return &App{}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

// SelectFolder opens a native directory picker and returns the path
func (a *App) SelectFolder(defaultPath string) (string, error) {
	path, err := runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		DefaultDirectory: defaultPath,
		Title:            "Select Installation Directory",
	})
	if err != nil {
		return "", err
	}
	if path == "" {
		return defaultPath, nil
	}
	return path, nil
}

// CheckWritePermission checks if the directory is writable
func (a *App) CheckWritePermission(path string) (bool, error) {
	err := os.MkdirAll(path, 0755)
	if err != nil {
		return false, err
	}
	testFile := filepath.Join(path, ".lf_write_test")
	err = os.WriteFile(testFile, []byte("test"), 0644)
	if err != nil {
		return false, err
	}
	_ = os.Remove(testFile)
	return true, nil
}

// Install extracts the embedded payload.zip to the target directory, creates shortcuts and registers uninstaller.
func (a *App) Install(targetDir string, createDesktopShortcut, createStartMenuShortcut bool) error {
	// 1. Ensure directory exists
	err := os.MkdirAll(targetDir, 0755)
	if err != nil {
		return fmt.Errorf("failed to create directory: %w", err)
	}

	// Create data folder and grant write permissions to all Users
	dataDir := filepath.Join(targetDir, "data")
	_ = os.MkdirAll(dataDir, 0755)
	cmdPerm := exec.Command("icacls", dataDir, "/grant", "Users:(OI)(CI)F", "/T")
	cmdPerm.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	_ = cmdPerm.Run()

	// 2. Read embedded zip payload
	payload, err := GetPayloadZip()
	if err != nil {
		return fmt.Errorf("failed to load installer payload: %w", err)
	}

	zipReader, err := zip.NewReader(bytes.NewReader(payload), int64(len(payload)))
	if err != nil {
		return fmt.Errorf("failed to parse zip payload: %w", err)
	}

	totalFiles := len(zipReader.File)
	for i, file := range zipReader.File {
		// Send progress to frontend
		progressPct := int(float64(i) / float64(totalFiles) * 80) // extraction is first 80%
		runtime.EventsEmit(a.ctx, "install-progress", map[string]interface{}{
			"percentage": progressPct,
			"status":     fmt.Sprintf("Extracting %s...", file.Name),
		})

		filePath := filepath.Join(targetDir, file.Name)

		if file.FileInfo().IsDir() {
			err = os.MkdirAll(filePath, file.Mode())
			if err != nil {
				return fmt.Errorf("failed to create subfolder %s: %w", file.Name, err)
			}
			continue
		}

		err = os.MkdirAll(filepath.Dir(filePath), 0755)
		if err != nil {
			return fmt.Errorf("failed to create parent directory for %s: %w", file.Name, err)
		}

		outFile, err := os.OpenFile(filePath, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, file.Mode())
		if err != nil {
			return fmt.Errorf("failed to create file %s: %w", file.Name, err)
		}

		inFile, err := file.Open()
		if err != nil {
			outFile.Close()
			return fmt.Errorf("failed to read zip entry %s: %w", file.Name, err)
		}

		_, err = io.Copy(outFile, inFile)
		inFile.Close()
		outFile.Close()
		if err != nil {
			return fmt.Errorf("failed to extract file %s: %w", file.Name, err)
		}
	}

	runtime.EventsEmit(a.ctx, "install-progress", map[string]interface{}{
		"percentage": 85,
		"status":     "Configuring shortcuts and system integration...",
	})

	// 3. Create Shortcuts
	exePath := filepath.Join(targetDir, "LocalFlow.exe")
	if createDesktopShortcut {
		desktopPath, _ := os.UserHomeDir()
		desktopPath = filepath.Join(desktopPath, "Desktop")
		shortcutPath := filepath.Join(desktopPath, "LocalFlow.lnk")
		_ = createShortcut(shortcutPath, exePath, "", targetDir)
	}

	if createStartMenuShortcut {
		// ProgramData is common start menu for requireAdministrator apps
		startMenuPath := filepath.Join(os.Getenv("ProgramData"), `Microsoft\Windows\Start Menu\Programs`)
		shortcutPath := filepath.Join(startMenuPath, "LocalFlow.lnk")
		_ = createShortcut(shortcutPath, exePath, "", targetDir)
	}

	// 4. Copy ourselves as uninstaller
	selfPath, err := os.Executable()
	if err == nil {
		uninstallPath := filepath.Join(targetDir, "uninstall.exe")
		// Copy installer exe to target directory as uninstall.exe
		_ = copyFile(selfPath, uninstallPath)
	}

	runtime.EventsEmit(a.ctx, "install-progress", map[string]interface{}{
		"percentage": 95,
		"status":     "Registering uninstaller...",
	})

	// 5. Add Registry keys for Add/Remove Programs
	_ = registerUninstaller(targetDir)

	runtime.EventsEmit(a.ctx, "install-progress", map[string]interface{}{
		"percentage": 100,
		"status":     "Installation complete!",
	})

	return nil
}

// LaunchApp launches the main app and closes the installer
func (a *App) LaunchApp(targetDir string) {
	exePath := filepath.Join(targetDir, "LocalFlow.exe")
	cmd := exec.Command(exePath)
	cmd.Dir = targetDir
	_ = cmd.Start()
	runtime.Quit(a.ctx)
}

// CloseWindow closes the installer window
func (a *App) CloseWindow() {
	runtime.Quit(a.ctx)
}

func showMessageBox(title, text string, style uintptr) int {
	user32 := syscall.NewLazyDLL("user32.dll")
	messageBox := user32.NewProc("MessageBoxW")
	lpText, _ := syscall.UTF16PtrFromString(text)
	lpCaption, _ := syscall.UTF16PtrFromString(title)
	ret, _, _ := messageBox.Call(
		0,
		uintptr(unsafe.Pointer(lpText)),
		uintptr(unsafe.Pointer(lpCaption)),
		style,
	)
	return int(ret)
}

func CheckAndRunUninstall() {
	selfPath, errSelf := os.Executable()
	isUninstallMode := false
	if errSelf == nil && strings.ToLower(filepath.Base(selfPath)) == "uninstall.exe" {
		isUninstallMode = true
	}
	for _, arg := range os.Args[1:] {
		if arg == "--uninstall" {
			isUninstallMode = true
		}
	}

	if isUninstallMode {
		err := PerformUninstallDirect()
		if err != nil {
			showMessageBox("Uninstallation Failed", fmt.Sprintf("Error during uninstall: %v", err), 0x00000010) // MB_ICONERROR
		} else {
			showMessageBox("Uninstallation Complete", "LocalFlow has been successfully removed from your computer.", 0x00000040) // MB_ICONINFORMATION
		}
		os.Exit(0)
	}
}

func getInstallLocation() (string, error) {
	k, err := registry.OpenKey(registry.LOCAL_MACHINE, `Software\Microsoft\Windows\CurrentVersion\Uninstall\LocalFlow`, registry.QUERY_VALUE)
	if err != nil {
		return "", err
	}
	defer k.Close()

	val, _, err := k.GetStringValue("InstallLocation")
	return val, err
}

func CheckAndRunSilentUpdate() {
	for _, arg := range os.Args[1:] {
		if arg == "--silent-update" {
			err := PerformSilentUpdateDirect()
			if err != nil {
				os.Exit(1)
			}
			os.Exit(0)
		}
	}
}

func PerformSilentUpdateDirect() error {
	// 1. Get install location from registry
	targetDir, err := getInstallLocation()
	if err != nil || targetDir == "" {
		return fmt.Errorf("could not find install location: %w", err)
	}

	// 2. Terminate any running LocalFlow instances to free file locks
	_ = exec.Command("taskkill", "/f", "/im", "LocalFlow.exe").Run()
	time.Sleep(1 * time.Second) // Wait for process locks to release

	// 3. Read embedded zip payload
	payload, err := GetPayloadZip()
	if err != nil {
		return err
	}

	zipReader, err := zip.NewReader(bytes.NewReader(payload), int64(len(payload)))
	if err != nil {
		return err
	}

	// 4. Extract and overwrite files
	for _, file := range zipReader.File {
		filePath := filepath.Join(targetDir, file.Name)
		if file.FileInfo().IsDir() {
			_ = os.MkdirAll(filePath, file.Mode())
			continue
		}

		_ = os.MkdirAll(filepath.Dir(filePath), 0755)

		outFile, err := os.OpenFile(filePath, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, file.Mode())
		if err != nil {
			return err
		}

		inFile, err := file.Open()
		if err != nil {
			outFile.Close()
			return err
		}

		_, err = io.Copy(outFile, inFile)
		inFile.Close()
		outFile.Close()
		if err != nil {
			return err
		}
	}

	// 5. Start updated app with the update cleanup argument detached
	exePath := filepath.Join(targetDir, "LocalFlow.exe")
	cmd := exec.Command(exePath, "--update-cleanup")
	cmd.Dir = targetDir
	_ = cmd.Start()

	return nil
}

func (a *App) PerformUninstall() error {
	return PerformUninstallDirect()
}

func PerformUninstallDirect() error {
	selfPath, _ := os.Executable()
	targetDir := filepath.Dir(selfPath)

	// 1. Remove Startup registry value if it exists
	kRun, errRun := registry.OpenKey(registry.CURRENT_USER, `Software\Microsoft\Windows\CurrentVersion\Run`, registry.ALL_ACCESS)
	if errRun == nil {
		_ = kRun.DeleteValue("LocalFlow")
		kRun.Close()
	}

	// 2. Remove Registry Uninstall entry
	k, err := registry.OpenKey(registry.LOCAL_MACHINE, `Software\Microsoft\Windows\CurrentVersion\Uninstall`, registry.ALL_ACCESS)
	if err == nil {
		_ = registry.DeleteKey(k, "LocalFlow")
		k.Close()
	}

	// 3. Remove Shortcuts
	desktopPath, _ := os.UserHomeDir()
	desktopPath = filepath.Join(desktopPath, "Desktop")
	_ = os.Remove(filepath.Join(desktopPath, "LocalFlow.lnk"))

	startMenuPath := filepath.Join(os.Getenv("ProgramData"), `Microsoft\Windows\Start Menu\Programs`)
	_ = os.Remove(filepath.Join(startMenuPath, "LocalFlow.lnk"))

	// 4. Resolve the data directory (checking for custom folder in config)
	defaultDataDir := filepath.Join(targetDir, "data")
	dataDir := defaultDataDir

	configPath := filepath.Join(defaultDataDir, "localflow_config.json")
	if configData, err := os.ReadFile(configPath); err == nil {
		var cfg struct {
			DataFolder string `json:"data_folder"`
		}
		if json.Unmarshal(configData, &cfg) == nil {
			if cfg.DataFolder != "" && cfg.DataFolder != "Default" {
				dataDir = cfg.DataFolder
			}
		}
	}

	// 5. Ask user if they want to retain data (recordings, database, audio cache)
	// MB_YESNO = 0x00000004, MB_ICONQUESTION = 0x00000020
	ret := showMessageBox("Retain App Data?", "Do you want to retain your recordings history, database, and audio cache?", 0x00000004|0x00000020)
	retainData := (ret == 6) // IDYES = 6

	// 6. Delete other files in Go beforehand
	if retainData {
		// Keep localflow.db and audio_cache, delete everything else in dataDir
		_ = os.RemoveAll(filepath.Join(dataDir, "models"))
		_ = os.RemoveAll(filepath.Join(dataDir, "fonts"))
		_ = os.Remove(filepath.Join(dataDir, "localflow_config.json"))

		if dataDir != defaultDataDir {
			_ = os.RemoveAll(defaultDataDir)
		} else {
			// Clean up files in defaultDataDir except localflow.db and audio_cache
			if entries, errData := os.ReadDir(defaultDataDir); errData == nil {
				for _, entry := range entries {
					name := entry.Name()
					if name == "localflow.db" || name == "audio_cache" {
						continue
					}
					_ = os.RemoveAll(filepath.Join(defaultDataDir, name))
				}
			}
		}

		// Clean up files in targetDir except the uninstall.exe and data folder
		if entries, errDir := os.ReadDir(targetDir); errDir == nil {
			for _, entry := range entries {
				name := entry.Name()
				if name == "uninstall.exe" || name == "data" {
					continue
				}
				_ = os.RemoveAll(filepath.Join(targetDir, name))
			}
		}
	} else {
		// Delete everything in dataDir and defaultDataDir
		_ = os.RemoveAll(dataDir)
		_ = os.RemoveAll(defaultDataDir)

		// Clean up files in targetDir except uninstall.exe
		if entries, errDir := os.ReadDir(targetDir); errDir == nil {
			for _, entry := range entries {
				name := entry.Name()
				if name == "uninstall.exe" {
					continue
				}
				_ = os.RemoveAll(filepath.Join(targetDir, name))
			}
		}
	}

	// 7. Write the bat script to delete uninstall.exe and targetDir if appropriate
	tempDir := os.Getenv("TEMP")
	batchScript := filepath.Join(tempDir, "uninstall_localflow.bat")
	
	var scriptContent string
	if retainData {
		scriptContent = fmt.Sprintf(`@echo off
:loop
del "%s"
if exist "%s" goto loop
rd "%s" 2>nul
del "%%~f0"
`, selfPath, selfPath, targetDir)
	} else {
		scriptContent = fmt.Sprintf(`@echo off
:loop
del "%s"
if exist "%s" goto loop
rd /s /q "%s"
del "%%~f0"
`, selfPath, selfPath, targetDir)
	}

	_ = os.WriteFile(batchScript, []byte(scriptContent), 0644)
	
	// Start batch script detached without spawning a console window
	cmd := exec.Command("cmd.exe", "/c", batchScript)
	cmd.SysProcAttr = &syscall.SysProcAttr{
		HideWindow:    true,
		CreationFlags: 0x08000000,
	}
	_ = cmd.Start()

	return nil
}

// Helpers

func createShortcut(shortcutPath, targetPath, arguments, workingDir string) error {
	psCommand := fmt.Sprintf(
		`$WshShell = New-Object -ComObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut('%s'); $Shortcut.TargetPath = '%s'; $Shortcut.Arguments = '%s'; $Shortcut.WorkingDirectory = '%s'; $Shortcut.Save()`,
		shortcutPath, targetPath, arguments, workingDir,
	)
	cmd := exec.Command("powershell", "-NoProfile", "-NonInteractive", "-Command", psCommand)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	return cmd.Run()
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()

	_, err = io.Copy(out, in)
	return err
}

func registerUninstaller(installDir string) error {
	k, _, err := registry.CreateKey(registry.LOCAL_MACHINE, `Software\Microsoft\Windows\CurrentVersion\Uninstall\LocalFlow`, registry.ALL_ACCESS)
	if err != nil {
		return err
	}
	defer k.Close()

	k.SetStringValue("DisplayName", "LocalFlow")
	k.SetStringValue("DisplayVersion", "1.0.0")
	k.SetStringValue("Publisher", "KarthikSambhuR")
	k.SetStringValue("UninstallString", fmt.Sprintf(`"%s" --uninstall`, filepath.Join(installDir, "uninstall.exe")))
	k.SetStringValue("InstallLocation", installDir)
	k.SetStringValue("DisplayIcon", filepath.Join(installDir, "LocalFlow.exe"))
	k.SetDWordValue("NoModify", 1)
	k.SetDWordValue("NoRepair", 1)
	return nil
}
