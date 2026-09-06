//go:build windows

package main

import (
	"syscall"
	"time"
	"unsafe"
)

const (
	gwlStyle          = ^uintptr(15) // -16 as uintptr (GWL_STYLE)
	gwlExStyle        = ^uintptr(19) // -20 as uintptr (GWLP_EXSTYLE)
	wsExTopmost       = uintptr(0x00000008) // WS_EX_TOPMOST
	wsExLayered       = uintptr(0x00080000)
	wsExTransparent   = uintptr(0x00000020)
	wsExNoActivate    = uintptr(0x08000000)
	wsExToolWindow    = uintptr(0x00000080) // Prevents taskbar icon
	swShowNoActivate  = uintptr(4)          // SW_SHOWNOACTIVATE — shows without stealing focus

	// Normal Window Styles
	wsCaption         = uintptr(0x00C00000)
	wsSysMenu         = uintptr(0x00080000)
	wsThickFrame      = uintptr(0x00040000)
	wsMinimizeBox     = uintptr(0x00020000)
	wsMaximizeBox     = uintptr(0x00010000)
	wsPopup           = uintptr(0x80000000)

	// SetWindowPos flags & handles
	hwndTopmost       = ^uintptr(0)         // (HWND)-1: HWND_TOPMOST
	swpNoSize         = uintptr(0x0001)
	swpNoMove         = uintptr(0x0002)
	swpNoActivate     = uintptr(0x0010)
	swpShowWindow     = uintptr(0x0040)
	swpFlags          = swpNoSize | swpNoMove | swpNoActivate | swpShowWindow
)

var (
	user32                = syscall.NewLazyDLL("user32.dll")
	procFindWindowW       = user32.NewProc("FindWindowW")
	procGetWindowLongPtrW = user32.NewProc("GetWindowLongPtrW")
	procSetWindowLongPtrW = user32.NewProc("SetWindowLongPtrW")
	procShowWindow        = user32.NewProc("ShowWindow")
	procSetWindowPos      = user32.NewProc("SetWindowPos")
)

// getHWND finds the Wails window handle by its title.
func getHWND() uintptr {
	title, _ := syscall.UTF16PtrFromString("LocalFlow Pill Overlay")
	hwnd, _, _ := procFindWindowW.Call(0, uintptr(unsafe.Pointer(title)))
	return hwnd
}

// switchToSettingsWindow morphs the window into a standard desktop window with title bar and resizable borders.
func switchToSettingsWindow() {
	hwnd := getHWND()
	if hwnd == 0 {
		return
	}

	// 1. Remove transparent/ghost styles (EXSTYLE)
	exStyle, _, _ := procGetWindowLongPtrW.Call(hwnd, gwlExStyle)
	newExStyle := exStyle & ^(wsExTransparent | wsExNoActivate | wsExToolWindow)
	procSetWindowLongPtrW.Call(hwnd, gwlExStyle, newExStyle)

	// 2. Add normal window borders/caption (STYLE)
	style, _, _ := procGetWindowLongPtrW.Call(hwnd, gwlStyle)
	newStyle := (style & ^wsPopup) | wsCaption | wsSysMenu | wsThickFrame | wsMinimizeBox | wsMaximizeBox
	procSetWindowLongPtrW.Call(hwnd, gwlStyle, newStyle)
}

// switchToOverlayWindow morphs the window back into the invisible, fullscreen, click-through overlay.
func switchToOverlayWindow() {
	hwnd := getHWND()
	if hwnd == 0 {
		return
	}

	// 1. Re-apply transparent/ghost styles (EXSTYLE)
	exStyle, _, _ := procGetWindowLongPtrW.Call(hwnd, gwlExStyle)
	newExStyle := exStyle | wsExLayered | wsExTransparent | wsExNoActivate | wsExToolWindow | wsExTopmost
	procSetWindowLongPtrW.Call(hwnd, gwlExStyle, newExStyle)

	// 2. Remove title bar/borders (STYLE)
	style, _, _ := procGetWindowLongPtrW.Call(hwnd, gwlStyle)
	newStyle := (style & ^(wsCaption | wsSysMenu | wsThickFrame | wsMinimizeBox | wsMaximizeBox)) | wsPopup
	procSetWindowLongPtrW.Call(hwnd, gwlStyle, newStyle)
}

// showWindowNoActivate makes the window visible WITHOUT stealing focus or
// deselecting the currently active text field in another application.
// It ALWAYS ensures the window is in overlay (ghost) mode first,
// so opening Settings and then pressing the hotkey never shows settings again.
func showWindowNoActivate() {
	// Guarantee we are in overlay mode before showing the pill
	// This handles the case where the window was previously morphed for Settings
	switchToOverlayWindow()

	hwnd := getHWND()
	if hwnd == 0 {
		return
	}
	procShowWindow.Call(hwnd, swShowNoActivate)

	// Explicitly bring window to the top of the Z-order with HWND_TOPMOST
	procSetWindowPos.Call(hwnd, hwndTopmost, 0, 0, 0, 0, swpFlags)

	// Apply overlay styles one more time after showing to be absolutely sure
	applyOverlayStylesHWND(hwnd)
}

// applyOverlayStyles finds the window and applies click-through + no-activate styles.
func applyOverlayStyles() {
	time.Sleep(300 * time.Millisecond)
	hwnd := getHWND()
	if hwnd == 0 {
		return
	}
	applyOverlayStylesHWND(hwnd)
}

// applyOverlayStylesHWND applies:
//   - WS_EX_TOPMOST      → keeps window always on top of all windows
//   - WS_EX_TRANSPARENT  → clicks pass through to windows underneath
//   - WS_EX_NOACTIVATE   → window won't steal keyboard focus
//   - WS_EX_LAYERED      → required for the above two to work correctly
//   - WS_EX_TOOLWINDOW   → avoids showing icon in taskbar
func applyOverlayStylesHWND(hwnd uintptr) {
	exStyle, _, _ := procGetWindowLongPtrW.Call(hwnd, gwlExStyle)
	newStyle := exStyle | wsExLayered | wsExTransparent | wsExNoActivate | wsExToolWindow | wsExTopmost
	procSetWindowLongPtrW.Call(hwnd, gwlExStyle, newStyle)
	procSetWindowPos.Call(hwnd, hwndTopmost, 0, 0, 0, 0, swpFlags)
}

// makeWindowClickable is now superseded by switchToSettingsWindow, but kept for direct calls
func makeWindowClickable() {
	switchToSettingsWindow()
}

