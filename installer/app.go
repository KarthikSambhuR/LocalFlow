package main

import (
	"archive/zip"
	"bufio"
	"bytes"
	"context"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"time"
	"unsafe"

	ole "github.com/go-ole/go-ole"
	"github.com/go-ole/go-ole/oleutil"
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

// GetDefaultInstallDir returns the recommended per-user install directory (%LOCALAPPDATA%\LocalFlow).
func (a *App) GetDefaultInstallDir() string {
	if localAppData := os.Getenv("LOCALAPPDATA"); localAppData != "" {
		return filepath.Join(localAppData, "LocalFlow")
	}
	return `C:\Program Files\LocalFlow`
}

// SelectFolder opens a native directory picker and returns the path.
func (a *App) SelectFolder(defaultPath string) (string, error) {
	initialDir := filepath.Clean(defaultPath)
	for initialDir != "" && initialDir != "." {
		if info, err := os.Stat(initialDir); err == nil && info.IsDir() {
			break
		}
		parent := filepath.Dir(initialDir)
		if parent == initialDir {
			initialDir = ""
			break
		}
		initialDir = parent
	}

	path, err := runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		DefaultDirectory: initialDir,
		Title:            "Select Installation Folder",
	})
	if err != nil {
		return "", err
	}
	if path == "" {
		return defaultPath, nil
	}
	return path, nil
}

// CheckWritePermission checks if the directory is writable.
func (a *App) CheckWritePermission(path string) (bool, error) {
	if err := os.MkdirAll(path, 0755); err != nil {
		return false, err
	}
	testFile := filepath.Join(path, ".lf_write_test")
	if err := os.WriteFile(testFile, []byte("test"), 0644); err != nil {
		return false, err
	}
	_ = os.Remove(testFile)
	return true, nil
}

func safeExtractPath(targetDir, entryName string) (string, error) {
	cleanTarget := filepath.Clean(targetDir)
	destPath := filepath.Join(cleanTarget, entryName)
	rel, err := filepath.Rel(cleanTarget, destPath)
	if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(os.PathSeparator)) {
		return "", fmt.Errorf("unsafe zip entry path: %s", entryName)
	}
	return destPath, nil
}

func extractZipEntryBuffered(destPath string, file *zip.File, retries int) error {
	var lastErr error
	for attempt := 0; attempt <= retries; attempt++ {
		outFile, err := os.OpenFile(destPath, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, file.Mode())
		if err == nil {
			inFile, errOpen := file.Open()
			if errOpen != nil {
				outFile.Close()
				return fmt.Errorf("failed to open zip entry %s: %w", file.Name, errOpen)
			}
			bw := bufio.NewWriterSize(outFile, 256*1024)
			_, copyErr := io.Copy(bw, inFile)
			flushErr := bw.Flush()
			inFile.Close()
			closeErr := outFile.Close()
			if copyErr == nil && flushErr == nil && closeErr == nil {
				return nil
			}
			if copyErr != nil {
				lastErr = copyErr
			} else if flushErr != nil {
				lastErr = flushErr
			} else {
				lastErr = closeErr
			}
		} else {
			lastErr = err
		}
		if attempt < retries {
			time.Sleep(400 * time.Millisecond)
		}
	}
	return fmt.Errorf("failed writing %s: %w", destPath, lastErr)
}

