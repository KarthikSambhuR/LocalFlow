package main

import (
	"encoding/binary"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

var (
	audioCacheDir = "audio_cache"
	cacheMaxAge   = 7 * 24 * time.Hour // 1 week
)

// pruneAudioCache deletes WAV files in audio_cache/ that are older than the specified retention days.
// If retentionDays <= 0, no pruning is performed.
// Called ONLY at startup — never mid-session.
func pruneAudioCache(retentionDays int) {
	if retentionDays <= 0 {
		return
	}
	entries, err := os.ReadDir(audioCacheDir)
	if err != nil {
		// Directory doesn't exist yet — nothing to prune
		return
	}

	cutoff := time.Now().AddDate(0, 0, -retentionDays)
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			continue
		}
		if info.ModTime().Before(cutoff) {
			path := filepath.Join(audioCacheDir, entry.Name())
			os.Remove(path)
		}
	}
}

// ensureAudioCacheDir makes the audio_cache directory if it doesn't exist.
func ensureAudioCacheDir() {
	os.MkdirAll(audioCacheDir, 0755)
}

// saveAudioToCache writes a float32 PCM recording as a standard WAV file.
// Filename: audio_cache/recording_2026-03-23T22-57-02.wav
// Format: IEEE float 32-bit, mono, 16000 Hz — identical to what Whisper receives.
// Returns the generated base filename and any error.
func saveAudioToCache(samples []float32) (string, error) {
	if err := ensureAudioCacheDirErr(); err != nil {
		return "", err
	}

	ts := time.Now().Format("2006-01-02T15-04-05")
	baseName := fmt.Sprintf("recording_%s.wav", ts)
	filename := filepath.Join(audioCacheDir, baseName)

	f, err := os.Create(filename)
	if err != nil {
		return "", err
	}
	defer f.Close()

	const (
		sampleRate    = 16000
		numChannels   = 1
		bitsPerSample = 16
		audioFmtPCM   = 1 // Standard PCM — universally supported by all browsers
	)

	numSamples := len(samples)
	dataSize := uint32(numSamples * 2) // 2 bytes per int16
	byteRate := uint32(sampleRate * numChannels * bitsPerSample / 8)
	blockAlign := uint16(numChannels * bitsPerSample / 8)

	write := func(v interface{}) {
		binary.Write(f, binary.LittleEndian, v)
	}

	// RIFF header
	f.WriteString("RIFF")
	write(uint32(36 + dataSize))
	f.WriteString("WAVE")

	// fmt chunk
	f.WriteString("fmt ")
	write(uint32(16))
	write(uint16(audioFmtPCM))
	write(uint16(numChannels))
	write(uint32(sampleRate))
	write(byteRate)
	write(blockAlign)
	write(uint16(bitsPerSample))

	// data chunk
	f.WriteString("data")
	write(dataSize)
	for _, s := range samples {
		// Clamp and convert float32 [-1,1] → int16 [-32767, 32767]
		if s > 1.0 {
			s = 1.0
		} else if s < -1.0 {
			s = -1.0
		}
		write(int16(s * 32767))
	}

	return baseName, nil
}

func ensureAudioCacheDirErr() error {
	return os.MkdirAll(audioCacheDir, 0755)
}
