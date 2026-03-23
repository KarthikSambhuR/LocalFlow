# LocalFlow

A minimal, high-performance, 100% offline dictation and transcription overlay powered by Whisper.cpp and Wails.

LocalFlow listens globally on your system, transcribes speech fully on the local processor, and automatically pastes the result directly into the active text field or document application.

---

## Key Features

### 1. Minimal Dictation Overlay
* **Unobtrusive Display**: Renders as a Stadium-shaped bar overlay on top of all windows without stealing focus or interrupting keyboard workflows.
* **Live Audio Visualizer**: Provides real-time frequency feedback to ensure correct microphone operation.
* **Smart Focus Management**: Configured as an adaptive transparent viewport avoiding cursor loss and window activation conflicts.

### 2. High-Performance Offline Inference
* **Whisper Core Acceleration**: Executes through optimized, C-mapped memory weight structures communicating natively with hardware threads.
* **Zero Cloud Interaction**: Transcriptions never leave the local machine, ensuring absolute privacy compliance and network independence.
* **Hallucination Suppression**: Automatic cleaning algorithms prune static breaks, repetitive sequences, or silent frame metadata before delivery.

### 3. Intelligent Input Subsystem
* **Default OS Safety Intercepts (Windows)**: Incorporates continuous safety timers directly intended to prevent secondary unintended triggers (such as the default Start Menu mechanism) upon final voice hold triggers finishing natively.
* **Dynamically Mapped Trigger Grid**: Operates over fully configurable secondary combinator keycaps managed cleanly through continuous JSON updates directly into standard memory architectures concurrently.

### 4. Aesthetic Design Modules
* **Dynamic Frame Mapping**: Seamless descriptions uniform setups across sidebar dashboards correctly.
* **Micro Amplification nodes**: Directly incorporates micro gain multipliers prior to Whisper entry for users operating low-output auxiliary microphone rigs cleanly.

---

## Getting Started

### Prerequisites
* **Go** (v1.18+)
* **Node.js** (v18+) & **npm**
* **Wails CLI**: `go install github.com/wailsapp/wails/v2/cmd/wails@latest`
* **C-Compiler Support**: CGO must be enabled on the host system to correctly link compiled Whisper C headers.

### Installation
1. Clone the repository layouts bundles:
   ```bash
   git clone https://github.com/KarthikSambhuR/LocalFlow.git
   cd LocalFlow
   ```
2. Download Whisper Weights (e.g. `ggml-tiny.en.bin`):
   * Create a `/models/` directory inside the workspace.
   * Place the binary weight files holding tensors safely inside.
3. Launch development server scripts:
   ```bash
   wails dev
   ```

### Application Caches
Data logs concurrency configurations execute via high-frequency local SQLite nodes managed cleanly alongside raw audio WAV archives with standard automated cleanup variables accurately.

---

*LocalFlow dictation node frameworks supported via Go and Javascript interfaces.*
