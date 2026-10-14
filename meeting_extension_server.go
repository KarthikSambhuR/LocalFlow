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
	mutex             sync.Mutex
	activeClient      *websocket.Conn
	activeSpeakerMap  map[string]string // e.g. mapping "Speaker 2" -> "Karthik"
	lastActiveSpeaker string
	lastSpeakerTime   time.Time
	knownParticipants []string
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
	globalExtensionServer.activeClient = conn
	globalExtensionServer.mutex.Unlock()

	fmt.Println("[Extension Server] Browser Companion connected!")
	broadcastExtensionEvent("extension-connection-status", true)

	defer func() {
		globalExtensionServer.mutex.Lock()
		if globalExtensionServer.activeClient == conn {
			globalExtensionServer.activeClient = nil
		}
		globalExtensionServer.mutex.Unlock()
		conn.Close()
		fmt.Println("[Extension Server] Browser Companion disconnected")
		broadcastExtensionEvent("extension-connection-status", false)
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

		msgType, _ := rawMap["type"].(string)

		if msgType == "SPEAKER_ACTIVE" {
			speakerName, _ := rawMap["speakerName"].(string)
			platform, _ := rawMap["platform"].(string)
			lower := strings.ToLower(speakerName)
			if speakerName != "" && !strings.Contains(lower, "frame") && !strings.Contains(lower, "reframe") && !strings.Contains(lower, "_") {
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
				var names []string
				for _, p := range participantsList {
					if str, ok := p.(string); ok && str != "" {
						l := strings.ToLower(str)
						if !strings.Contains(l, "frame") && !strings.Contains(l, "reframe") && !strings.Contains(l, "_") {
							names = append(names, str)
						}
					}
				}
				if len(names) > 0 {
					globalExtensionServer.mutex.Lock()
					globalExtensionServer.knownParticipants = names
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
	return globalExtensionServer.lastActiveSpeaker
}

// ResetExtensionSpeaker resets the current speaker state for a new meeting
func ResetExtensionSpeaker() {
	globalExtensionServer.mutex.Lock()
	defer globalExtensionServer.mutex.Unlock()
	globalExtensionServer.lastActiveSpeaker = ""
	globalExtensionServer.lastSpeakerTime = time.Time{}
	globalExtensionServer.knownParticipants = nil
}
