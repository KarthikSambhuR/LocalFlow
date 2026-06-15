package main

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"sync"
	"time"

	"github.com/gen2brain/malgo"
	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
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
	cfg := loadConfig()
	pruneAudioCache(cfg.AudioRetentionDays)
	pruneRecordings(cfg.TranscriptionRetentionDays)

	// Restore the window to the size/state it was in when the user last closed it.
	go func() {
		// Give the WebView a moment to fully initialize before issuing window calls.
		time.Sleep(150 * time.Millisecond)
		if cfg.WindowMaximized {
			wailsRuntime.WindowMaximise(s.ctx)
		} else {
			wailsRuntime.WindowSetSize(s.ctx, cfg.WindowWidth, cfg.WindowHeight)
		}
	}()
}

func (s *SettingsApp) SetRetention(audioDays int, transcriptionDays int) {
	cfg := loadConfig()
	cfg.AudioRetentionDays = audioDays
	cfg.TranscriptionRetentionDays = transcriptionDays
	saveConfig(cfg)
}

func (s *SettingsApp) PurgeNow() {
	// 1. Delete all WAV files in the audio cache directory
	entries, err := os.ReadDir(audioCacheDir)
	if err == nil {
		for _, entry := range entries {
			if !entry.IsDir() && filepath.Ext(entry.Name()) == ".wav" {
				_ = os.Remove(filepath.Join(audioCacheDir, entry.Name()))
			}
		}
	}
	// 2. Clear all rows from recordings table
	if db != nil {
		_, _ = db.Exec("DELETE FROM recordings")
	}
}

func (s *SettingsApp) GetMicrophones() []string {
	mctx, err := malgo.InitContext(nil, malgo.ContextConfig{}, nil)
	if err != nil {
		return []string{"Default"}
	}
	defer mctx.Free()
	devices, err := mctx.Devices(malgo.Capture)
	if err != nil {
		return []string{"Default"}
	}
	out := []string{"Default"}
	for _, info := range devices {
		out = append(out, info.Name())
	}
	return out
}

func (s *SettingsApp) SetMicrophone(name string) {
	cfg := loadConfig()
	cfg.ActiveMicrophone = name
	saveConfig(cfg)
}

func (s *SettingsApp) GetInitialRoute() string {
	return s.InitialRoute
}

func (s *SettingsApp) GetRecordings() []Recording {
	recs, _ := GetRecordings()
	return recs
}

