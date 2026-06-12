//go:build !windows
package main

func setAutoStart(enabled bool) error {
	return nil // Not implemented for non-windows
}
