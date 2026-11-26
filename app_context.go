package main

import (
	"bytes"
	"compress/gzip"
	_ "embed"
	"encoding/json"
	"fmt"
	"path/filepath"
	"strings"
	"syscall"
	"unsafe"
)

//go:embed domain_dicts.json.gz
var domainDictsGZ []byte

type domainDictPayload struct {
	Apps  map[string][]string `json:"apps"`
	Tabs  map[string][]string `json:"tabs"`
	Words map[string][]string `json:"words"`
}

var (
	domainDicts    domainDictPayload
	domainAppIndex = map[string]string{}
)

func init() {
	gz, err := gzip.NewReader(bytes.NewReader(domainDictsGZ))
	if err != nil {
		return
	}
	defer gz.Close()
	if err := json.NewDecoder(gz).Decode(&domainDicts); err != nil {
		return
	}
	for cat, exes := range domainDicts.Apps {
		for _, exe := range exes {
			domainAppIndex[strings.ToLower(strings.TrimSpace(exe))] = cat
		}
	}
}

// DomainDictionaryWords returns the embedded domain-specific vocabulary for a category.
func DomainDictionaryWords(category string) []string {
	return domainDicts.Words[category]
}

// MergeDictionaryWords combines user dictionary words (highest priority) with
// domain-specific words, deduplicating case-insensitively.
func MergeDictionaryWords(userWords, domainWords []string) []string {
	if len(domainWords) == 0 {
		return userWords
	}
	seen := make(map[string]struct{}, len(userWords)+len(domainWords))
	out := make([]string, 0, len(userWords)+len(domainWords))
	for _, w := range userWords {
		k := strings.ToLower(strings.TrimSpace(w))
		if k == "" {
			continue
		}
		if _, ok := seen[k]; !ok {
			seen[k] = struct{}{}
			out = append(out, w)
		}
	}
	for _, w := range domainWords {
		k := strings.ToLower(strings.TrimSpace(w))
		if k == "" {
			continue
		}
		if _, ok := seen[k]; !ok {
			seen[k] = struct{}{}
			out = append(out, w)
		}
	}
	return out
}

// AppContextInfo describes the foreground application (and browser tab, if applicable)
// detected when dictation begins.
type AppContextInfo struct {
	ProcessName string
	WindowTitle string
	Category    string // "dev", "design", "business", "education", "medical", "writing", "chat", "general"
	AppLabel    string
	PromptHint  string
}

var (
	ctxUser32   = syscall.NewLazyDLL("user32.dll")
	ctxKernel32 = syscall.NewLazyDLL("kernel32.dll")

	procCtxGetForegroundWindow      = ctxUser32.NewProc("GetForegroundWindow")
	procCtxGetWindowTextW           = ctxUser32.NewProc("GetWindowTextW")
	procCtxGetWindowThreadProcessId = ctxUser32.NewProc("GetWindowThreadProcessId")
	procCtxOpenProcess              = ctxKernel32.NewProc("OpenProcess")
	procCtxQueryFullProcessImageW   = ctxKernel32.NewProc("QueryFullProcessImageNameW")
	procCtxCloseHandle              = ctxKernel32.NewProc("CloseHandle")
)

const processQueryLimitedInformation = 0x1000

// DetectActiveAppContext reads the current foreground window's executable name
// and title (which on Windows includes the active tab title for Chrome/Edge/etc.).
func DetectActiveAppContext() AppContextInfo {
	hwnd, _, _ := procCtxGetForegroundWindow.Call()
	if hwnd == 0 {
		return AppContextInfo{}
	}

	titleBuf := make([]uint16, 512)
	tLen, _, _ := procCtxGetWindowTextW.Call(hwnd, uintptr(unsafe.Pointer(&titleBuf[0])), uintptr(len(titleBuf)))
	windowTitle := ""
	if tLen > 0 {
		windowTitle = syscall.UTF16ToString(titleBuf[:tLen])
	}

	var pid uint32
	procCtxGetWindowThreadProcessId.Call(hwnd, uintptr(unsafe.Pointer(&pid)))
	processName := ""
	if pid != 0 {
		hProc, _, _ := procCtxOpenProcess.Call(processQueryLimitedInformation, 0, uintptr(pid))
		if hProc != 0 {
			defer procCtxCloseHandle.Call(hProc)
			exeBuf := make([]uint16, 512)
			size := uint32(len(exeBuf))
			ok, _, _ := procCtxQueryFullProcessImageW.Call(hProc, 0, uintptr(unsafe.Pointer(&exeBuf[0])), uintptr(unsafe.Pointer(&size)))
			if ok != 0 && size > 0 {
				fullPath := syscall.UTF16ToString(exeBuf[:size])
				processName = strings.ToLower(filepath.Base(fullPath))
			}
		}
	}

	return ClassifyAppContext(processName, windowTitle)
}

func isBrowserProcess(proc string) bool {
	switch proc {
	case "chrome.exe", "msedge.exe", "brave.exe", "firefox.exe", "opera.exe", "vivaldi.exe", "arc.exe":
		return true
	}
	return false
}

func extractBrowserTabTitle(title string) string {
	for _, suffix := range []string{
		" - Google Chrome",
		" - Microsoft Edge",
		" - Brave",
		" - Mozilla Firefox",
		" - Opera",
		" - Vivaldi",
		" - Arc",
	} {
		if idx := strings.LastIndex(title, suffix); idx > 0 {
			return strings.TrimSpace(title[:idx])
		}
	}
	return strings.TrimSpace(title)
}

func containsAny(s string, needles ...string) bool {
	for _, n := range needles {
		if strings.Contains(s, n) {
			return true
		}
	}
	return false
}