func (s *SettingsApp) GetAnalytics() []Analytics {
	an, _ := GetAnalytics()
	return an
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

func (s *SettingsApp) SetProcessingEngine(engine string) {
	cfg := loadConfig()
	if engine != "vulkan" && engine != "cuda" {
		engine = "cpu"
	}
	cfg.ProcessingEngine = engine
	saveConfig(cfg)
}

func (s *SettingsApp) GetGPUDevices() []string {
	return GetGPUDevicesList()
}

func (s *SettingsApp) SetSelectedGPU(gpuName string) {
	cfg := loadConfig()
	cfg.SelectedGPU = gpuName
	saveConfig(cfg)
}

func (s *SettingsApp) SetKeybinds(key1 uint16, name1 string, key2 uint16, name2 string) {
	cfg := loadConfig()
	cfg.Keybind1Rawcode = key1
	cfg.Keybind1Name = name1
	cfg.Keybind2Rawcode = key2
	cfg.Keybind2Name = name2
	cfg.KeybindCaptureActive = false
	saveConfig(cfg)
}

func (s *SettingsApp) SetKeybindCaptureActive(active bool) {
	cfg := loadConfig()
	cfg.KeybindCaptureActive = active
	saveConfig(cfg)
}

func (s *SettingsApp) SetStartOnStartup(enabled bool) error {
	cfg := loadConfig()
	if err := setAutoStart(enabled); err != nil {
		return err
	}
	cfg.StartOnStartup = enabled
	return saveConfig(cfg)
}

func (s *SettingsApp) SetStartMinimized(enabled bool) error {
	cfg := loadConfig()
	cfg.StartMinimized = enabled
	return saveConfig(cfg)
}

func (s *SettingsApp) GetPlatform() string {
	return runtime.GOOS
}

func (s *SettingsApp) SelectDataFolder() (string, error) {
	return wailsRuntime.OpenDirectoryDialog(s.ctx, wailsRuntime.OpenDialogOptions{
		Title: "Select LocalFlow Data Folder",
	})
}

func (s *SettingsApp) SetDataFolder(path string) error {
	cfg := loadConfig()
	if cfg.DataFolder == path {
		return nil
	}

	// Create the new folder if it doesn't exist
	err := os.MkdirAll(path, 0755)
	if err != nil {
		return err
	}

	oldDataDir := getDataDir(cfg)

	oldDbPath := filepath.Join(oldDataDir, "localflow.db")
	newDbPath := filepath.Join(path, "localflow.db")

	// 1. Close current database connection
	closeDB()

	// 2. Copy SQLite database file if it exists at old location
	if _, err := os.Stat(oldDbPath); err == nil {
		dbData, err := os.ReadFile(oldDbPath)
		if err == nil {
			_ = os.WriteFile(newDbPath, dbData, 0644)
		}
	}

	// 3. Copy WAV files from old audio_cache to new audio_cache
	oldAudioDir := filepath.Join(oldDataDir, "audio_cache")
	newAudioDir := filepath.Join(path, "audio_cache")
	_ = os.MkdirAll(newAudioDir, 0755)

	entries, err := os.ReadDir(oldAudioDir)
	if err == nil {
		for _, entry := range entries {
			if !entry.IsDir() && filepath.Ext(entry.Name()) == ".wav" {
				oldFile := filepath.Join(oldAudioDir, entry.Name())
				newFile := filepath.Join(newAudioDir, entry.Name())
				fileData, err := os.ReadFile(oldFile)
				if err == nil {
					_ = os.WriteFile(newFile, fileData, 0644)
					_ = os.Remove(oldFile)
				}
			}
		}
	}

	// 3.5. Move model files from the previous data folder and legacy project folder.
	newModelsDir := filepath.Join(path, "models")
	_ = os.MkdirAll(newModelsDir, 0755)
	moveModelFiles(filepath.Join(oldDataDir, "models"), newModelsDir)
	if oldDataDir != "." {
		moveModelFiles("models", newModelsDir)
	}

	// Update config
	cfg.DataFolder = path
	saveConfig(cfg)

	// 4. Re-open / initialize database at new path
	return initDB()
}

func getDataDir(cfg Config) string {
	if cfg.DataFolder != "" && cfg.DataFolder != "Default" {
		return cfg.DataFolder
	}
	return getBaseAppDir()
}

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

func copyFile(src string, dst string) error {
	data, err := os.ReadFile(src)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(dst), 0755); err != nil {
		return err
	}
	return os.WriteFile(dst, data, 0644)
}

func moveModelFiles(srcDir string, dstDir string) {
	if srcDir == dstDir {
		return
	}
	entries, err := os.ReadDir(srcDir)
	if err != nil {
		return
	}
	for _, entry := range entries {
		if entry.IsDir() || filepath.Ext(entry.Name()) != ".bin" {
			continue
		}
		src := filepath.Join(srcDir, entry.Name())
		dst := filepath.Join(dstDir, entry.Name())
		if fileExists(dst) {
			_ = os.Remove(src)
			continue
		}
		if err := copyFile(src, dst); err == nil {
			_ = os.Remove(src)
		}
	}
}

type WhisperModelInfo struct {
	ID               string `json:"id"`
	Name             string `json:"name"`
	Filename         string `json:"filename"`
	URL              string `json:"url"`
	SizeMB           int    `json:"size_mb"`
	SpeedLabel       string `json:"speed_label"`
	SpeedDescription string `json:"speed_description"`
	Description      string `json:"description"`
	Language         string `json:"language"`
	ModelType        string `json:"model_type"` // "whisper" or "llm"
}

