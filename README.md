# LocalFlow

<p align="center">
  <img src="https://raw.githubusercontent.com/KarthikSambhuR/LocalFlow/master/build/appicon.png" alt="LocalFlow Logo" width="120" errorshouldbeignored="true"/>
</p>

<h3 align="center">LocalFlow</h3>

<p align="center">
  A minimal, high-performance, 100% offline dictation and transcription overlay powered by Whisper.cpp and Wails.
</p>

<p align="center">
  <a href="https://github.com/KarthikSambhuR/LocalFlow/releases/latest">
    <img src="https://img.shields.io/github/v/release/KarthikSambhuR/LocalFlow?style=flat-square&color=007acc" alt="Latest Release">
  </a>
  <img src="https://img.shields.io/github/license/KarthikSambhuR/LocalFlow?style=flat-square" alt="License">
  <img src="https://img.shields.io/github/stars/KarthikSambhuR/LocalFlow?style=flat-square" alt="Stars">
</p>

---

LocalFlow listens globally on your system, transcribes speech fully on your local processor, and automatically pastes the result directly into your active text field or document application.

## Quick Start and Installation

### Option 1: Quick Install (Windows PowerShell)
Open PowerShell as an Administrator and run the following command to download and install LocalFlow instantly:

```powershell
iex (irm https://raw.githubusercontent.com/KarthikSambhuR/LocalFlow/master/install.ps1)
```

### Option 2: Manual Download

Prefer a direct download? Grab the latest pre-compiled binaries for your operating system from the Releases page:

[Download the Latest Release](https://github.com/KarthikSambhuR/LocalFlow/releases/latest)

---

## Key Features

### Minimal Dictation Overlay

* **Unobtrusive Display**: Renders as a stadium-shaped bar overlay on top of all windows without stealing focus or interrupting keyboard workflows.
* **Live Audio Visualizer**: Provides real-time frequency feedback to ensure correct microphone operation.
* **Smart Focus Management**: Configured as an adaptive transparent viewport avoiding cursor loss and window activation conflicts.

### High-Performance Offline Inference

* **Whisper Core Acceleration**: Executes through optimized, C-mapped memory weight structures communicating natively with hardware threads.
* **Zero Cloud Interaction**: Transcriptions never leave your local machine, ensuring absolute privacy compliance and network independence.
* **Hallucination Suppression**: Automatic cleaning algorithms prune static breaks, repetitive sequences, or silent frame metadata before delivery.

### Intelligent Input Subsystem

* **Default OS Safety Intercepts (Windows)**: Incorporates continuous safety timers directly intended to prevent secondary unintended triggers (such as the default Start Menu mechanism) upon final voice hold triggers finishing natively.
* **Dynamically Mapped Trigger Grid**: Operates over fully configurable secondary combinator keycaps managed cleanly through continuous JSON updates directly into standard memory architectures concurrently.

### Aesthetic Design Modules

* **Dynamic Frame Mapping**: Seamless descriptions uniform setups across sidebar dashboards correctly.
* **Micro Amplification Nodes**: Directly incorporates micro gain multipliers prior to Whisper entry for users operating low-output auxiliary microphone rigs cleanly.

---

## Build from Source

If you want to modify LocalFlow or build it yourself, follow the development setup below.

### Prerequisites

* **Go** (v1.18+)
* **Node.js** (v18+) & **npm**
* **Wails CLI**: `go install github.com/wailsapp/wails/v2/cmd/wails@latest`
* **C-Compiler Support**: CGO must be enabled on the host system to correctly link compiled Whisper C headers.

### Development Setup

1. **Clone the repository:**

```bash
   git clone https://github.com/KarthikSambhuR/LocalFlow.git
   cd LocalFlow

```

2. **Download Whisper Weights:**

* Create a `/models/` directory inside the workspace root.
* Download your preferred model (e.g., `ggml-tiny.en.bin`) and place the binary weight files safely inside that folder.

3. **Launch the Development Server:**

```bash
   wails dev

```

## Application Architecture and Cache

Data logs and concurrency configurations execute via high-frequency local SQLite nodes managed cleanly alongside raw audio WAV archives with standard automated cleanup variables accurately.

---
