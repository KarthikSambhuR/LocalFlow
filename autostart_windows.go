//go:build windows
package main

import (
	"fmt"
	"os"

	"golang.org/x/sys/windows/registry"
)

func setAutoStart(enabled bool) error {
	k, err := registry.OpenKey(registry.CURRENT_USER, `Software\Microsoft\Windows\CurrentVersion\Run`, registry.SET_VALUE|registry.QUERY_VALUE)
	if err != nil {
		return err
	}
	defer k.Close()

	if enabled {
		exePath, err := os.Executable()
		if err != nil {
			return err
		}
		// Wrap in quotes to handle paths with spaces
		return k.SetStringValue("LocalFlow", fmt.Sprintf(`"%s"`, exePath))
	} else {
		// Ignore error if it doesn't exist (e.g., trying to delete when not set)
		_ = k.DeleteValue("LocalFlow")
		return nil
	}
}