var AvailableModels = []WhisperModelInfo{
	{
		ID:               "tiny",
		Name:             "Tiny (English)",
		Filename:         "ggml-tiny.en.bin",
		URL:              "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin",
		SizeMB:           75,
		SpeedLabel:       "Super fast",
		SpeedDescription: "~10-15x realtime",
		Description:      "Fastest startup and lowest memory usage.",
		Language:         "english",
		ModelType:        "whisper",
	},
	{
		ID:               "base",
		Name:             "Base (English)",
		Filename:         "ggml-base.en.bin",
		URL:              "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin",
		SizeMB:           142,
		SpeedLabel:       "Fast",
		SpeedDescription: "~6-10x realtime",
		Description:      "Good default for quick dictation.",
		Language:         "english",
		ModelType:        "whisper",
	},
	{
		ID:               "small",
		Name:             "Small (English)",
		Filename:         "ggml-small.en.bin",
		URL:              "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin",
		SizeMB:           465,
		SpeedLabel:       "Balanced",
		SpeedDescription: "~2-4x realtime",
		Description:      "Better accuracy with a noticeable speed cost.",
		Language:         "english",
		ModelType:        "whisper",
	},
	{
		ID:               "medium",
		Name:             "Medium (English)",
		Filename:         "ggml-medium.en.bin",
		URL:              "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.en.bin",
		SizeMB:           1530,
		SpeedLabel:       "Accurate",
		SpeedDescription: "~1x realtime",
		Description:      "High accuracy with heavier CPU and memory usage.",
		Language:         "english",
		ModelType:        "whisper",
	},
	{
		ID:               "large-turbo",
		Name:             "Large v3 Turbo",
		Filename:         "ggml-large-v3-turbo.bin",
		URL:              "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin",
		SizeMB:           1624,
		SpeedLabel:       "High accuracy",
		SpeedDescription: "~1-2x realtime",
		Description:      "Best quality option with optimized inference speed.",
		Language:         "english",
		ModelType:        "whisper",
	},
	{
		ID:               "qwen3-0.6b",
		Name:             "Qwen 3 0.6B (Refinement)",
		Filename:         "Qwen3-0.6B-UD-Q4_K_XL.gguf",
		URL:              "https://huggingface.co/unsloth/Qwen3-0.6B-GGUF/resolve/main/Qwen3-0.6B-UD-Q4_K_XL.gguf?download=true",
		SizeMB:           418,
		SpeedLabel:       "Fast & Lightweight",
		SpeedDescription: "Optimized for grammar and formatting correction",
		Description:      "A small but highly capable model for real-time formatting, grammar, and stutter correction.",
		Language:         "english",
		ModelType:        "llm",
	},
}

type ModelStatus struct {
	ID               string `json:"id"`
	Name             string `json:"name"`
	Filename         string `json:"filename"`
	SizeMB           int    `json:"size_mb"`
	SpeedLabel       string `json:"speed_label"`
	SpeedDescription string `json:"speed_description"`
	Description      string `json:"description"`
	IsDownloaded     bool   `json:"is_downloaded"`
	IsActive         bool   `json:"is_active"`
	IsDownloading    bool   `json:"is_downloading"`
	DownloadProgress int    `json:"download_progress"`
	Language         string `json:"language"`
	ModelType        string `json:"model_type"`
}

var (
	downloadLock     sync.Mutex
	downloadProgress = make(map[string]int) // modelID -> percent
)

func (s *SettingsApp) GetModelsList() []ModelStatus {
	cfg := loadConfig()
	activeFilename := cfg.ActiveModel
	if activeFilename == "" {
		activeFilename = "ggml-tiny.en.bin"
	}

	modelsDir := s.getModelsDir()
	_ = os.MkdirAll(modelsDir, 0755)

	downloadLock.Lock()
	defer downloadLock.Unlock()

	var out []ModelStatus
	for _, m := range AvailableModels {
		pathInCustom := filepath.Join(modelsDir, m.Filename)
		pathInLocal := filepath.Join("models", m.Filename)

		isDownloaded := false
		if _, err := os.Stat(pathInCustom); err == nil {
			isDownloaded = true
		} else if _, err := os.Stat(pathInLocal); err == nil {
			isDownloaded = true
		}

		progress, isDownloading := downloadProgress[m.ID]

		isActive := false
		if m.ModelType == "llm" {
			isActive = m.Filename == cfg.LLMActiveModel
		} else {
			isActive = m.Filename == activeFilename
		}

		out = append(out, ModelStatus{
			ID:               m.ID,
			Name:             m.Name,
			Filename:         m.Filename,
			SizeMB:           m.SizeMB,
			SpeedLabel:       m.SpeedLabel,
			SpeedDescription: m.SpeedDescription,
			Description:      m.Description,
			IsDownloaded:     isDownloaded,
			IsActive:         isActive,
			IsDownloading:    isDownloading,
			DownloadProgress: progress,
			Language:         m.Language,
			ModelType:        m.ModelType,
		})
	}
	return out
}

