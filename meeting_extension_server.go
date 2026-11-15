package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all local browser extensions
	},
}

type ExtensionAudioMessage struct {
	Type        string  `json:"type"`
	Platform    string  `json:"platform"`
	SpeakerName string  `json:"speakerName"`
	SampleRate  int     `json:"sampleRate"`
	RMS         float64 `json:"rms"`
	PcmBase64   string  `json:"pcmBase64"`
	Timestamp   int64   `json:"timestamp"`
}

type ExtensionBridgeServer struct {
	mutex              sync.Mutex
	activeClient       *websocket.Conn
	activeSpeakerMap   map[string]string // e.g. mapping "Speaker 2" -> "Karthik"
	lastActiveSpeaker  string
	lastSpeakerTime    time.Time
	knownParticipants  []string
	remoteParticipants []string
	lastRosterTime     time.Time
}

var globalExtensionServer = &ExtensionBridgeServer{
	activeSpeakerMap: make(map[string]string),
}

var extensionServerOnce sync.Once

// StartExtensionWebSocketServer starts local WebSocket listener on 127.0.0.1:28282
func StartExtensionWebSocketServer() {
	extensionServerOnce.Do(func() {
		mux := http.NewServeMux()
		mux.HandleFunc("/extension", handleExtensionWS)
		mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{"status":"ok","app":"LocalFlow"}`))
		})

		server := &http.Server{
			Addr:    "127.0.0.1:28282",
			Handler: mux,
		}

		go func() {
			fmt.Println("[Extension Server] Listening on ws://127.0.0.1:28282/extension")
			if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
				fmt.Printf("[Extension Server] Error: %v\n", err)
			}
		}()
	})
}

func broadcastExtensionEvent(eventName string, data ...interface{}) {
	engine := GetMeetingEngine()
	if engine != nil && engine.ctx != nil {
		wailsRuntime.EventsEmit(engine.ctx, eventName, data...)
	}
	if globalApp != nil && globalApp.ctx != nil {
		wailsRuntime.EventsEmit(globalApp.ctx, eventName, data...)
	}
	settingsApp := GetGlobalSettingsApp()
	if settingsApp != nil && settingsApp.ctx != nil {
		wailsRuntime.EventsEmit(settingsApp.ctx, eventName, data...)
	}
}

func handleExtensionWS(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		fmt.Printf("[Extension Server] Upgrade error: %v\n", err)
		return
	}

	globalExtensionServer.mutex.Lock()
	globalExtensionServer.remoteParticipants = nil
	globalExtensionServer.lastRosterTime = time.Time{}
	previous := globalExtensionServer.activeClient
	globalExtensionServer.activeClient = conn
	globalExtensionServer.lastActiveSpeaker = ""
	globalExtensionServer.lastSpeakerTime = time.Time{}
	globalExtensionServer.mutex.Unlock()

	if previous != nil {
		_ = previous.Close()
	}
	conn.SetReadLimit(1024 * 1024)
	fmt.Println("[Extension Server] Browser Companion connected!")
	broadcastExtensionEvent("extension-connection-status", true)

	defer func() {
		globalExtensionServer.mutex.Lock()
		wasActive := globalExtensionServer.activeClient == conn
		if globalExtensionServer.activeClient == conn {
			globalExtensionServer.activeClient = nil
			globalExtensionServer.lastActiveSpeaker = ""
			globalExtensionServer.lastSpeakerTime = time.Time{}
			globalExtensionServer.knownParticipants = nil
			globalExtensionServer.remoteParticipants = nil
			globalExtensionServer.lastRosterTime = time.Time{}
		}
		globalExtensionServer.mutex.Unlock()
		conn.Close()
		fmt.Println("[Extension Server] Browser Companion disconnected")
		if wasActive {
			broadcastExtensionEvent("extension-connection-status", false)
			broadcastExtensionEvent("meeting-extension-participants", []string{})
		}
	}()

	for {
		_, msgBytes, err := conn.ReadMessage()
		if err != nil {
			break
		}

		// Handle raw PING keepalive (sent as plain string, not JSON)
		if string(msgBytes) == `{"type":"PING"}` || string(msgBytes) == "PING" {
			_ = conn.WriteMessage(websocket.TextMessage, []byte(`{"type":"PONG"}`))
			continue
		}

		var rawMap map[string]interface{}
		if err := json.Unmarshal(msgBytes, &rawMap); err != nil {
			continue
		}

		globalExtensionServer.mutex.Lock()
		current := globalExtensionServer.activeClient == conn
		globalExtensionServer.mutex.Unlock()
		if !current {
			continue
		}
		msgType, _ := rawMap["type"].(string)

		if msgType == "SPEAKER_ACTIVE" {
			speakerName, _ := rawMap["speakerName"].(string)
			platform, _ := rawMap["platform"].(string)
			speakerName = strings.TrimSpace(speakerName)
			{
				globalExtensionServer.mutex.Lock()
				globalExtensionServer.lastActiveSpeaker = speakerName
				globalExtensionServer.lastSpeakerTime = time.Now()
				globalExtensionServer.mutex.Unlock()

				// Inform MeetingEngine about the active speaker
				engine := GetMeetingEngine()
				if engine != nil {
					engine.NotifyExtensionSpeaker(speakerName)
				}

				// Broadcast current speaker name to all UI windows
				broadcastExtensionEvent("meeting-extension-speaker", map[string]interface{}{
					"speaker":  speakerName,
					"platform": platform,
				})
			}
		} else if msgType == "PARTICIPANTS_UPDATE" {
			if participantsList, ok := rawMap["participants"].([]interface{}); ok {
				names := []string{}
				for _, p := range participantsList {
					if str, ok := p.(string); ok && str != "" {
						if name := strings.TrimSpace(str); name != "" {
							names = append(names, name)
						}
					}
				}
				{
					globalExtensionServer.mutex.Lock()
					globalExtensionServer.knownParticipants = names
					globalExtensionServer.lastRosterTime = time.Now()
					globalExtensionServer.remoteParticipants = nil
					if remote, ok := rawMap["remoteParticipants"].([]interface{}); ok {
						for _, item := range remote {
							if name, ok := item.(string); ok && strings.TrimSpace(name) != "" {
								// Only accept names that actually occur in the roster.
								for _, participant := range names {
									if participant == strings.TrimSpace(name) {
										globalExtensionServer.remoteParticipants = append(globalExtensionServer.remoteParticipants, participant)
										break
									}
								}
							}
						}
					}
					globalExtensionServer.mutex.Unlock()

					broadcastExtensionEvent("meeting-extension-participants", names)
				}
			}
		}
	}
}

// GetCurrentExtensionSpeaker returns the active speaker detected by the extension
func GetCurrentExtensionSpeaker() string {
	globalExtensionServer.mutex.Lock()
	defer globalExtensionServer.mutex.Unlock()
	if globalExtensionServer.activeClient == nil || time.Since(globalExtensionServer.lastSpeakerTime) > 3*time.Second {
		return ""
	}
	return globalExtensionServer.lastActiveSpeaker
}

// ResetExtensionSpeaker resets the current speaker state for a new meeting
func ResetExtensionSpeaker() {
	globalExtensionServer.mutex.Lock()
	defer globalExtensionServer.mutex.Unlock()
	globalExtensionServer.lastActiveSpeaker = ""
	globalExtensionServer.lastSpeakerTime = time.Time{}

}

// GetExtensionLoopbackSpeaker can identify a two-person call even when Meet's
// animation is unavailable. It never guesses among several remote participants.
func GetExtensionLoopbackSpeaker() string {
	globalExtensionServer.mutex.Lock()
	defer globalExtensionServer.mutex.Unlock()
	if globalExtensionServer.activeClient == nil {
		return ""
	}
	if globalExtensionServer.lastActiveSpeaker != "" && time.Since(globalExtensionServer.lastSpeakerTime) <= 3*time.Second {
		return globalExtensionServer.lastActiveSpeaker
	}
	if len(globalExtensionServer.remoteParticipants) == 1 && time.Since(globalExtensionServer.lastRosterTime) <= 5*time.Second {
		return globalExtensionServer.remoteParticipants[0]
	}
	return ""
}
