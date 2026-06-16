package main

import (
	"fmt"
	"os"
	"path/filepath"

	ort "github.com/yalue/onnxruntime_go"
)

// InitONNXEnvironment loads onnxruntime.dll and initializes the environment.
// It searches for the DLL only in known safe locations relative to the
// executable and working directory to avoid loading a mismatched system DLL.
func InitONNXEnvironment() error {
	var dllPath string

	// 1. Try relative to the executable directory (and its parents for dev mode)
	if exe, err := os.Executable(); err == nil {
		exeDir := filepath.Dir(exe)
		// Walk up a few levels to find lib/dll (handles wails dev temp layouts)
		for i := 0; i < 4; i++ {
			p := filepath.Join(exeDir, "lib", "dll", "onnxruntime.dll")
			if _, err := os.Stat(p); err == nil {
				dllPath = p
				break
			}
			p = filepath.Join(exeDir, "onnxruntime.dll")
			if _, err := os.Stat(p); err == nil {
				dllPath = p
				break
			}
			exeDir = filepath.Dir(exeDir)
		}
	}

	// 2. Try relative to current working directory
	if dllPath == "" {
		p := filepath.Join("lib", "dll", "onnxruntime.dll")
		if _, err := os.Stat(p); err == nil {
			dllPath, _ = filepath.Abs(p)
		}
	}

	// NOTE: We intentionally do NOT search PATH because the system may have
	// a mismatched version of onnxruntime.dll (e.g. in C:\Windows\System32).

	// Verify that the DLL file exists
	if dllPath == "" {
		return fmt.Errorf("onnxruntime.dll not found. Please ensure it is placed in the 'lib/dll' folder next to the executable")
	}

	ort.SetSharedLibraryPath(dllPath)
	err := ort.InitializeEnvironment()
	if err != nil {
		return fmt.Errorf("failed to initialize ONNX Runtime environment: %w", err)
	}

	fmt.Println("ONNX Runtime environment initialized successfully using:", dllPath)
	return nil
}

// DestroyONNXEnvironment cleans up the ONNX environment.
func DestroyONNXEnvironment() {
	_ = ort.DestroyEnvironment()
}
