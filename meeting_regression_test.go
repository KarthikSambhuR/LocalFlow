package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

func TestExtensionBridgeRosterAndSilence(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(handleExtensionWS))
	defer server.Close()
	conn, _, err := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(server.URL, "http"), nil)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	send := func(payload any) {
		t.Helper()
		if err := conn.WriteJSON(payload); err != nil {
			t.Fatal(err)
		}
		// PONG is a barrier: all earlier frames have been processed.
		if err := conn.WriteMessage(websocket.TextMessage, []byte("PING")); err != nil {
			t.Fatal(err)
		}
		_ = conn.SetReadDeadline(time.Now().Add(2 * time.Second))
		if _, _, err := conn.ReadMessage(); err != nil {
			t.Fatal(err)
		}
	}
	send(map[string]any{"type": "PARTICIPANTS_UPDATE", "participants": []string{"Alice_Frame", "Will Frame"}})
	names := (&SettingsApp{}).GetExtensionParticipants()
	if len(names) != 2 || names[0] != "Alice_Frame" || names[1] != "Will Frame" {
		t.Fatalf("valid names lost: %v", names)
	}
	send(map[string]any{"type": "SPEAKER_ACTIVE", "speakerName": "Alice_Frame"})
	if got := GetCurrentExtensionSpeaker(); got != "Alice_Frame" {
		t.Fatalf("speaker = %q", got)
	}
	send(map[string]any{"type": "SPEAKER_ACTIVE", "speakerName": ""})
	if got := GetCurrentExtensionSpeaker(); got != "" {
		t.Fatalf("silence retained speaker %q", got)
	}
	send(map[string]any{"type": "PARTICIPANTS_UPDATE", "participants": []string{"Me", "Alice_Frame"}, "remoteParticipants": []string{"Alice_Frame"}})
	engine := &MeetingEngine{}
	if got := engine.attributeLoopbackSpeaker(nil); got != "Alice_Frame" {
		t.Fatalf("sole remote labelled %q", got)
	}
	send(map[string]any{"type": "PARTICIPANTS_UPDATE", "participants": []string{"Me", "Alice_Frame", "Will Frame"}, "remoteParticipants": []string{"Alice_Frame", "Will Frame"}})
	if got := engine.attributeLoopbackSpeaker(nil); got != "Remote Speaker" {
		t.Fatalf("ambiguous remote guessed as %q", got)
	}
	send(map[string]any{"type": "PARTICIPANTS_UPDATE", "participants": []string{"Me", "Alice_Frame"}})
	if got := GetExtensionLoopbackSpeaker(); got != "" {
		t.Fatalf("legacy roster guessed remote as %q", got)
	}
	send(map[string]any{"type": "PARTICIPANTS_UPDATE", "participants": []string{}})
	if names := (&SettingsApp{}).GetExtensionParticipants(); len(names) != 0 {
		t.Fatalf("stale roster: %v", names)
	}
}

func TestExtensionSpeakerExpires(t *testing.T) {
	globalExtensionServer.mutex.Lock()
	globalExtensionServer.activeClient = &websocket.Conn{}
	globalExtensionServer.lastActiveSpeaker = "Old speaker"
	globalExtensionServer.lastSpeakerTime = time.Now().Add(-4 * time.Second)
	globalExtensionServer.mutex.Unlock()
	defer func() {
		globalExtensionServer.mutex.Lock()
		globalExtensionServer.activeClient = nil
		globalExtensionServer.lastActiveSpeaker = ""
		globalExtensionServer.mutex.Unlock()
	}()
	if got := GetCurrentExtensionSpeaker(); got != "" {
		t.Fatalf("expired speaker returned: %q", got)
	}
}

func TestMeetingWorkerDrainsBeforeCompletion(t *testing.T) {
	engine := &MeetingEngine{segmentQueue: make(chan SpeechSegment, 8), workerStop: make(chan struct{}), workerDone: make(chan struct{})}
	// Empty audio avoids model loading while exercising the shutdown protocol.
	for i := 0; i < 8; i++ {
		engine.segmentQueue <- SpeechSegment{}
	}
	close(engine.workerStop)
	go engine.transcriptionWorker()
	select {
	case <-engine.workerDone:
	case <-time.After(2 * time.Second):
		t.Fatal("worker did not finish")
	}
	if len(engine.segmentQueue) != 0 {
		t.Fatal("worker completed with unprocessed segments")
	}
}