// Install extracts payload.zip (including standalone uninstall.exe), creates shortcuts via COM, and registers uninstaller.
func (a *App) Install(targetDir string, createDesktopShortcut, createStartMenuShortcut bool) error {
	targetDir = filepath.Clean(targetDir)
	if err := os.MkdirAll(targetDir, 0755); err != nil {
		return fmt.Errorf("failed to create directory: %w", err)
	}

	dataDir := filepath.Join(targetDir, "data")
	_ = os.MkdirAll(dataDir, 0755)
	if isSystemProgramFilesPath(targetDir) {
		cmdPerm := exec.Command("icacls", dataDir, "/grant", "Users:(OI)(CI)F", "/T")
		cmdPerm.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000}
		_ = cmdPerm.Run()
	}

	payload, err := GetPayloadZip()
	if err != nil {
		return fmt.Errorf("failed to load installer payload: %w", err)
	}

	zipReader, err := zip.NewReader(bytes.NewReader(payload), int64(len(payload)))
	if err != nil {
		return fmt.Errorf("failed to parse zip payload: %w", err)
	}

	totalFiles := len(zipReader.File)
	lastEmit := time.Time{}
	for i, file := range zipReader.File {
		filePath, err := safeExtractPath(targetDir, file.Name)
		if err != nil {
			return err
		}

		if file.FileInfo().IsDir() {
			if err := os.MkdirAll(filePath, file.Mode()); err != nil {
				return fmt.Errorf("failed to create subfolder %s: %w", file.Name, err)
			}
			continue
		}

		if err := os.MkdirAll(filepath.Dir(filePath), 0755); err != nil {
			return fmt.Errorf("failed to create parent directory for %s: %w", file.Name, err)
		}

		if err := extractZipEntryBuffered(filePath, file, 0); err != nil {
			return err
		}

		now := time.Now()
		if now.Sub(lastEmit) >= 60*time.Millisecond || i == totalFiles-1 {
			lastEmit = now
			progressPct := int(float64(i+1) / float64(totalFiles) * 85)
			runtime.EventsEmit(a.ctx, "install-progress", map[string]interface{}{
				"percentage": progressPct,
				"status":     fmt.Sprintf("Installing %s...", filepath.Base(file.Name)),
			})
		}
	}

	runtime.EventsEmit(a.ctx, "install-progress", map[string]interface{}{
		"percentage": 90,
		"status":     "Creating shortcuts...",
	})

	exePath := filepath.Join(targetDir, "LocalFlow.exe")
	if createDesktopShortcut {
		shortcutPath := filepath.Join(getDesktopPath(targetDir), "LocalFlow.lnk")
		if err := createShortcutCOM(shortcutPath, exePath, "", targetDir); err != nil {
			return fmt.Errorf("failed to create Desktop shortcut: %w", err)
		}
	}

	if createStartMenuShortcut {
		shortcutPath := filepath.Join(getStartMenuPath(targetDir), "LocalFlow.lnk")
		_ = os.MkdirAll(filepath.Dir(shortcutPath), 0755)
		if err := createShortcutCOM(shortcutPath, exePath, "", targetDir); err != nil {
			return fmt.Errorf("failed to create Start Menu shortcut: %w", err)
		}
	}

	runtime.EventsEmit(a.ctx, "install-progress", map[string]interface{}{
		"percentage": 96,
		"status":     "Registering uninstaller...",
	})

	if err := registerUninstaller(targetDir); err != nil {
		return fmt.Errorf("failed to register uninstaller: %w", err)
	}

	runtime.EventsEmit(a.ctx, "install-progress", map[string]interface{}{
		"percentage": 100,
		"status":     "Installation complete!",
	})

	return nil
}

// LaunchApp launches LocalFlow.exe detached and closes the installer.
func (a *App) LaunchApp(targetDir string) {
	exePath := filepath.Join(targetDir, "LocalFlow.exe")
	cmd := exec.Command(exePath)
	cmd.Dir = targetDir
	_ = cmd.Start()
	runtime.Quit(a.ctx)
}

// CloseWindow closes the installer window.
func (a *App) CloseWindow() {
	runtime.Quit(a.ctx)
}

func showMessageBox(title, text string, style uintptr) int {
	user32 := syscall.NewLazyDLL("user32.dll")
	messageBox := user32.NewProc("MessageBoxW")
	lpText, _ := syscall.UTF16PtrFromString(text)
	lpCaption, _ := syscall.UTF16PtrFromString(title)
	ret, _, _ := messageBox.Call(0, uintptr(unsafe.Pointer(lpText)), uintptr(unsafe.Pointer(lpCaption)), style)
	return int(ret)
}

