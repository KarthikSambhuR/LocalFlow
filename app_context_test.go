package main

import (
	"strings"
	"testing"
)

func TestAppContextClassification(t *testing.T) {
	cases := []struct {
		proc    string
		title   string
		wantCat string
		wantSub string
	}{
		{"antigravity.exe", "LocalFlow - Antigravity", "dev", "developer/IDE/terminal"},
		{"codex.exe", "ChatGPT Codex", "dev", "developer/IDE/terminal"},
		{"chrome.exe", "ChatGPT Codex - Google Chrome", "dev", "developer/IDE/terminal"},
		{"windowsterminal.exe", "Claude Code", "dev", "developer/IDE/terminal"},
		{"pwsh.exe", "PowerShell 7", "dev", "developer/IDE/terminal"},
		{"figma.exe", "LocalFlow UI – Figma", "design", "design app"},
		{"photoshop.exe", "banner.psd @ 100%", "design", "design app"},
		{"excel.exe", "Q3 Forecast.xlsx", "business", "business/finance"},
		{"anki.exe", "Medical Deck", "education", "education/academic"},
		{"epic.exe", "Patient Chart", "medical", "medical/clinical"},
		{"resolve.exe", "DaVinci Resolve Studio", "video", "video editing"},
		{"valorant.exe", "VALORANT", "gaming", "gaming or esports"},
		{"fl64.exe", "FL Studio 24", "music", "music/audio production"},
		{"scrivener.exe", "Novel Draft - Scrivener", "writing", "email or document"},
		{"chrome.exe", "Westlaw Edge - Google Chrome", "legal", "legal"},
		{"chrome.exe", "Inbox (3) - Gmail - Google Chrome", "writing", "email or document"},
		{"chrome.exe", "KarthikSambhuR/LocalFlow - GitHub - Google Chrome", "dev", "developer/IDE/terminal"},
		{"chrome.exe", "Design System - Figma - Google Chrome", "design", "design web tab"},
		{"chrome.exe", "Google Classroom - Google Chrome", "education", "education/academic"},
		{"chrome.exe", "Q4 Pipeline - Salesforce - Google Chrome", "business", "business/finance"},
		{"chrome.exe", "Amoxicillin - PubMed - Google Chrome", "medical", "medical/clinical"},
		{"chrome.exe", "general | Team - Slack - Google Chrome", "chat", "messaging"},
		{"notepad.exe", "Untitled - Notepad", "general", ""},
	}

	for _, tc := range cases {
		got := ClassifyAppContext(tc.proc, tc.title)
		if got.Category != tc.wantCat {
			t.Errorf("ClassifyAppContext(%q, %q).Category = %q, want %q", tc.proc, tc.title, got.Category, tc.wantCat)
		}
		if tc.wantSub != "" && !strings.Contains(got.PromptHint, tc.wantSub) {
			t.Errorf("ClassifyAppContext(%q, %q).PromptHint = %q, want substring %q", tc.proc, tc.title, got.PromptHint, tc.wantSub)
		}
	}

	if len(DomainDictionaryWords("dev")) < 500 {
		t.Errorf("expected rich dev dictionary, got %d words", len(DomainDictionaryWords("dev")))
	}
	merged := MergeDictionaryWords([]string{"Sambhu"}, []string{"sambhu", "Kubernetes"})
	if len(merged) != 2 || merged[0] != "Sambhu" || merged[1] != "Kubernetes" {
		t.Errorf("unexpected MergeDictionaryWords: %v", merged)
	}
}
