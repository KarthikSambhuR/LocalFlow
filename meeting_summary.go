package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// generateMeetingSummary generates structured meeting minutes and a short TL;DR summary.
// Returns (fullMarkdown, shortSummary, error).
func generateMeetingSummary(transcript string) (string, string, error) {
	transcript = strings.TrimSpace(transcript)
	if transcript == "" {
		return "No speech recorded during this meeting.", "No speech recorded.", nil
	}

	// Mark LLM as busy so pill overlay process does not shut down llama-server while synthesizing
	touchMeetingLLMBusy()
	defer clearMeetingLLMBusy()

	cfg := loadConfig()

	// Use currently active model (falling back to any available .gguf model if unset)
	activeModel := cfg.LLMActiveModel
	if activeModel == "" {
		activeModel = "s1-mini-q4_k_m.gguf"
	}

	// Verify active model file exists in models directory; if not, pick first available .gguf
	modelsDir := getModelsDirectory()
	if _, err := os.Stat(filepath.Join(modelsDir, activeModel)); err != nil {
		entries, _ := os.ReadDir(modelsDir)
		for _, e := range entries {
			name := e.Name()
			if !e.IsDir() && strings.HasSuffix(strings.ToLower(name), ".gguf") && !strings.Contains(strings.ToLower(name), "mmproj") {
				activeModel = name
				break
			}
		}
	}
	cfg.LLMActiveModel = activeModel

	fmt.Printf("[MeetingSummary] Requesting LLM server for active model: %s\n", cfg.LLMActiveModel)

	// Ensure LLM server is accessible (starts server if not running, even if LLM refinement is disabled)
	port := getOrStartLLMServer(cfg)
	fmt.Printf("[MeetingSummary] getOrStartLLMServer returned port=%d\n", port)
	if port <= 0 {
		// Provide a clean structured Markdown summary of the dialogue when LLM server is not active
		lines := strings.Split(transcript, "\n")
		var dialogueRows strings.Builder
		for _, line := range lines {
			line = strings.TrimSpace(line)
			if line == "" {
				continue
			}
			parts := strings.SplitN(line, ": ", 2)
			if len(parts) == 2 {
				dialogueRows.WriteString(fmt.Sprintf("- **%s**: %s\n", parts[0], parts[1]))
			} else {
				dialogueRows.WriteString(fmt.Sprintf("- %s\n", line))
			}
		}

		fallbackSummary := fmt.Sprintf(`# Meeting Transcript

> Local LLM was not accessible. Below is the recorded dialogue.

### Recorded Dialogue
%s

---
*Ensure a local LLM model is downloaded in Settings > Models and click **Regenerate** to synthesize minutes.*
`, dialogueRows.String())
		return fallbackSummary, "Local LLM was not accessible. Transcript saved.", nil
	}

	serverUrl := fmt.Sprintf("http://127.0.0.1:%d/v1/chat/completions", port)

	systemPrompt := `You are an expert executive scribe. Your task is to analyze the provided meeting dialogue transcript and synthesize comprehensive, clear, professional meeting minutes in clean Markdown.

Structure your response with:
# Meeting Summary

### Overview

### Key Discussion Points

### Decisions Made

### Action Items`

	userMsg := fmt.Sprintf("Meeting Transcript:\n%s\n\nWrite the comprehensive meeting minutes in Markdown now:", transcript)

	reqBody := LLMRequest{
		Model: "local-model",
		Messages: []LLMMessage{
			{Role: "system", Content: systemPrompt},
			{Role: "user", Content: userMsg},
		},
		Temperature: 0.25,
		MaxTokens:   0, // Omitted via omitempty to let llama.cpp dynamically utilize full available context without 500 error
		Stream:      true,
	}

	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		return "", "", err
	}

	client := &http.Client{
		Timeout: 180 * time.Second, // Long timeout for meeting inference
	}

	resp, err := client.Post(serverUrl, "application/json", bytes.NewBuffer(jsonData))
	if err != nil {
		return "", "", fmt.Errorf("failed to contact LLM server: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", "", fmt.Errorf("LLM server returned HTTP %d", resp.StatusCode)
	}

	reader := bufio.NewReader(resp.Body)
	var fullContent strings.Builder
	tokenCount := 0

	for {
		line, err := reader.ReadString('\n')
		if err != nil {
			break
		}
		line = strings.TrimSpace(line)
		if line == "" || line == "data: [DONE]" {
			continue
		}

		if strings.HasPrefix(line, "data: ") {
			dataStr := strings.TrimPrefix(line, "data: ")
			var chunk LLMStreamChunk
			if err := json.Unmarshal([]byte(dataStr), &chunk); err == nil {
				if len(chunk.Choices) > 0 {
					content := chunk.Choices[0].Delta.Content
					if content != "" {
						fullContent.WriteString(content)
						tokenCount++

						// Refresh busy file periodically so long inference doesn't expire
						if tokenCount%25 == 0 {
							touchMeetingLLMBusy()
						}

						// Emit partial content to UI for live streaming render
						ctx := GetMeetingEngine().ctx
						if ctx != nil && tokenCount%5 == 0 {
							wailsRuntime.EventsEmit(ctx, "meeting-summary-token", map[string]interface{}{
								"meeting_id":      GetMeetingEngine().meetingID,
								"token_count":     tokenCount,
								"partial_content": fullContent.String(),
							})
						}
					}
				}
			}
		}
	}

	// Non-streaming fallback if stream returned no tokens
	if fullContent.Len() == 0 {
		reqBody.Stream = false
		if nonStreamJson, err := json.Marshal(reqBody); err == nil {
			if nsResp, err := client.Post(serverUrl, "application/json", bytes.NewBuffer(nonStreamJson)); err == nil {
				defer nsResp.Body.Close()
				if nsResp.StatusCode == http.StatusOK {
					var compResp LLMResponse
					if err := json.NewDecoder(nsResp.Body).Decode(&compResp); err == nil && len(compResp.Choices) > 0 {
						fullContent.WriteString(compResp.Choices[0].Message.Content)
					}
				}
			}
		}
	}

	output := strings.TrimSpace(fullContent.String())
	if output == "" {
		return "Meeting summary generation resulted in empty output. Please verify model status and click Regenerate.", "", nil
	}

	cleaned := cleanMeetingSummary(output)
	short := extractShortSummary(cleaned)
	return cleaned, short, nil
}

