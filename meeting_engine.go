package main

import (
	"context"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
	"unsafe"

	"github.com/gen2brain/malgo"
	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// SpeakerVoiceProfile tracks the acoustic characteristics of an unidentified loopback speaker.
type SpeakerVoiceProfile struct {
	SpeakerID       string
	AverageCentroid float64
	AverageEnergy   float64
	ZeroCrossRate   float64
	SampleCount     int
}

// SpeechSegment represents an audio segment ready for speech recognition.
type SpeechSegment struct {
	MeetingID string
	Speaker   string
	StartMs   int64
	EndMs     int64
	Samples   []float32
}

// MeetingEngine manages dual-channel recording (Mic + WASAPI Loopback),
// VAD turn segmentation, speaker attribution, and meeting transcription.
type MeetingEngine struct {
	ctx           context.Context
	mutex         sync.Mutex
	isRecording   bool
	meetingID     string
	title         string
	startTime     time.Time
	micDevice     *malgo.Device
	loopbackDev   *malgo.Device
	malgoCtx      *malgo.AllocatedContext
	segmentQueue  chan SpeechSegment
	workerStop    chan struct{}
	allSegments   []MeetingSegment
	micAllAudio   []float32
	sysAllAudio   []float32

	// Loopback speaker clustering
	speakerProfiles []SpeakerVoiceProfile
	nextSpeakerNum  int

	// Acoustic Echo Cancellation (AEC) State
	recentSysAudio []float32
	recentSysRms   float32
	sysRmsMutex    sync.RWMutex
}

var globalMeetingEngine *MeetingEngine
var meetingEngineOnce sync.Once

func GetMeetingEngine() *MeetingEngine {
	meetingEngineOnce.Do(func() {
		globalMeetingEngine = &MeetingEngine{
			nextSpeakerNum: 2, // Speaker 1 is reserved for "You" (Microphone)
		}
	})
	return globalMeetingEngine
}

func (m *MeetingEngine) SetContext(ctx context.Context) {
	m.ctx = ctx
}

func (m *MeetingEngine) IsRecording() bool {
	m.mutex.Lock()
	defer m.mutex.Unlock()
	return m.isRecording
}

// computeAcousticFeatures computes Spectral Centroid, Energy RMS, and Zero Crossing Rate
// for acoustic voice clustering on the loopback channel.
func computeAcousticFeatures(samples []float32, sampleRate int) (float64, float64, float64) {
	if len(samples) == 0 {
		return 0, 0, 0
	}

	var sumSq float64
	var zcrCount int
	for i := 0; i < len(samples); i++ {
		sumSq += float64(samples[i] * samples[i])
		if i > 0 && ((samples[i] >= 0 && samples[i-1] < 0) || (samples[i] < 0 && samples[i-1] >= 0)) {
			zcrCount++
		}
	}
	rms := math.Sqrt(sumSq / float64(len(samples)))
	zcr := float64(zcrCount) / float64(len(samples))

	// Approximate spectral centroid using frame differences
	var weightedDiff float64
	var diffNorm float64
	for i := 1; i < len(samples); i++ {
		diff := math.Abs(float64(samples[i] - samples[i-1]))
		weightedDiff += diff * float64(i)
		diffNorm += diff
	}
	centroid := 0.0
	if diffNorm > 1e-6 {
		centroid = (weightedDiff / diffNorm) / float64(len(samples))
	}

	return centroid, rms, zcr
}

// attributeLoopbackSpeaker clusters voice segments into "Speaker 2", "Speaker 3", etc.
func (m *MeetingEngine) attributeLoopbackSpeaker(samples []float32) string {
	centroid, rms, zcr := computeAcousticFeatures(samples, 16000)

	bestMatch := ""
	minDist := math.MaxFloat64

	// Distance threshold for voice clustering
	const voiceClusterThreshold = 0.18

	for i := range m.speakerProfiles {
		p := &m.speakerProfiles[i]
		// Euclidean distance on normalized spectral features
		dCentroid := (p.AverageCentroid - centroid) * 2.0
		dZCR := (p.ZeroCrossRate - zcr) * 1.5
		dist := math.Sqrt(dCentroid*dCentroid + dZCR*dZCR)

		if dist < minDist {
			minDist = dist
			bestMatch = p.SpeakerID
		}
	}

	if bestMatch != "" && minDist < voiceClusterThreshold {
		// Update running profile
		for i := range m.speakerProfiles {
			if m.speakerProfiles[i].SpeakerID == bestMatch {
				p := &m.speakerProfiles[i]
				p.AverageCentroid = (p.AverageCentroid*float64(p.SampleCount) + centroid) / float64(p.SampleCount+1)
				p.AverageEnergy = (p.AverageEnergy*float64(p.SampleCount) + rms) / float64(p.SampleCount+1)
				p.ZeroCrossRate = (p.ZeroCrossRate*float64(p.SampleCount) + zcr) / float64(p.SampleCount+1)
				p.SampleCount++
				break
			}
		}
		return bestMatch
	}

	// Register a new speaker profile
	newSpeaker := fmt.Sprintf("Speaker %d", m.nextSpeakerNum)
	m.nextSpeakerNum++
	m.speakerProfiles = append(m.speakerProfiles, SpeakerVoiceProfile{
		SpeakerID:       newSpeaker,
		AverageCentroid: centroid,
		AverageEnergy:   rms,
		ZeroCrossRate:   zcr,
		SampleCount:     1,
	})
	return newSpeaker
}

// StartRecording initializes both mic capture and WASAPI loopback capture streams.
func (m *MeetingEngine) StartRecording(title string) (string, error) {
	m.mutex.Lock()
	defer m.mutex.Unlock()

	if m.isRecording {
		return m.meetingID, fmt.Errorf("a meeting is already being recorded")
	}

	if title == "" {
		title = fmt.Sprintf("Meeting %s", time.Now().Format("Jan 02, 15:04"))
	}

	m.meetingID = fmt.Sprintf("meet_%d", time.Now().UnixNano())
	m.title = title
	m.startTime = time.Now()
	m.allSegments = nil
	m.micAllAudio = nil
	m.sysAllAudio = nil
	m.speakerProfiles = nil
	m.nextSpeakerNum = 2
	m.segmentQueue = make(chan SpeechSegment, 256)
	m.workerStop = make(chan struct{})

	// Insert initial meeting row into database
	_ = InsertMeeting(Meeting{
		ID:              m.meetingID,
		Title:           m.title,
		CreatedAt:       m.startTime.Format(time.RFC3339),
		DurationSeconds: 0,
	})

	mctx, err := malgo.InitContext(nil, malgo.ContextConfig{}, nil)
	if err != nil {
		return "", fmt.Errorf("failed to init audio context: %w", err)
	}
	m.malgoCtx = mctx

	cfg := loadConfig()

	// 1. Setup Microphone Device
	micConfig := malgo.DefaultDeviceConfig(malgo.Capture)
	micConfig.Capture.Format = malgo.FormatF32
	micConfig.Capture.Channels = 1
	micConfig.SampleRate = 16000

	if cfg.ActiveMicrophone != "" && cfg.ActiveMicrophone != "Default" {
		devices, err := mctx.Devices(malgo.Capture)
		if err == nil {
			for _, info := range devices {
				if info.Name() == cfg.ActiveMicrophone {
					micConfig.Capture.DeviceID = info.ID.Pointer()
					break
				}
			}
		}
	}

	// VAD buffers for mic
	var micBuf []float32
	var micSpeechStartMs int64 = -1
	var micSilenceCount int = 0
	const silenceCutoffFrames = 20 // ~600ms of silence at 30ms frames
	const baseEnergyThreshold = 0.0015

	onMicData := func(pOutput, pInput []byte, frameCount uint32) {
		if frameCount == 0 || len(pInput) == 0 {
			return
		}
		samples := (*[1 << 30]float32)(unsafe.Pointer(&pInput[0]))[:frameCount]
		nowMs := time.Since(m.startTime).Milliseconds()

		// Calculate volume level for UI
		var sum float32
		for _, s := range samples {
			sum += s * s
		}
		rms := float32(math.Sqrt(float64(sum / float32(len(samples)))))
		if m.ctx != nil {
			wailsRuntime.EventsEmit(m.ctx, "meeting-level-mic", rms*100)
		}

		m.mutex.Lock()
		m.micAllAudio = append(m.micAllAudio, samples...)
		m.mutex.Unlock()

		m.sysRmsMutex.RLock()
		activeSysRms := m.recentSysRms
		m.sysRmsMutex.RUnlock()

		// Acoustic Echo Cancellation (AEC):
		// Only reject as speaker bleed if:
		//   1. The loopback (system output) is measurably active, AND
		//   2. Mic energy is not significantly above loopback (less than 1.5× loopback RMS), AND
		//   3. Mic energy is not above the strong-speech floor (0.018 is a clear human voice)
		// This prevents accidentally killing the user's speech when they speak while remote audio plays.
		strongSpeech := rms > 0.018
		isSpeakerBleed := !strongSpeech && activeSysRms > 0.003 && (rms <= activeSysRms*0.60)

		// Voice Activity Detection with Strict Acoustic Leakage Rejection
		isSpeech := (rms > baseEnergyThreshold) && !isSpeakerBleed
		if isSpeech {
			if micSpeechStartMs == -1 {
				micSpeechStartMs = nowMs
			}
			micBuf = append(micBuf, samples...)
			micSilenceCount = 0
		} else if micSpeechStartMs != -1 {
			micBuf = append(micBuf, samples...)
			micSilenceCount++
			// If silence persists or speech chunk exceeds 12 seconds, dispatch
			if micSilenceCount >= silenceCutoffFrames || len(micBuf) >= 16000*12 {
				if len(micBuf) >= 16000/2 { // At least 0.5s of audio
					chunk := make([]float32, len(micBuf))
					copy(chunk, micBuf)
					select {
					case m.segmentQueue <- SpeechSegment{
						MeetingID: m.meetingID,
						Speaker:   "You",
						StartMs:   micSpeechStartMs,
						EndMs:     nowMs,
						Samples:   chunk,
					}:
					default:
					}
				}
				micBuf = nil
				micSpeechStartMs = -1
				micSilenceCount = 0
			}
		}
	}

	micDev, err := malgo.InitDevice(mctx.Context, micConfig, malgo.DeviceCallbacks{Data: onMicData})
	if err != nil {
		mctx.Free()
		return "", fmt.Errorf("failed to init microphone device: %w", err)
	}
	m.micDevice = micDev

	// 2. Setup WASAPI Loopback Capture (System Output)
	// malgo creates loopback capture when DeviceType is Loopback
	loopbackConfig := malgo.DefaultDeviceConfig(malgo.Loopback)
	loopbackConfig.Capture.Format = malgo.FormatF32
	loopbackConfig.Capture.Channels = 1
	loopbackConfig.SampleRate = 16000

	var sysBuf []float32
	var sysSpeechStartMs int64 = -1
	var sysSilenceCount int = 0

	onLoopbackData := func(pOutput, pInput []byte, frameCount uint32) {
		if frameCount == 0 || len(pInput) == 0 {
			return
		}
		samples := (*[1 << 30]float32)(unsafe.Pointer(&pInput[0]))[:frameCount]
		nowMs := time.Since(m.startTime).Milliseconds()

		var sum float32
		for _, s := range samples {
			sum += s * s
		}
		rms := float32(math.Sqrt(float64(sum / float32(len(samples)))))
		if m.ctx != nil {
			wailsRuntime.EventsEmit(m.ctx, "meeting-level-sys", rms*100)
		}

		// Update AEC loopback energy reference (smoothed)
		m.sysRmsMutex.Lock()
		m.recentSysRms = m.recentSysRms*0.7 + rms*0.3
		m.sysRmsMutex.Unlock()

		m.mutex.Lock()
		m.sysAllAudio = append(m.sysAllAudio, samples...)
		m.mutex.Unlock()

		isSpeech := rms > baseEnergyThreshold
		if isSpeech {
			if sysSpeechStartMs == -1 {
				sysSpeechStartMs = nowMs
			}
			sysBuf = append(sysBuf, samples...)
			sysSilenceCount = 0
		} else if sysSpeechStartMs != -1 {
			sysBuf = append(sysBuf, samples...)
			sysSilenceCount++
			if sysSilenceCount >= silenceCutoffFrames || len(sysBuf) >= 16000*12 {
				if len(sysBuf) >= 16000/2 {
					chunk := make([]float32, len(sysBuf))
					copy(chunk, sysBuf)
					speaker := m.attributeLoopbackSpeaker(chunk)
					select {
					case m.segmentQueue <- SpeechSegment{
						MeetingID: m.meetingID,
						Speaker:   speaker,
						StartMs:   sysSpeechStartMs,
						EndMs:     nowMs,
						Samples:   chunk,
					}:
					default:
					}
				}
				sysBuf = nil
				sysSpeechStartMs = -1
				sysSilenceCount = 0
			}
		}
	}

	loopbackDev, err := malgo.InitDevice(mctx.Context, loopbackConfig, malgo.DeviceCallbacks{Data: onLoopbackData})
	if err != nil {
		fmt.Printf("Warning: WASAPI Loopback init failed (%v). Continuing with Mic-only.\n", err)
	} else {
		m.loopbackDev = loopbackDev
	}

	// Start devices
	if err := m.micDevice.Start(); err != nil {
		return "", fmt.Errorf("failed to start microphone capture: %w", err)
	}
	if m.loopbackDev != nil {
		if err := m.loopbackDev.Start(); err != nil {
			fmt.Printf("Warning: failed to start loopback device: %v\n", err)
		}
	}

	m.isRecording = true

	// Launch background transcription worker
	go m.transcriptionWorker()

	return m.meetingID, nil
}

// transcriptionWorker consumes speech chunks and transcribes them.
func (m *MeetingEngine) transcriptionWorker() {
	for {
		select {
		case <-m.workerStop:
			// Flush any remaining segments
			for len(m.segmentQueue) > 0 {
				seg := <-m.segmentQueue
				m.processSegment(seg)
			}
			return
		case seg := <-m.segmentQueue:
			m.processSegment(seg)
		}
	}
}

func (m *MeetingEngine) processSegment(seg SpeechSegment) {
	text, lang := transcribeMeetingChunk(seg.Samples)
	text = strings.TrimSpace(text)
	if text == "" || text == "[BLANK_AUDIO]" || text == "(blank audio)" || text == "[silence]" {
		return
	}

	segmentItem := MeetingSegment{
		MeetingID: seg.MeetingID,
		Speaker:   seg.Speaker,
		StartMs:   seg.StartMs,
		EndMs:     seg.EndMs,
		Text:      text,
		Language:  lang,
	}

	m.mutex.Lock()
	m.allSegments = append(m.allSegments, segmentItem)
	m.mutex.Unlock()

	// Persist to database
	_ = InsertMeetingSegment(segmentItem)

	// Emit live event to UI
	if m.ctx != nil {
		wailsRuntime.EventsEmit(m.ctx, "meeting-segment-transcribed", segmentItem)
	}
}

// StopRecording halts audio capture, saves mixed audio, and kicks off Gemma meeting summary.
func (m *MeetingEngine) StopRecording() (string, error) {
	m.mutex.Lock()
	if !m.isRecording {
		m.mutex.Unlock()
		return "", fmt.Errorf("no meeting is currently recording")
	}
	m.isRecording = false
	meetingID := m.meetingID
	durationSec := int(time.Since(m.startTime).Seconds())
	m.mutex.Unlock()

	// Stop devices
	if m.micDevice != nil {
		_ = m.micDevice.Stop()
		m.micDevice.Uninit()
		m.micDevice = nil
	}
	if m.loopbackDev != nil {
		_ = m.loopbackDev.Stop()
		m.loopbackDev.Uninit()
		m.loopbackDev = nil
	}
	if m.malgoCtx != nil {
		m.malgoCtx.Free()
		m.malgoCtx = nil
	}

	// Stop transcription worker
	close(m.workerStop)
	time.Sleep(300 * time.Millisecond)

	// Fallback check: if no segments were captured during the meeting (e.g. short recording or continuous speech),
	// directly transcribe the recorded microphone audio so speech is never lost!
	m.mutex.Lock()
	if len(m.allSegments) == 0 {
		fmt.Printf("[Meeting] 0 VAD segments captured. Checking raw audio buffers (mic=%d, sys=%d)...\n", len(m.micAllAudio), len(m.sysAllAudio))
		if len(m.micAllAudio) >= 16000/2 {
			text, lang := transcribeMeetingChunk(m.micAllAudio)
			text = strings.TrimSpace(text)
			if text != "" && text != "[BLANK_AUDIO]" && text != "(blank audio)" && text != "[silence]" {
				seg := MeetingSegment{
					MeetingID: meetingID,
					Speaker:   "You",
					StartMs:   0,
					EndMs:     int64(len(m.micAllAudio)) * 1000 / 16000,
					Text:      text,
					Language:  lang,
				}
				m.allSegments = append(m.allSegments, seg)
				_ = InsertMeetingSegment(seg)
				if m.ctx != nil {
					wailsRuntime.EventsEmit(m.ctx, "meeting-segment-transcribed", seg)
				}
			}
		}
		if len(m.sysAllAudio) >= 16000/2 {
			text, lang := transcribeMeetingChunk(m.sysAllAudio)
			text = strings.TrimSpace(text)
			if text != "" && text != "[BLANK_AUDIO]" && text != "(blank audio)" && text != "[silence]" {
				seg := MeetingSegment{
					MeetingID: meetingID,
					Speaker:   "Speaker 2",
					StartMs:   0,
					EndMs:     int64(len(m.sysAllAudio)) * 1000 / 16000,
					Text:      text,
					Language:  lang,
				}
				m.allSegments = append(m.allSegments, seg)
				_ = InsertMeetingSegment(seg)
				if m.ctx != nil {
					wailsRuntime.EventsEmit(m.ctx, "meeting-segment-transcribed", seg)
				}
			}
		}
	}

	// Mix audio tracks for playback save
	maxLen := len(m.micAllAudio)
	if len(m.sysAllAudio) > maxLen {
		maxLen = len(m.sysAllAudio)
	}
	mixed := make([]float32, maxLen)
	for i := 0; i < maxLen; i++ {
		var s float32
		if i < len(m.micAllAudio) {
			s += m.micAllAudio[i]
		}
		if i < len(m.sysAllAudio) {
			s += m.sysAllAudio[i]
		}
		if s > 1.0 {
			s = 1.0
		} else if s < -1.0 {
			s = -1.0
		}
		mixed[i] = s
	}

	// Build full transcript
	var sb strings.Builder
	for _, s := range m.allSegments {
		minutes := s.StartMs / 60000
		seconds := (s.StartMs % 60000) / 1000
		sb.WriteString(fmt.Sprintf("[%02d:%02d] %s: %s\n", minutes, seconds, s.Speaker, s.Text))
	}
	fullTranscript := sb.String()
	m.mutex.Unlock()

	// Save mixed WAV
	audioFilename, _ := saveMeetingWav(meetingID, mixed)

	// Update DB record
	_ = UpdateMeetingSummary(meetingID, "", "", fullTranscript, durationSec)
	if db != nil {
		_, _ = db.Exec("UPDATE meetings SET audio_path = ? WHERE id = ?", audioFilename, meetingID)
	}

	// Trigger async Gemma summarization
	go func() {
		if m.ctx != nil {
			wailsRuntime.EventsEmit(m.ctx, "meeting-summary-generating", meetingID)
		}
		summary, shortSummary, err := generateMeetingSummary(fullTranscript)
		if err != nil {
			summary = fmt.Sprintf("Summary generation encountered an error: %v\n\nFull dialogue is saved in transcript.", err)
			shortSummary = ""
		}
		fmt.Printf("[MeetingEngine] Summary generated: %d chars, %d newlines\n",
			len(summary), strings.Count(summary, "\n"))
		_ = UpdateMeetingSummary(meetingID, summary, shortSummary, fullTranscript, durationSec)
		if m.ctx != nil {
			wailsRuntime.EventsEmit(m.ctx, "meeting-summary-completed", map[string]interface{}{
				"id":               meetingID,
				"meeting_id":       meetingID,
				"summary":          summary,
				"summary_markdown": summary,
				"short_summary":    shortSummary,
			})
		}
	}()

	return meetingID, nil
}

func saveMeetingWav(meetingID string, samples []float32) (string, error) {
	if len(samples) == 0 {
		return "", nil
	}
	cfg := loadConfig()
	dataDir := getDataDir(cfg)
	meetingsDir := filepath.Join(dataDir, "meetings")
	_ = os.MkdirAll(meetingsDir, 0755)

	baseName := fmt.Sprintf("%s.wav", meetingID)
	fullPath := filepath.Join(meetingsDir, baseName)

	f, err := os.Create(fullPath)
	if err != nil {
		return "", err
	}
	defer f.Close()

	// Write standard 16kHz mono WAV
	writeWavHeader(f, len(samples), 16000, 1)
	for _, s := range samples {
		v := int16(s * 32767.0)
		f.Write([]byte{byte(v), byte(v >> 8)})
	}
	return baseName, nil
}

func writeWavHeader(f *os.File, numSamples int, sampleRate int, numChannels int) {
	bytesPerSample := 2
	dataChunkSize := numSamples * bytesPerSample * numChannels
	fileSize := 36 + dataChunkSize

	f.WriteString("RIFF")
	f.Write([]byte{byte(fileSize), byte(fileSize >> 8), byte(fileSize >> 16), byte(fileSize >> 24)})
	f.WriteString("WAVEfmt ")
	f.Write([]byte{16, 0, 0, 0}) // Subchunk1Size
	f.Write([]byte{1, 0})        // PCM
	f.Write([]byte{byte(numChannels), 0})
	f.Write([]byte{byte(sampleRate), byte(sampleRate >> 8), byte(sampleRate >> 16), byte(sampleRate >> 24)})
	byteRate := sampleRate * numChannels * bytesPerSample
	f.Write([]byte{byte(byteRate), byte(byteRate >> 8), byte(byteRate >> 16), byte(byteRate >> 24)})
	blockAlign := numChannels * bytesPerSample
	f.Write([]byte{byte(blockAlign), 0})
	bitsPerSample := bytesPerSample * 8
	f.Write([]byte{byte(bitsPerSample), 0})
	f.WriteString("data")
	f.Write([]byte{byte(dataChunkSize), byte(dataChunkSize >> 8), byte(dataChunkSize >> 16), byte(dataChunkSize >> 24)})
}
