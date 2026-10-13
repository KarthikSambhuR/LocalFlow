package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// generateMeetingSummary generates structured meeting minutes with timestamps,
// key discussion points, decisions made, and action items using the local Gemma model.
func generateMeetingSummary(transcript string) (string, error) {
	transcript = strings.TrimSpace(transcript)
	if transcript == "" {
		return "No speech recorded during this meeting.", nil
	}

	cfg := loadConfig()

	// For meeting summaries, prefer MeetingLLMModel over the generic LLMActiveModel.
	// Create a dedicated config copy with the meeting-specific model so getOrStartLLMServer
	// uses the right model (and doesn't kill a running dictation refinement server).
	meetingCfg := cfg
	if meetingCfg.MeetingLLMModel != "" {
		meetingCfg.LLMActiveModel = meetingCfg.MeetingLLMModel
	}

	fmt.Printf("[MeetingSummary] requesting LLM server for model: %s\n", meetingCfg.LLMActiveModel)

	// Ensure LLM server is accessible
	port := getOrStartLLMServer(meetingCfg)
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

> Local model was not running during this session. Below is the recorded dialogue.

### Recorded Dialogue
%s

---
*Load a local Gemma model in Settings and click **Regenerate** to create an executive summary and action items.*
`, dialogueRows.String())
		return fallbackSummary, nil
	}

	serverUrl := fmt.Sprintf("http://127.0.0.1:%d/v1/chat/completions", port)

	systemPrompt := `You are an expert meeting summarizer.
Your goal is to produce concise, clean, and minimal meeting notes from the provided dialogue transcript.
Avoid excessive formatting, clutter, or redundant tables. Keep it elegant, direct, and easy to read.

Format your response in minimal Markdown:
# Meeting Summary

### Key Discussion
(Concise bullet points summarizing the core conversation topics and points made, citing speaker names and timestamps like [01:23])

### Decisions Made
(Brief, clear list of agreed decisions)

### Action Items
- [ ] **[Name/Speaker]**: Task description with any deadlines mentioned

Keep it minimal and factual. Do not invent details not present in the transcript.`

	userMsg := fmt.Sprintf("<meeting_transcript>\n%s\n</meeting_transcript>", transcript)

	reqBody := LLMRequest{
		Model: "local-model",
		Messages: []LLMMessage{
			{Role: "system", Content: systemPrompt},
			{Role: "user", Content: userMsg},
		},
		Temperature: 0.2,
		MaxTokens:   4096,
		Stream:      true, // Enable SSE streaming
	}

	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		return "", err
	}

	client := &http.Client{
		Timeout: 90 * time.Second, // Long timeout for long meetings
	}

	resp, err := client.Post(serverUrl, "application/json", bytes.NewBuffer(jsonData))
	if err != nil {
		return "", fmt.Errorf("failed to contact LLM server: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("LLM server returned HTTP %d", resp.StatusCode)
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
						
						// Emit token count to UI (debounce slightly or emit every N tokens if needed, but Wails handles this fine)
						ctx := GetMeetingEngine().ctx
						if ctx != nil && tokenCount%5 == 0 {
							wailsRuntime.EventsEmit(ctx, "meeting-summary-token", map[string]interface{}{
								"meeting_id": GetMeetingEngine().meetingID, // The global active meeting
								"token_count": tokenCount,
							})
						}
					}
				}
			}
		}
	}

	output := strings.TrimSpace(fullContent.String())
	return cleanSoundTags(output), nil
}
