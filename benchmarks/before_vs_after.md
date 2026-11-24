# LocalFlow Optimization — Before vs. After Comparison

> **Commits:** `3bdf820` → `f1e936c` (9 commits)  
> **Build Verification:** `wails build` succeeded (`build/bin/LocalFlow.exe`, 1m15.3s) & `go test -v .` passed (3/3 tests).

---

## 1. Binary, Bundle & Dependency Size

| Metric | Before | After | Delta / Improvement |
| --- | ---: | ---: | --- |
| **`LocalFlow.exe` binary** | 34,441,516 B (32.85 MB) | **20,158,464 B (19.22 MB)** | **-14.28 MB (-41.5%)** |
| **Go modules (`go list -m all`)** | 175 | **152** | **-23 modules (-13.1%)** |
| **Pill Overlay initial JS** (`index.*.js`) | 165,086 B (161.22 KiB) | **4,422 B (4.32 KiB)** | **-160,664 B (-97.3%)** |
| **Pill Overlay initial CSS** (`index.*.css`) | 76,773 B (74.97 KiB) | **1,218 B (1.19 KiB)** | **-75,555 B (-98.4%)** |
| **Frontend `src/assets/` size** | 801,412 B (782.63 KB) | **749,977 B (732.40 KB)** | **-51,435 B (-6.4%)** |

---

## 2. Codebase Size & Complexity

| Metric | Before | After | Delta / Improvement |
| --- | ---: | ---: | --- |
| **Root Go lines of code** (`*.go`) | 8,039 | **7,782** | **-257 lines (-3.2%)** |
| **Frontend JS/CSS lines** (`frontend/src`) | 9,452 | **9,402** | **-50 lines** |
| **`robotgo` call sites** | 4 | **0** | **Removed** (native Win32 `keybd_event`) |
| **LLM server launchers** | 2 (`startLLMServer` + `startSettingsLLMServer`) | **1** (`launchLlamaServerProcess`) | **Deduplicated** (~185 lines removed) |
| **Dead code / empty dirs removed** | `transcribeOld()`, `internal/postprocess`, `app.css`, unused `.woff2` fonts, `downloadFileDirect()`, `cacheMaxAge` | **0** | **Removed** |

---

## 3. Runtime, Latency & UX Improvements

| Area | Before | After | Improvement |
| --- | --- | --- | --- |
| **Post-transcription dictation sleep** | `350 ms` pre-paste + `650 ms` hide = **1,000 ms** | `50 ms` pre-paste + `300 ms` hide = **350 ms** | **-650 ms fixed latency per dictation (-65%)** |
| **WAV file saving (`audio_cache.go`)** | 1 `binary.Write` syscall per sample (16,000 syscalls/sec) | Single `[]byte` buffer + 1 `os.WriteFile` | **~16,000x fewer syscalls/sec** |
| **Audio callback (`onRec`)** | 2 `a.mutex` locks/frame, unthrottled `volume-data` IPC, un-preallocated slice | 1 lock/frame, ~30 Hz (`33 ms`) IPC throttle, 10s pre-allocated buffer | **Lower lock contention & ~70% less IPC** |
| **Config loading (`loadConfig`)** | Disk read + JSON unmarshal on every call (47 call sites + 1s ticker) | In-memory `sync.RWMutex` + `os.Stat().ModTime()` cache | **Zero disk read/JSON parse when unchanged** |
| **Updater polling (`settings_entry.js`)** | `1,000 ms` `setInterval` forever | `15,000 ms` idle, `1,000 ms` active download, stops when downloaded | **-93% idle IPC polling** |
| **SQLite concurrency (`db.go`)** | Default journal mode, no `busy_timeout`, 5 `ALTER TABLE`s every boot | `WAL` mode, `busy_timeout=5000`, `foreign_keys=ON`, `user_version` migrations | **Prevents `SQLITE_BUSY` & skips redundant migrations** |
| **Settings process startup (`main.go`)** | Loaded `onnxruntime.dll` even for `--settings`/`--home` | `InitONNXEnvironment()` runs only for Pill overlay | **Faster Settings startup & lower RAM** |
| **Audio playback (`/audio/` handler)** | `os.ReadFile` (full file into RAM) | `http.ServeFile` (streaming + HTTP `Range` seeking) | **Lower RAM & instant seeking** |
| **Onboarding (`DownloadEssentialAssets`)** | Downloaded `Urbanist-Variable.ttf` from GitHub | Uses bundled font directly | **Faster & offline-safe onboarding** |
| **Model tab listeners** | Re-registered 3 `EventsOn` handlers on every tab click | Guarded with `modelsEventsRegistered` | **Fixes exponential re-render bug** |
| **Conformer FFT (`conformer.go`)** | Recursive slice-allocating FFT | In-place iterative Cooley-Tukey FFT | **Eliminates recursive heap allocations** |

---

## 4. Remaining Follow-Ups (Not In This Pass)

* **Duplicate `ggml-vulkan.dll` (`lib/` 70.56 MB + `lib/dll/` 55.34 MB):** Requires rebuilding `llama.cpp` and `whisper.cpp` against the same `ggml` version so both binaries share one DLL set safely.
* **Single-process Pill + Settings consolidation:** Architectural refactor to host both Wails windows from one process.