func CheckAndRunUninstall() {
	for _, arg := range os.Args[1:] {
		if arg == "--uninstall" {
			if dir, err := getInstallLocation(); err == nil {
				uninstallExe := filepath.Join(dir, "uninstall.exe")
				if _, statErr := os.Stat(uninstallExe); statErr == nil {
					_ = exec.Command(uninstallExe).Start()
					os.Exit(0)
				}
			}
			os.Exit(0)
		}
	}
}

func getInstallLocation() (string, error) {
	for _, root := range []registry.Key{registry.CURRENT_USER, registry.LOCAL_MACHINE} {
		k, err := registry.OpenKey(root, `Software\Microsoft\Windows\CurrentVersion\Uninstall\LocalFlow`, registry.QUERY_VALUE)
		if err == nil {
			val, _, errVal := k.GetStringValue("InstallLocation")
			k.Close()
			if errVal == nil && val != "" {
				return val, nil
			}
		}
	}

	for _, dir := range []string{
		filepath.Join(os.Getenv("LOCALAPPDATA"), "LocalFlow"),
		`C:\Program Files\LocalFlow`,
	} {
		if dir != "" {
			if _, err := os.Stat(filepath.Join(dir, "LocalFlow.exe")); err == nil {
				return dir, nil
			}
		}
	}

	return "", fmt.Errorf("could not detect LocalFlow installation directory")
}

func CheckAndRunSilentUpdate() {
	var targetDirOverride string
	isSilentUpdate := false

	for _, arg := range os.Args[1:] {
		if arg == "--silent-update" {
			isSilentUpdate = true
		} else if strings.HasPrefix(arg, "--target-dir=") {
			targetDirOverride = strings.Trim(strings.TrimPrefix(arg, "--target-dir="), `"`)
		}
	}

	if isSilentUpdate {
		if err := PerformSilentUpdateDirect(targetDirOverride); err != nil {
			showMessageBox("LocalFlow Update Error", fmt.Sprintf("Failed to apply update: %v", err), 0x00000010)
			os.Exit(1)
		}
		os.Exit(0)
	}
}

func PerformSilentUpdateDirect(targetDirOverride string) error {
	targetDir := targetDirOverride
	if targetDir == "" {
		var err error
		targetDir, err = getInstallLocation()
		if err != nil || targetDir == "" {
			return fmt.Errorf("could not find install location: %w", err)
		}
	}
	targetDir = filepath.Clean(targetDir)

	_ = exec.Command("taskkill", "/f", "/im", "LocalFlow.exe").Run()
	_ = exec.Command("taskkill", "/f", "/im", "llama-server.exe").Run()
	time.Sleep(800 * time.Millisecond)

	payload, err := GetPayloadZip()
	if err != nil {
		return err
	}

	zipReader, err := zip.NewReader(bytes.NewReader(payload), int64(len(payload)))
	if err != nil {
		return err
	}

	for _, file := range zipReader.File {
		filePath, err := safeExtractPath(targetDir, file.Name)
		if err != nil {
			return err
		}
		if file.FileInfo().IsDir() {
			_ = os.MkdirAll(filePath, file.Mode())
			continue
		}
		_ = os.MkdirAll(filepath.Dir(filePath), 0755)
		if err := extractZipEntryBuffered(filePath, file, 8); err != nil {
			return err
		}
	}

	_ = registerUninstaller(targetDir)

	selfPath, _ := os.Executable()
	tempDir := os.Getenv("TEMP")
	_ = os.Remove(filepath.Join(tempDir, "localflow_update_state.json"))

	trashPath := selfPath + ".trash"
	_ = os.Remove(trashPath)
	if errRename := os.Rename(selfPath, trashPath); errRename == nil {
		selfPath = trashPath
	}

	batchScript := filepath.Join(tempDir, "localflow_update_cleanup.bat")
	scriptContent := fmt.Sprintf(`@echo off
for /L %%%%i in (1,1,10) do (
  del "%s" 2>nul
  if not exist "%s" goto done
  timeout /t 1 /nobreak > nul
)
:done
del "%%~f0"
`, selfPath, selfPath)
	_ = os.WriteFile(batchScript, []byte(scriptContent), 0644)
	cleanupCmd := exec.Command("cmd.exe", "/c", batchScript)
	cleanupCmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000}
	_ = cleanupCmd.Start()

	exePath := filepath.Join(targetDir, "LocalFlow.exe")
	cmd := exec.Command(exePath)
	cmd.Dir = targetDir
	_ = cmd.Start()

	return nil
}

