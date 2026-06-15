package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

const (
	AppVersion = "v1.0.0"
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

func getTempUpdatePath() string {
	return filepath.Join(os.Getenv("TEMP"), "LocalFlowSetup-Update.exe")
}

func getTempUpdateTmpPath() string {
	return filepath.Join(os.Getenv("TEMP"), "LocalFlowSetup-Update.exe.tmp")
}

// StartBackgroundUpdateCheck runs in a goroutine and checks for new GitHub releases.
func StartBackgroundUpdateCheck(ctx context.Context) {
	// Wait a moment for the frontend to settle
	time.Sleep(3 * time.Second)

	// Check if update file already exists (previously downloaded completely)
	if _, err := os.Stat(getTempUpdatePath()); err == nil {
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

	wailsRuntime.EventsEmit(ctx, "update-available", release.TagName)

	// Start downloading in background
	go func() {
		tmpPath := getTempUpdateTmpPath()
		finalPath := getTempUpdatePath()

		// Clean up any stale temp files
		_ = os.Remove(tmpPath)

		out, err := os.Create(tmpPath)
		if err != nil {
			return
		}
		defer out.Close()

		dlReq, err := http.NewRequestWithContext(ctx, "GET", downloadURL, nil)
		if err != nil {
			return
		}

		dlResp, err := client.Do(dlReq)
		if err != nil {
			return
		}
		defer dlResp.Body.Close()

		if dlResp.StatusCode != http.StatusOK {
			return
		}

		_, err = io.Copy(out, dlResp.Body)
		if err != nil {
			out.Close()
			_ = os.Remove(tmpPath)
			return
		}
		out.Close()

		// Rename to final path to mark download completion
		err = os.Rename(tmpPath, finalPath)
		if err == nil {
			wailsRuntime.EventsEmit(ctx, "update-downloaded")
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

	// Spawn the installer detached with --silent-update flag
	cmd := exec.Command(updatePath, "--silent-update")
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("failed to launch installer: %w", err)
	}

	// Exit the main application so files are not locked
	os.Exit(0)
	return nil
}