func (s *SettingsApp) getModelsDir() string {
	cfg := loadConfig()
	return filepath.Join(getDataDir(cfg), "models")
}

func (s *SettingsApp) ensureModelInDataFolder(filename string) error {
	modelsDir := s.getModelsDir()
	targetPath := filepath.Join(modelsDir, filename)
	if fileExists(targetPath) {
		return nil
	}

	legacyPath := filepath.Join("models", filename)
	if fileExists(legacyPath) {
		if err := copyFile(legacyPath, targetPath); err != nil {
			return err
		}
		_ = os.Remove(legacyPath)
		return nil
	}

	return fmt.Errorf("model file %s is not downloaded", filename)
}

// WriteCounter counts the number of bytes written to it and publishes progress.
type WriteCounter struct {
	Total      uint64
	ContentLen uint64
	OnProgress func(percent int)
}

func (wc *WriteCounter) Write(p []byte) (int, error) {
	n := len(p)
	wc.Total += uint64(n)
	if wc.ContentLen > 0 {
		percent := int((float64(wc.Total) / float64(wc.ContentLen)) * 100)
		if percent > 100 {
			percent = 100
		}
		wc.OnProgress(percent)
	}
	return n, nil
}

func (s *SettingsApp) DownloadModel(id string) {
	downloadLock.Lock()
	if _, exists := downloadProgress[id]; exists {
		downloadLock.Unlock()
		return
	}
	downloadProgress[id] = 0
	downloadLock.Unlock()

	var targetModel *WhisperModelInfo
	for i := range AvailableModels {
		if AvailableModels[i].ID == id {
			targetModel = &AvailableModels[i]
			break
		}
	}
	if targetModel == nil {
		downloadLock.Lock()
		delete(downloadProgress, id)
		downloadLock.Unlock()
		return
	}

	go func() {
		defer func() {
			downloadLock.Lock()
			delete(downloadProgress, id)
			downloadLock.Unlock()
		}()

		modelsDir := s.getModelsDir()
		_ = os.MkdirAll(modelsDir, 0755)

		tmpPath := filepath.Join(modelsDir, targetModel.Filename+".tmp")
		finalPath := filepath.Join(modelsDir, targetModel.Filename)

		resp, err := http.Get(targetModel.URL)
		if err != nil {
			wailsRuntime.EventsEmit(s.ctx, "model-download-error", id, err.Error())
			return
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			wailsRuntime.EventsEmit(s.ctx, "model-download-error", id, fmt.Sprintf("HTTP %d", resp.StatusCode))
			return
		}

		out, err := os.Create(tmpPath)
		if err != nil {
			wailsRuntime.EventsEmit(s.ctx, "model-download-error", id, err.Error())
			return
		}
		defer func() {
			out.Close()
			_ = os.Remove(tmpPath)
		}()

		counter := &WriteCounter{
			ContentLen: uint64(resp.ContentLength),
			OnProgress: func(percent int) {
				downloadLock.Lock()
				downloadProgress[id] = percent
				downloadLock.Unlock()
				wailsRuntime.EventsEmit(s.ctx, "model-download-progress", id, percent)
			},
		}

		_, err = io.Copy(out, io.TeeReader(resp.Body, counter))
		if err != nil {
			wailsRuntime.EventsEmit(s.ctx, "model-download-error", id, err.Error())
			return
		}

		out.Close()

		err = os.Rename(tmpPath, finalPath)
		if err != nil {
			wailsRuntime.EventsEmit(s.ctx, "model-download-error", id, err.Error())
			return
		}

		wailsRuntime.EventsEmit(s.ctx, "model-download-done", id)
	}()
}

func (s *SettingsApp) SetActiveModel(filename string) error {
	var targetModel *WhisperModelInfo
	for i := range AvailableModels {
		if AvailableModels[i].Filename == filename {
			targetModel = &AvailableModels[i]
			break
		}
	}
	if targetModel == nil {
		return fmt.Errorf("unknown model: %s", filename)
	}

	if err := s.ensureModelInDataFolder(filename); err != nil {
		return err
	}

	cfg := loadConfig()
	if targetModel.ModelType == "llm" {
		cfg.LLMActiveModel = filename
	} else {
		cfg.ActiveModel = filename
	}
	return saveConfig(cfg)
}

