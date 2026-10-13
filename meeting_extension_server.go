package main

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
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
	mutex            sync.Mutex
	activeClient     *websocket.Conn
	activeSpeakerMap map[string]string // e.g. mapping "Speaker 2" -> "Karthik"
	lastActiveSpeaker string
	lastSpeakerTime   time.Time
}

var globalExtensionServer = &ExtensionBridgeServer{
	activeSpeakerMap: make(map[string]string),
}

// StartExtensionWebSocketServer starts local WebSocket listener on 127.0.0.1:28282
func StartExtensionWebSocketServer() {
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

	// Notify frontend UI that companion is connected
	engine := GetMeetingEngine()
	if engine != nil && engine.ctx != nil {
		wailsRuntime.EventsEmit(engine.ctx, "extension-connection-status", true)
	}
	if globalApp != nil && globalApp.ctx != nil {
		wailsRuntime.EventsEmit(globalApp.ctx, "extension-connection-status", true)
	}

	defer func() {
		globalExtensionServer.mutex.Lock()
		if globalExtensionServer.activeClient == conn {
			globalExtensionServer.activeClient = nil
		}
		globalExtensionServer.mutex.Unlock()
		conn.Close()
		fmt.Println("[Extension Server] Browser Companion disconnected")
		if engine != nil && engine.ctx != nil {
			wailsRuntime.EventsEmit(engine.ctx, "extension-connection-status", false)
		}
		if globalApp != nil && globalApp.ctx != nil {
			wailsRuntime.EventsEmit(globalApp.ctx, "extension-connection-status", false)
		}
	}()

	for {
		_, msgBytes, err := conn.ReadMessage()
		if err != nil {
			break
		}

		var msg ExtensionAudioMessage
		if err := json.Unmarshal(msgBytes, &msg); err != nil {
			continue
		}

		if msg.Type == "SPEAKER_ACTIVE" && msg.SpeakerName != "" {
			globalExtensionServer.mutex.Lock()
			globalExtensionServer.lastActiveSpeaker = msg.SpeakerName
			globalExtensionServer.lastSpeakerTime = time.Now()
			globalExtensionServer.mutex.Unlock()

			// Broadcast current speaker name to UI
			if globalApp != nil && globalApp.ctx != nil {
				wailsRuntime.EventsEmit(globalApp.ctx, "meeting-extension-speaker", map[string]interface{}{
					"speaker":  msg.SpeakerName,
					"platform": msg.Platform,
				})
			}
		} else if msg.Type == "AUDIO_CHUNK" && msg.PcmBase64 != "" {
			// Process audio chunk from specific speaker
			data, err := base64.StdEncoding.DecodeString(msg.PcmBase64)
			if err != nil || len(data) == 0 {
				continue
			}

			// Convert 16-bit PCM bytes to float32 samples
			numSamples := len(data) / 2
			samples := make([]float32, numSamples)
			for i := 0; i < numSamples; i++ {
				val := int16(data[i*2]) | (int16(data[i*2+1]) << 8)
				samples[i] = float32(val) / 32768.0
			}

			speaker := msg.SpeakerName
			if speaker == "" {
				speaker = "Remote Speaker"
			}

			engine := GetMeetingEngine()
			if engine.isRecording && engine.segmentQueue != nil {
				nowMs := time.Since(engine.startTime).Milliseconds()
				seg := SpeechSegment{
					MeetingID: engine.meetingID,
					Speaker:   speaker,
					StartMs:   nowMs - int64(numSamples*1000/16000),
					EndMs:     nowMs,
					Samples:   samples,
				}
				select {
				case engine.segmentQueue <- seg:
				default:
				}
			}
		}
	}
}

// GetCurrentExtensionSpeaker returns the last detected speaker name if within 4 seconds
func GetCurrentExtensionSpeaker() string {
	globalExtensionServer.mutex.Lock()
	defer globalExtensionServer.mutex.Unlock()
	if time.Since(globalExtensionServer.lastSpeakerTime) < 4*time.Second {
		return globalExtensionServer.lastActiveSpeaker
	}
	return ""
}