func cleanMeetingSummary(text string) string {
	text = strings.TrimSpace(text)
	if text == "" {
		return ""
	}

	// 1. Strip <think>...</think> reasoning tags
	for {
		lower := strings.ToLower(text)
		start := strings.Index(lower, "<think>")
		if start < 0 {
			break
		}
		end := strings.Index(lower[start+len("<think>"):], "</think>")
		if end < 0 {
			text = strings.TrimSpace(text[:start])
			break
		}
		end += start + len("<think>")
		text = strings.TrimSpace(text[:start] + text[end+len("</think>"):])
	}

	// 2. Unwrap markdown code block fence if wrapped
	trimmed := strings.TrimSpace(text)
	if strings.HasPrefix(trimmed, "```") && strings.HasSuffix(trimmed, "```") {
		lines := strings.Split(trimmed, "\n")
		if len(lines) >= 2 {
			firstLine := strings.ToLower(strings.TrimSpace(lines[0]))
			if strings.HasPrefix(firstLine, "```") {
				lines = lines[1:]
			}
			if len(lines) > 0 && strings.TrimSpace(lines[len(lines)-1]) == "```" {
				lines = lines[:len(lines)-1]
			}
			text = strings.TrimSpace(strings.Join(lines, "\n"))
		}
	}

	// 3. Remove sound tags
	text = cleanSoundTags(text)

	// 4. Strip trailing outro chatter (only if at the very end of the text)
	outroPatterns := []string{
		"thanks for watching",
		"okay, bye guys",
		"okay bye guys",
		"bye guys",
		"bye everyone",
	}
	for _, p := range outroPatterns {
		lower := strings.ToLower(text)
		if idx := strings.LastIndex(lower, p); idx >= 0 && idx >= len(text)-150 {
			text = strings.TrimSpace(text[:idx])
		}
	}

	// 5. Structure into clean, valid Markdown notes
	return formatMeetingMinutesMarkdown(text)
}