func (s *SettingsApp) DeleteModel(filename string) error {
	var targetModel *WhisperModelInfo
	for i := range AvailableModels {
		if AvailableModels[i].Filename == filename {
			targetModel = &AvailableModels[i]
			break
		}
	}
	if targetModel == nil {
		return fmt.Errorf("model info not found")
	}

	modelsDir := s.getModelsDir()

	downloadedList := []string{}
	for _, m := range AvailableModels {
		if m.ModelType != targetModel.ModelType {
			continue
		}
		pathInCustom := filepath.Join(modelsDir, m.Filename)
		pathInLocal := filepath.Join("models", m.Filename)

		if _, err := os.Stat(pathInCustom); err == nil {
			downloadedList = append(downloadedList, pathInCustom)
		} else if _, err := os.Stat(pathInLocal); err == nil {
			downloadedList = append(downloadedList, pathInLocal)
		}
	}

	if len(downloadedList) <= 1 {
		return fmt.Errorf("cannot delete the only %s model left on disk; download another model first", targetModel.ModelType)
	}

	var pathToDelete string
	pathInCustom := filepath.Join(modelsDir, filename)
	pathInLocal := filepath.Join("models", filename)

	if _, err := os.Stat(pathInCustom); err == nil {
		pathToDelete = pathInCustom
	} else if _, err := os.Stat(pathInLocal); err == nil {
		pathToDelete = pathInLocal
	} else {
		return fmt.Errorf("model file not found on disk")
	}

	err := os.Remove(pathToDelete)
	if err != nil {
		return err
	}

	cfg := loadConfig()
	if targetModel.ModelType == "llm" {
		if cfg.LLMActiveModel == filename {
			for _, m := range AvailableModels {
				if m.ModelType != "llm" || m.Filename == filename {
					continue
				}
				pC := filepath.Join(modelsDir, m.Filename)
				pL := filepath.Join("models", m.Filename)
				if _, err := os.Stat(pC); err == nil {
					cfg.LLMActiveModel = m.Filename
					break
				} else if _, err := os.Stat(pL); err == nil {
					cfg.LLMActiveModel = m.Filename
					break
				}
			}
			_ = saveConfig(cfg)
		}
	} else {
		if cfg.ActiveModel == filename {
			for _, m := range AvailableModels {
				if m.ModelType == "llm" || m.Filename == filename {
					continue
				}
				pC := filepath.Join(modelsDir, m.Filename)
				pL := filepath.Join("models", m.Filename)
				if _, err := os.Stat(pC); err == nil {
					cfg.ActiveModel = m.Filename
					break
				} else if _, err := os.Stat(pL); err == nil {
					cfg.ActiveModel = m.Filename
					break
				}
			}
			_ = saveConfig(cfg)
		}
	}

	return nil
}

func (s *SettingsApp) IsSetupCompleted() bool {
	return GetProfileValue("setup_completed") == "true"
}

func (s *SettingsApp) GetProfileName() string {
	return GetProfileValue("username")
}

func (s *SettingsApp) SetProfileName(name string) {
	_ = SetProfileValue("username", name)
	_ = SetProfileValue("setup_completed", "true")
}

