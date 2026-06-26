package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"syscall"
	"time"
	"unsafe"

	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

const (
<<<<<<< HEAD
	AppVersion = "v1.2.0"
=======
	AppVersion = "v1.2.3"
>>>>>>> 9f2d4e9a96d72b9449b3479360b38fbfea06b10a
	GithubRepo = "KarthikSambhuR/LocalFlow"
)

type GithubRelease struct {
	TagName string `json:"tag_name"`
	Assets  []struct {
		Name               string `json:"name"`
		BrowserDownloadURL string `json:"browser_download_url"`
		Size               int    `json:"size"`
	} `json:"assets"`
}

type UpdateState struct {
	Status  string `json:"status"`
	Version string `json:"version"`
	Percent int    `json:"percent"`
}

func getTempUpdatePath() string {
	return filepath.Join(os.Getenv("TEMP"), "LocalFlowSetup-Update.exe")
}

func getTempUpdateTmpPath() string {
	return filepath.Join(os.Getenv("TEMP"), "LocalFlowSetup-Update.exe.tmp")
}

func getUpdateStatePath() string {
	return filepath.Join(os.Getenv("TEMP"), "localflow_update_state.json")
}

func writeUpdateState(status string, version string, percent int) {
	state := UpdateState{
		Status:  status,
		Version: version,
		Percent: percent,
	}
	data, err := json.Marshal(state)
	if err == nil {
		_ = os.WriteFile(getUpdateStatePath(), data, 0644)
	}
}

func readUpdateState() UpdateState {
	var state UpdateState
	state.Status = "idle"
	for i := 0; i < 5; i++ {
		data, err := os.ReadFile(getUpdateStatePath())
		if err == nil {
			if errUnmarshal := json.Unmarshal(data, &state); errUnmarshal == nil {
				return state
			}
		}
		time.Sleep(10 * time.Millisecond)
	}
	return state
}

// StartBackgroundUpdateCheck runs in a goroutine and checks for new GitHub releases.
func StartBackgroundUpdateCheck(ctx context.Context) {
	// Wait a moment for the system to settle
	time.Sleep(3 * time.Second)

	// Check if update file already exists (previously downloaded completely)
	if _, err := os.Stat(getTempUpdatePath()); err == nil {
		state := readUpdateState()
		if state.Status == "downloaded" {
			wailsRuntime.EventsEmit(ctx, "update-downloaded")
			return
		}
		writeUpdateState("downloaded", state.Version, 100)
		wailsRuntime.EventsEmit(ctx, "update-downloaded")
		return
	}

	url := fmt.Sprintf("https://api.github.com/repos/%s/releases/latest", GithubRepo)
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return
	}
	req.Header.Set("User-Agent", "LocalFlow-Updater")

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return
	}

	var release GithubRelease
	if err := json.NewDecoder(resp.Body).Decode(&release); err != nil {
		return
	}

	if !isNewerVersion(AppVersion, release.TagName) {
		writeUpdateState("idle", "", 0)
		return
	}

	// Find the installer asset
	var downloadURL string
	for _, asset := range release.Assets {
		if strings.ToLower(asset.Name) == "localflowsetup.exe" {
			downloadURL = asset.BrowserDownloadURL
			break
		}
	}

	if downloadURL == "" {
		return
	}

	writeUpdateState("available", release.TagName, 0)
	wailsRuntime.EventsEmit(ctx, "update-available", release.TagName)

	// Start downloading in background
	go func() {
		tmpPath := getTempUpdateTmpPath()
		finalPath := getTempUpdatePath()

		// Clean up any stale temp files
		_ = os.Remove(tmpPath)

		out, err := os.Create(tmpPath)
		if err != nil {
			writeUpdateState("idle", "", 0)
			return
		}
		defer out.Close()

		dlReq, err := http.NewRequestWithContext(ctx, "GET", downloadURL, nil)
		if err != nil {
			writeUpdateState("idle", "", 0)
			return
		}

		// Use a separate client with no timeout for the binary download.
		// The api client above has a 15s timeout which kills large file streams.
		dlClient := &http.Client{}
		dlResp, err := dlClient.Do(dlReq)
		if err != nil {
			writeUpdateState("idle", "", 0)
			return
		}
		defer dlResp.Body.Close()

		if dlResp.StatusCode != http.StatusOK {
			writeUpdateState("idle", "", 0)
			return
		}

		counter := &UpdateWriteCounter{
			ContentLen: uint64(dlResp.ContentLength),
			LastPct:    -1,
			OnProgress: func(percent int) {
				writeUpdateState("downloading", release.TagName, percent)
				wailsRuntime.EventsEmit(ctx, "update-progress", percent)
			},
		}

		_, err = io.Copy(out, io.TeeReader(dlResp.Body, counter))
		if err != nil {
			out.Close()
			_ = os.Remove(tmpPath)
			writeUpdateState("idle", "", 0)
			return
		}
		out.Close()

		// Rename to final path to mark download completion
		err = os.Rename(tmpPath, finalPath)
		if err == nil {
			writeUpdateState("downloaded", release.TagName, 100)
			wailsRuntime.EventsEmit(ctx, "update-downloaded")
		} else {
			writeUpdateState("idle", "", 0)
		}
	}()
}