func promptHintForCategory(category, appLabel string, isTab bool) string {
	kind := "app"
	if isTab {
		kind = "web tab"
	}
	switch category {
	case "dev":
		return fmt.Sprintf("\nApplication context: The user is dictating into a developer/IDE/terminal %s (%s). Preserve technical jargon, code identifiers, CLI flags, APIs, file paths, camelCase/snake_case, and acronyms verbatim; do not autocorrect technical terms into everyday words.", kind, appLabel)
	case "design":
		return fmt.Sprintf("\nApplication context: The user is dictating into a design %s (%s). Preserve UI/UX and design terminology (frames, layers, components, auto-layout, hex codes, kerning, typography, vectors, padding) accurately.", kind, appLabel)
	case "business":
		return fmt.Sprintf("\nApplication context: The user is dictating into a business/finance %s (%s). Preserve business acronyms (KPI, OKR, ARR, EBITDA, ROI, SaaS, CRM) and keep phrasing clear and executive-ready.", kind, appLabel)
	case "education":
		return fmt.Sprintf("\nApplication context: The user is dictating into an education/academic %s (%s). Preserve academic, teaching, and STEM terminology accurately.", kind, appLabel)
	case "medical":
		return fmt.Sprintf("\nApplication context: The user is dictating into a medical/clinical %s (%s). Preserve clinical, anatomical, diagnostic, and medication terminology accurately.", kind, appLabel)
	case "video":
		return fmt.Sprintf("\nApplication context: The user is dictating into a video editing or streaming %s (%s). Preserve video production terminology (codecs, frame rates, color grading, LUTs, keyframes, timelines, OBS) accurately.", kind, appLabel)
	case "gaming":
		return fmt.Sprintf("\nApplication context: The user is dictating into a gaming or esports %s (%s). Preserve gaming slang, callouts, stats, and game titles accurately.", kind, appLabel)
	case "legal":
		return fmt.Sprintf("\nApplication context: The user is dictating into a legal %s (%s). Preserve legal terminology, citations, and formal phrasing accurately.", kind, appLabel)
	case "music":
		return fmt.Sprintf("\nApplication context: The user is dictating into a music/audio production %s (%s). Preserve DAW, mixing, mastering, MIDI, EQ, and audio engineering terms accurately.", kind, appLabel)
	case "writing":
		return fmt.Sprintf("\nApplication context: The user is dictating into an email or document %s (%s). Format into clean, well-punctuated sentences and paragraphs.", kind, appLabel)
	case "chat":
		return fmt.Sprintf("\nApplication context: The user is dictating into a messaging %s (%s). Keep phrasing natural, concise, and conversational.", kind, appLabel)
	default:
		return ""
	}
}

// ClassifyAppContext maps a Windows process name and window title into a
// refinement context category and LLM system prompt hint.
func ClassifyAppContext(processName, windowTitle string) AppContextInfo {
	proc := strings.ToLower(strings.TrimSpace(processName))
	title := strings.TrimSpace(windowTitle)
	titleLower := strings.ToLower(title)

	info := AppContextInfo{
		ProcessName: proc,
		WindowTitle: title,
		Category:    "general",
	}

	// 1. Browsers: classify by active tab title
	if isBrowserProcess(proc) {
		tab := extractBrowserTabTitle(title)
		tabLower := strings.ToLower(tab)
		info.AppLabel = tab
		if info.AppLabel == "" {
			info.AppLabel = "Browser"
		}

		for _, cat := range []string{"dev", "design", "video", "gaming", "legal", "music", "medical", "education", "business", "writing"} {
			if containsAny(tabLower, domainDicts.Tabs[cat]...) {
				info.Category = cat
				info.PromptHint = promptHintForCategory(cat, info.AppLabel, true)
				return info
			}
		}

		switch {
		case containsAny(tabLower, "gmail", "outlook", "proton mail", "yahoo mail", "google docs"):
			info.Category = "writing"
			info.PromptHint = promptHintForCategory("writing", info.AppLabel, true)
		case containsAny(tabLower, "slack", "discord", "whatsapp", "teams", "telegram", "messenger"):
			info.Category = "chat"
			info.PromptHint = promptHintForCategory("chat", info.AppLabel, true)
		}
		return info
	}

	// 2. Native apps from embedded domain index
	if cat, ok := domainAppIndex[proc]; ok {
		info.Category = cat
		info.AppLabel = strings.TrimSuffix(proc, ".exe")
		info.PromptHint = promptHintForCategory(cat, info.AppLabel, false)
		return info
	}

	// Check window title against tab/app keywords even if hosted in an Electron/PWA/shell window
	for _, cat := range []string{"dev", "design", "video", "gaming", "legal", "music", "medical", "education", "business", "writing"} {
		if containsAny(titleLower, domainDicts.Tabs[cat]...) {
			info.Category = cat
			info.AppLabel = title
			info.PromptHint = promptHintForCategory(cat, info.AppLabel, false)
			return info
		}
	}

	// Check window title for common shell titles
	if containsAny(titleLower, "claude code", "antigravity", "codex", "powershell", "command prompt", "wsl", "ubuntu") {
		info.Category = "dev"
		info.AppLabel = title
		info.PromptHint = promptHintForCategory("dev", info.AppLabel, false)
		return info
	}

	// 3. Native Email / Document & Chat apps
	switch proc {
	case "thunderbird.exe", "obsidian.exe":
		info.Category = "writing"
		info.AppLabel = strings.TrimSuffix(proc, ".exe")
		info.PromptHint = promptHintForCategory("writing", info.AppLabel, false)
	case "discord.exe", "whatsapp.exe", "telegram.exe":
		info.Category = "chat"
		info.AppLabel = strings.TrimSuffix(proc, ".exe")
		info.PromptHint = promptHintForCategory("chat", info.AppLabel, false)
	}

	return info
}