func (s *SettingsApp) DownloadEssentialAssets() {
	go func() {
		cfg := loadConfig()
		dataDir := getBaseAppDir()
		if cfg.DataFolder != "" && cfg.DataFolder != "Default" {
			dataDir = cfg.DataFolder
		}

		fontsDir := filepath.Join(dataDir, "fonts")
		modelsDir := filepath.Join(dataDir, "models")
		_ = os.MkdirAll(fontsDir, 0755)
		_ = os.MkdirAll(modelsDir, 0755)

		// 1. Download Poppins Regular Font
		wailsRuntime.EventsEmit(s.ctx, "setup-progress", 0, "Downloading Poppins Regular font...")
		poppinsRegularURL := "https://github.com/google/fonts/raw/main/ofl/poppins/Poppins-Regular.ttf"
		poppinsRegularPath := filepath.Join(fontsDir, "Poppins-Regular.ttf")
		if err := downloadFileDirect(poppinsRegularURL, poppinsRegularPath); err != nil {
			wailsRuntime.EventsEmit(s.ctx, "setup-error", fmt.Sprintf("Failed to download Poppins Regular font: %v", err))
			return
		}

		// 2. Download Poppins Bold Font
		wailsRuntime.EventsEmit(s.ctx, "setup-progress", 10, "Downloading Poppins Bold font...")
		poppinsBoldURL := "https://github.com/google/fonts/raw/main/ofl/poppins/Poppins-Bold.ttf"
		poppinsBoldPath := filepath.Join(fontsDir, "Poppins-Bold.ttf")
		if err := downloadFileDirect(poppinsBoldURL, poppinsBoldPath); err != nil {
			wailsRuntime.EventsEmit(s.ctx, "setup-error", fmt.Sprintf("Failed to download Poppins Bold font: %v", err))
			return
		}

		// 3. Download Whisper Tiny Model
		wailsRuntime.EventsEmit(s.ctx, "setup-progress", 20, "Downloading default Whisper Tiny model (75 MB)...")

		var tinyModel *WhisperModelInfo
		for i := range AvailableModels {
			if AvailableModels[i].ID == "tiny" {
				tinyModel = &AvailableModels[i]
				break
			}
		}
		if tinyModel == nil {
			wailsRuntime.EventsEmit(s.ctx, "setup-error", "Model info not found")
			return
		}

		tmpModelPath := filepath.Join(modelsDir, tinyModel.Filename+".tmp")
		finalModelPath := filepath.Join(modelsDir, tinyModel.Filename)

		resp, err := http.Get(tinyModel.URL)
		if err != nil {
			wailsRuntime.EventsEmit(s.ctx, "setup-error", fmt.Sprintf("Failed to download model: %v", err))
			return
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			wailsRuntime.EventsEmit(s.ctx, "setup-error", fmt.Sprintf("Failed to download model: HTTP %d", resp.StatusCode))
			return
		}

		out, err := os.Create(tmpModelPath)
		if err != nil {
			wailsRuntime.EventsEmit(s.ctx, "setup-error", fmt.Sprintf("Failed to create file: %v", err))
			return
		}
		defer func() {
			out.Close()
			_ = os.Remove(tmpModelPath)
		}()

		counter := &WriteCounter{
			ContentLen: uint64(resp.ContentLength),
			OnProgress: func(percent int) {
				overallPercent := 20 + int(float64(percent)*0.8)
				wailsRuntime.EventsEmit(s.ctx, "setup-progress", overallPercent, fmt.Sprintf("Downloading Whisper Tiny model... %d%%", percent))
			},
		}

		_, err = io.Copy(out, io.TeeReader(resp.Body, counter))
		if err != nil {
			wailsRuntime.EventsEmit(s.ctx, "setup-error", fmt.Sprintf("Download stream interrupted: %v", err))
			return
		}
		out.Close()

		err = os.Rename(tmpModelPath, finalModelPath)
		if err != nil {
			wailsRuntime.EventsEmit(s.ctx, "setup-error", fmt.Sprintf("Failed to finalize model file: %v", err))
			return
		}

		// Automatically set the downloaded Tiny model as the active model in the config
		cfg.ActiveModel = tinyModel.Filename
		_ = saveConfig(cfg)

		wailsRuntime.EventsEmit(s.ctx, "setup-progress", 100, "Downloads complete!")
		wailsRuntime.EventsEmit(s.ctx, "setup-done")
	}()
}

func downloadFileDirect(url string, filepath string) error {
	resp, err := http.Get(url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("bad status: %s", resp.Status)
	}

	out, err := os.Create(filepath)
	if err != nil {
		return err
	}
	defer out.Close()

	_, err = io.Copy(out, resp.Body)
	return err
}

func (s *SettingsApp) AddDictionaryWord(word string) error {
	return AddDictionaryWord(word)
}

func (s *SettingsApp) DeleteDictionaryWord(word string) error {
	return DeleteDictionaryWord(word)
}

func (s *SettingsApp) GetDictionaryWords() []string {
	words, _ := GetDictionaryWords()
	if words == nil {
		return []string{}
	}
	return words
}

func (s *SettingsApp) SetLLMEnabled(enabled bool) {
	cfg := loadConfig()
	cfg.LLMEnabled = enabled
	saveConfig(cfg)
}

func (s *SettingsApp) SetLLMRefinementMode(mode string) error {
	cfg := loadConfig()
	cfg.LLMRefinementMode = normalizeLLMRefinementMode(mode)
	return saveConfig(cfg)
}

func (s *SettingsApp) SetLLMTone(tone string) error {
	cfg := loadConfig()
	cfg.LLMTone = normalizeLLMTone(tone)
	return saveConfig(cfg)
}
