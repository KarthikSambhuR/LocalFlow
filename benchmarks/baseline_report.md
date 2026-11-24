# LocalFlow Optimization & Cleanup Report (Baseline)

> **Status:** Pre-change baseline captured. No code or repository files have been modified.

---

## 1. Prioritized Fix List (Highest → Lowest Priority)

1. **Fix per-sample WAV write bottleneck**
   * Buffer PCM `float32 → int16` conversion into a single `[]byte` slice and write once in [audio_cache.go](file:///d:/Projects/LocalFlow/audio_cache.go#L103-L111) instead of calling `binary.Write` 16,000 times per second of audio.
2. **Fix duplicate frontend event listeners on tab switch**
   * Add initialization guards to `setupModelsSettings()`, `setupDictionary()`, and `setupManglishPersonalization()` in [settings_handlers.js](file:///d:/Projects/LocalFlow/frontend/src/settings_handlers.js) so clicking tabs in [main.js](file:///d:/Projects/LocalFlow/frontend/src/main.js#L121-L129) does not stack `EventsOn` handlers and multiply DOM re-renders.
3. **Remove `robotgo` dependency**
   * Replace the 4 `robotgo` calls in [app.go](file:///d:/Projects/LocalFlow/app.go#L1286-L1289), [app.go](file:///d:/Projects/LocalFlow/app.go#L1361), and [app.go](file:///d:/Projects/LocalFlow/app.go#L1847) with a small Win32 `user32.dll` `SendInput` wrapper and drop `github.com/go-vgo/robotgo` (and its transitive packages) from [go.mod](file:///d:/Projects/LocalFlow/go.mod#L9).
4. **Eliminate duplicate `ggml-vulkan.dll` and build-only libs from distribution**
   * Consolidate `lib/` and `lib/dll/` so only one set of `ggml-vulkan.dll`, `ggml.dll`, `ggml-base.dll`, and `ggml-cpu.dll` is shipped, and exclude `.a`, `.lib`, and `.def` files from runtime payloads.
5. **Enable SQLite WAL mode and busy timeout**
   * Add `PRAGMA journal_mode=WAL;` and `PRAGMA busy_timeout=5000;` in [db.go](file:///d:/Projects/LocalFlow/db.go#L99-L123) to prevent `SQLITE_BUSY` errors when the Pill and Settings processes access `localflow.db` concurrently, and version schema migrations instead of running `ALTER TABLE` on every startup.
6. **Reduce dictation end-to-end latency**
   * Trim or remove the hardcoded `350 ms` pre-paste sleep and `650 ms` post-paste hide delay in [app.go](file:///d:/Projects/LocalFlow/app.go#L1846-L1852) (since the overlay already uses `WS_EX_NOACTIVATE`).
7. **Split frontend into separate Pill and Settings entrypoints**
   * Create a minimal `pill.html` entrypoint for `runPillOverlay` in [main.go](file:///d:/Projects/LocalFlow/main.go#L111) so the background overlay does not parse/mount [dom.js](file:///d:/Projects/LocalFlow/frontend/src/dom.js), [settings_handlers.js](file:///d:/Projects/LocalFlow/frontend/src/settings_handlers.js), [meetings_handler.js](file:///d:/Projects/LocalFlow/frontend/src/meetings_handler.js), [dashboard.js](file:///d:/Projects/LocalFlow/frontend/src/dashboard.js), and 747 KB of unused logos.
8. **Eliminate 1-second `loadConfig()` disk polling**
   * Replace the 1-second `ticker.C` disk read/JSON unmarshal loop in [app.go](file:///d:/Projects/LocalFlow/app.go#L774-L783) (and 40+ scattered `loadConfig()` calls) with an in-memory config cache updated via change notification or file `ModTime` check.
9. **Optimize real-time audio callback (`onRec`)**
   * Replace the two `a.mutex` locks per audio frame in [app.go](file:///d:/Projects/LocalFlow/app.go#L652-L682) with an `atomic.Bool` check, pre-allocate `a.audioBuffer` capacity when recording starts, and throttle `volume-data` Wails IPC events to ~20–30 Hz.
10. **Stop downloading an already-bundled font during onboarding**
    * Remove the GitHub download of `Urbanist-Variable.ttf` from `DownloadEssentialAssets()` in [settings_app.go](file:///d:/Projects/LocalFlow/settings_app.go#L1213-L1220) (and the redundant `/fonts/` handler in [main.go](file:///d:/Projects/LocalFlow/main.go#L198-L215)) since `Urbanist-Variable.ttf` is already embedded via [frontend/public/fonts/Urbanist-Variable.ttf](file:///d:/Projects/LocalFlow/frontend/public/fonts/Urbanist-Variable.ttf).
11. **Skip ONNX initialization in the Settings window**
    * Move `InitONNXEnvironment()` in [main.go](file:///d:/Projects/LocalFlow/main.go#L43-L58) after the `--settings` / `--home` early returns (or lazy-load it on first Conformer use) so the Settings UI process does not load `onnxruntime.dll`.
12. **Stream `/audio/` files instead of reading into RAM**
    * Replace `os.ReadFile` in [main.go](file:///d:/Projects/LocalFlow/main.go#L184-L196) with `http.ServeFile` for faster playback and HTTP `Range` seeking on long meeting recordings.
13. **Merge `startLLMServer` and `startSettingsLLMServer`**
    * Deduplicate the ~350 lines of `llama-server.exe` startup/health-polling logic in [app.go](file:///d:/Projects/LocalFlow/app.go#L363-L525) and [app.go](file:///d:/Projects/LocalFlow/app.go#L2332-L2546) into one shared helper with consistent default models.
14. **Push update status via events instead of 1-second polling**
    * Remove `setInterval(checkStatus, 1000)` in [main.js](file:///d:/Projects/LocalFlow/frontend/src/main.js#L252) and emit update state changes from [updater.go](file:///d:/Projects/LocalFlow/updater.go).
15. **Optimize Conformer FFT allocations**
    * Replace the recursive slice-allocating `fft()` in [conformer.go](file:///d:/Projects/LocalFlow/conformer.go#L24-L46) with an in-place iterative FFT.
16. **Evaluate consolidating Pill + Settings into one process**
    * Host both windows from a single Wails/tray process to remove file-based IPC (`llama_server_port.txt`, `llm_meeting_busy.txt`, `localflow_update_state.json`) and halve WebView2 overhead when Home is open.
17. **Remove dead code and unused assets**
    * Delete `transcribeOld()` in [app.go](file:///d:/Projects/LocalFlow/app.go#L1291-L1384).
    * Remove empty `internal/postprocess` directory.
    * Remove unused `cacheMaxAge` and duplicate `ensureAudioCacheDir()` in [audio_cache.go](file:///d:/Projects/LocalFlow/audio_cache.go#L13).
    * Deduplicate `escapeHtml` across [dashboard.js](file:///d:/Projects/LocalFlow/frontend/src/dashboard.js#L16), [markdown_parser.js](file:///d:/Projects/LocalFlow/frontend/src/markdown_parser.js#L223), and [meetings_handler.js](file:///d:/Projects/LocalFlow/frontend/src/meetings_handler.js#L1053).
    * Delete unused [frontend/src/app.css](file:///d:/Projects/LocalFlow/frontend/src/app.css), unused `.woff2` fonts in [frontend/src/assets/fonts](file:///d:/Projects/LocalFlow/frontend/src/assets/fonts), and the duplicate [fonts/Urbanist-Variable.ttf](file:///d:/Projects/LocalFlow/fonts/Urbanist-Variable.ttf).
    * Remove the global `* { font-family: 'Urbanist', sans-serif !important; }` override in [style.css](file:///d:/Projects/LocalFlow/frontend/src/style.css#L54) so monospace/code elements can render properly.
    * Clean tracked binaries/archives (`LocalFlow.exe`, `installer/payload.zip`, `assets/Project LocalFlow.mp4`, duplicate `dll_builder/whisper.cpp` tree) out of the repo via `.gitignore`.

---

## 2. "Before" Baseline Benchmarks

All measurements below were collected directly from the current repository state prior to any edits.

### A. Storage & Binary Sizes

| Artifact / Directory | Files | Size (Bytes) | Size (MB / KB) | Notes |
| --- | ---: | ---: | ---: | --- |
| `LocalFlow.exe` | 1 | 34,441,516 | 32.85 MB | Compiled Wails binary in root |
| `installer/payload.zip` | 1 | 76,478,806 | 72.94 MB | Installer payload archive in root |
| `lib/` (total) | 35 | 210,128,456 | 200.39 MB | Includes `lib/` + `lib/dll/` |
| `lib/dll/` (subset) | — | 106,640,527 | 101.70 MB | Runtime DLLs + `.lib` / `.a` / `.def` |
| `lib/ggml-vulkan.dll` | 1 | 73,986,560 | 70.56 MB | Duplicate #1 |
| `lib/dll/ggml-vulkan.dll` | 1 | 58,025,472 | 55.34 MB | Duplicate #2 |
| `frontend/dist/` (embedded) | 11 | 1,074,931 | 1.03 MB | Embedded into both Pill & Settings |
| `frontend/src/assets/` | — | 801,412 | 782.63 KB | Images + unused `.woff2` fonts |

#### `frontend/dist/` Bundle Breakdown

| File | Size (Bytes) | Size (KB) |
| --- | ---: | ---: |
| `superwhisper-logo.3733f5c7.png` | 285,795 | 279.10 KB |
| `hf-logo.9cf16f4f.png` | 185,450 | 181.10 KB |
| `index.f400778b.js` | 165,086 | 161.22 KB |
| `logo-universal.386a7b05.png` | 90,915 | 88.78 KB |
| `Urbanist-Variable.ttf` | 84,840 | 82.85 KB |
| `index.e89bba3e.css` | 76,773 | 74.97 KB |
| `ai4bharat-logo.b44dd753.png` | 72,953 | 71.24 KB |
| `sarvam-logo.73e61b6d.jpg` | 62,503 | 61.04 KB |
| `openai-logo.8ef6019b.png` | 36,832 | 35.97 KB |
| `qwen-logo.fd1c5725.png` | 13,333 | 13.02 KB |
| `index.html` | 451 | 0.44 KB |

---

### B. Codebase & Dependency Metrics

| Metric | Baseline Value | Where |
| --- | ---: | --- |
| Root Go files | 20 | `d:\Projects\LocalFlow\*.go` |
| Root Go lines of code | 8,039 | Largest: `app.go` (2,970), `settings_app.go` (1,691) |
| Frontend JS/CSS files | 18 | `frontend/src/**/*.js,css` |
| Frontend JS/CSS lines of code | 9,452 | Largest: `settings_handlers.js` (1,815), `dom.js` (1,122), `meetings.css` (2,034) |
| Go modules (`go list -m all`) | 175 | Includes `robotgo` + transitive X11/OCR/screenshot deps |
| Direct `loadConfig()` call sites | 47 | `settings_app.go` (27), `app.go` (15), `main.go` (4), `config.go` (1), etc. |
| `robotgo` call sites | 4 | Only `app.go` lines 1287, 1288, 1361, 1847 |

---

### C. Runtime, Latency & Concurrency Baseline

| Check | Baseline Observation | Impact |
| --- | --- | --- |
| **Post-transcription dictation sleep** | `350 ms` pre-paste + `650 ms` post-paste = **1,000 ms** | Fixed 1.0 s added to every dictation |
| **Background config polling** | `1,000 ms` ticker in `app.go` | Reads & parses `localflow_config.json` every 1 s forever |
| **Frontend updater polling** | `1,000 ms` `setInterval` in `main.js` | Polls `GetUpdateStatus()` over Wails IPC every 1 s forever |
| **WAV file write pattern** | 1 `binary.Write` syscall per sample (`audio_cache.go`) | 16,000 unbuffered syscalls/sec of audio |
| **Audio callback locking** | 2 `a.mutex` locks/frame + unthrottled `volume-data` IPC | High lock & IPC frequency during recording |
| **SQLite concurrency config** | No `WAL`, no `busy_timeout` (`db.go`) | Risk of `SQLITE_BUSY` between Pill & Settings processes |
| **Pill overlay DOM overhead** | Loads full 1.03 MB `frontend/dist` | Pill process mounts full Settings/Meetings/Dashboard DOM |
| **Baseline `go test -v ./...`** | **FAIL** (`exit status 0xc0000135`, 1.972 s) | Fails without `lib\dll` on `PATH`; also scans `dll_builder/.../flatted` |