func isSystemProgramFilesPath(targetDir string) bool {
	lower := strings.ToLower(filepath.Clean(targetDir))
	return strings.Contains(lower, `\program files`)
}

func getDesktopPath(targetDir string) string {
	if !isSystemProgramFilesPath(targetDir) {
		if up := os.Getenv("USERPROFILE"); up != "" {
			return filepath.Join(up, "Desktop")
		}
	}
	if pub := os.Getenv("PUBLIC"); pub != "" {
		return filepath.Join(pub, "Desktop")
	}
	if up := os.Getenv("USERPROFILE"); up != "" {
		return filepath.Join(up, "Desktop")
	}
	return `C:\Users\Public\Desktop`
}

func getStartMenuPath(targetDir string) string {
	if !isSystemProgramFilesPath(targetDir) {
		if appData := os.Getenv("APPDATA"); appData != "" {
			return filepath.Join(appData, `Microsoft\Windows\Start Menu\Programs`)
		}
	}
	return filepath.Join(os.Getenv("ProgramData"), `Microsoft\Windows\Start Menu\Programs`)
}

// createShortcutCOM creates a .lnk file using native Windows COM IShellLinkW (no PowerShell process).
func createShortcutCOM(shortcutPath, targetPath, arguments, workingDir string) error {
	if err := ole.CoInitializeEx(0, ole.COINIT_APARTMENTTHREADED); err != nil {
		// S_FALSE (1) or RPC_E_CHANGED_MODE are fine if COM is already initialized on this thread
		if oleErr, ok := err.(*ole.OleError); !ok || (oleErr.Code() != 1 && oleErr.Code() != 0x80010106) {
			return err
		}
	} else {
		defer ole.CoUninitialize()
	}

	unk, err := oleutil.CreateObject("WScript.Shell")
	if err != nil {
		return err
	}
	defer unk.Release()

	wsh, err := unk.QueryInterface(ole.IID_IDispatch)
	if err != nil {
		return err
	}
	defer wsh.Release()

	cs, err := oleutil.CallMethod(wsh, "CreateShortcut", shortcutPath)
	if err != nil {
		return err
	}
	shortcut := cs.ToIDispatch()
	defer shortcut.Release()

	if _, err := oleutil.PutProperty(shortcut, "TargetPath", targetPath); err != nil {
		return err
	}
	if arguments != "" {
		if _, err := oleutil.PutProperty(shortcut, "Arguments", arguments); err != nil {
			return err
		}
	}
	if _, err := oleutil.PutProperty(shortcut, "WorkingDirectory", workingDir); err != nil {
		return err
	}
	_, err = oleutil.CallMethod(shortcut, "Save")
	return err
}

func registerUninstaller(installDir string) error {
	root := registry.CURRENT_USER
	if isSystemProgramFilesPath(installDir) {
		root = registry.LOCAL_MACHINE
	}
	k, _, err := registry.CreateKey(root, `Software\Microsoft\Windows\CurrentVersion\Uninstall\LocalFlow`, registry.ALL_ACCESS)
	if err != nil {
		return err
	}
	defer k.Close()

	_ = k.SetStringValue("DisplayName", "LocalFlow")
	_ = k.SetStringValue("DisplayVersion", "1.5.0")
	_ = k.SetStringValue("Publisher", "KarthikSambhuR")
	_ = k.SetStringValue("UninstallString", fmt.Sprintf(`"%s"`, filepath.Join(installDir, "uninstall.exe")))
	_ = k.SetStringValue("InstallLocation", installDir)
	_ = k.SetStringValue("DisplayIcon", filepath.Join(installDir, "LocalFlow.exe"))
	_ = k.SetDWordValue("NoModify", 1)
	_ = k.SetDWordValue("NoRepair", 1)
	return nil
}