// formatMeetingMinutesMarkdown lightly normalises the LLM-generated markdown:
// - Ensures headings are on their own lines with blank lines before them
// - Collapses excessive blank lines (>2 consecutive)
// - Returns the text as-is otherwise, preserving all LLM-emitted newlines.
func formatMeetingMinutesMarkdown(text string) string {
	text = strings.TrimSpace(text)
	if text == "" {
		return ""
	}

	// Unwrap if the entire output is inside a markdown code fence
	if strings.HasPrefix(text, "```") {
		lines := strings.Split(text, "\n")
		if len(lines) >= 2 && strings.HasPrefix(strings.TrimSpace(lines[len(lines)-1]), "```") {
			inner := lines[1 : len(lines)-1]
			text = strings.TrimSpace(strings.Join(inner, "\n"))
		}
	}

	// Ensure every markdown heading (#, ##, ###) starts on its own line
	// by inserting a newline before # if it's preceded by non-newline text
	var sb strings.Builder
	lines := strings.Split(text, "\n")
	prevWasBlank := false
	for i, rawLine := range lines {
		trimmed := strings.TrimSpace(rawLine)

		isBlank := trimmed == ""
		isHeading := strings.HasPrefix(trimmed, "#")
		isBullet := strings.HasPrefix(trimmed, "- ") || strings.HasPrefix(trimmed, "* ") || strings.HasPrefix(trimmed, "- [")

		// Suppress more than one consecutive blank line
		if isBlank {
			if !prevWasBlank {
				sb.WriteString("\n")
			}
			prevWasBlank = true
			continue
		}

		// Insert blank line before headings (unless already at start)
		if isHeading && i > 0 && !prevWasBlank {
			sb.WriteString("\n")
		}

		sb.WriteString(trimmed)
		sb.WriteString("\n")

		// Insert blank line after headings
		if isHeading {
			sb.WriteString("\n")
			prevWasBlank = true
			continue
		}

		// Insert blank line after last bullet in a block (lookahead)
		if isBullet && i+1 < len(lines) {
			next := strings.TrimSpace(lines[i+1])
			if next != "" && !strings.HasPrefix(next, "- ") && !strings.HasPrefix(next, "* ") && !strings.HasPrefix(next, "- [") {
				sb.WriteString("\n")
				prevWasBlank = true
				continue
			}
		}

		prevWasBlank = false
	}

	return strings.TrimSpace(sb.String())
}

// extractShortSummary extracts a plain-text TL;DR from the Overview section of the
// full meeting markdown. Falls back to the first meaningful paragraph if no overview found.
// Output is capped at 280 characters.
func extractShortSummary(fullMarkdown string) string {
	lines := strings.Split(fullMarkdown, "\n")
	inOverview := false
	var collected []string

	for _, raw := range lines {
		l := strings.TrimSpace(raw)
		if l == "" {
			if inOverview && len(collected) > 0 {
				break // end of overview block
			}
			continue
		}

		lower := strings.ToLower(l)

		// Detect ### Overview heading
		if strings.HasPrefix(lower, "#") && strings.Contains(lower, "overview") {
			inOverview = true
			continue
		}
		// Stop at next heading
		if inOverview && strings.HasPrefix(l, "#") {
			break
		}

		if inOverview {
			// Strip markdown bullet/bold syntax for plain text
			l = strings.TrimPrefix(l, "- ")
			l = strings.TrimPrefix(l, "* ")
			l = strings.ReplaceAll(l, "**", "")
			l = strings.ReplaceAll(l, "__", "")
			collected = append(collected, l)
		}
	}

	// Fallback: grab first non-heading paragraph if no overview found
	if len(collected) == 0 {
		for _, raw := range lines {
			l := strings.TrimSpace(raw)
			if l == "" || strings.HasPrefix(l, "#") || strings.HasPrefix(l, "-") {
				continue
			}
			l = strings.ReplaceAll(l, "**", "")
			collected = append(collected, l)
			break
		}
	}

	text := strings.Join(collected, " ")
	text = strings.TrimSpace(text)
	if len(text) > 280 {
		// Trim at word boundary
		text = text[:280]
		if idx := strings.LastIndex(text, " "); idx > 200 {
			text = text[:idx]
		}
		text += "..."
	}
	return text
}