func isNewerVersion(current, latest string) bool {
	current = strings.TrimPrefix(current, "v")
	latest = strings.TrimPrefix(latest, "v")
	cParts := strings.Split(current, ".")
	lParts := strings.Split(latest, ".")

	for i := 0; i < len(cParts) && i < len(lParts); i++ {
		var cVal, lVal int
		fmt.Sscanf(cParts[i], "%d", &cVal)
		fmt.Sscanf(lParts[i], "%d", &lVal)
		if lVal > cVal {
			return true
		} else if cVal > lVal {
			return false
		}
	}
	return len(lParts) > len(cParts)
}

func triggerInstallUpdateAndRestart() error {
	updatePath := getTempUpdatePath()
	if _, err := os.Stat(updatePath); err != nil {
		return fmt.Errorf("update installer not found: %w", err)
	}

	// Launch the installer with elevation via ShellExecuteW (runas verb triggers UAC prompt)
	shell32 := syscall.NewLazyDLL("shell32.dll")
	shellExecuteW := shell32.NewProc("ShellExecuteW")

	verb, _ := syscall.UTF16PtrFromString("runas")
	file, _ := syscall.UTF16PtrFromString(updatePath)
	args, _ := syscall.UTF16PtrFromString("--silent-update")
	dir, _ := syscall.UTF16PtrFromString(filepath.Dir(updatePath))

	ret, _, _ := shellExecuteW.Call(
		0,
		uintptr(unsafe.Pointer(verb)),
		uintptr(unsafe.Pointer(file)),
		uintptr(unsafe.Pointer(args)),
		uintptr(unsafe.Pointer(dir)),
		1, // SW_SHOWNORMAL
	)

	// ShellExecuteW returns a value > 32 on success
	if ret <= 32 {
		return fmt.Errorf("failed to launch update installer (ShellExecute returned %d)", ret)
	}

	// Exit the main application so the installer can overwrite files
	os.Exit(0)
	return nil
}

type UpdateWriteCounter struct {
	Total      uint64
	ContentLen uint64
	LastPct    int
	OnProgress func(percent int)
}

func (wc *UpdateWriteCounter) Write(p []byte) (int, error) {
	n := len(p)
	wc.Total += uint64(n)
	if wc.ContentLen > 0 {
		percent := int((float64(wc.Total) / float64(wc.ContentLen)) * 100)
		if percent > 100 {
			percent = 100
		}
		if percent != wc.LastPct {
			wc.LastPct = percent
			wc.OnProgress(percent)
		}
	}
	return n, nil
}
