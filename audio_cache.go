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

// saveAudioToCache writes a float32 PCM recording as a standard 16-bit PCM WAV file.
// Returns the generated base filename and any error.
func saveAudioToCache(samples []float32) (string, error) {
	if err := os.MkdirAll(audioCacheDir, 0755); err != nil {
		return "", err
	}

	ts := time.Now().Format("2006-01-02T15-04-05")
	baseName := fmt.Sprintf("recording_%s.wav", ts)
	filename := filepath.Join(audioCacheDir, baseName)

	if err := saveAudioBufferToWavPath(samples, filename); err != nil {
		return "", err
	}
	return baseName, nil
}

// saveAudioBufferToWavPath writes a float32 PCM slice to a specific WAV file path
// using a single buffered write instead of per-sample syscalls.
func saveAudioBufferToWavPath(samples []float32, filename string) error {
	const (
		sampleRate    = 16000
		numChannels   = 1
		bitsPerSample = 16
		audioFmtPCM   = 1 // Standard PCM — universally supported by all browsers
		headerSize    = 44
	)

	numSamples := len(samples)
	dataSize := uint32(numSamples * 2)
	byteRate := uint32(sampleRate * numChannels * bitsPerSample / 8)
	blockAlign := uint16(numChannels * bitsPerSample / 8)

	buf := make([]byte, headerSize+int(dataSize))
	copy(buf[0:4], "RIFF")
	binary.LittleEndian.PutUint32(buf[4:8], 36+dataSize)
	copy(buf[8:12], "WAVE")
	copy(buf[12:16], "fmt ")
	binary.LittleEndian.PutUint32(buf[16:20], 16)
	binary.LittleEndian.PutUint16(buf[20:22], audioFmtPCM)
	binary.LittleEndian.PutUint16(buf[22:24], numChannels)
	binary.LittleEndian.PutUint32(buf[24:28], sampleRate)
	binary.LittleEndian.PutUint32(buf[28:32], byteRate)
	binary.LittleEndian.PutUint16(buf[32:34], blockAlign)
	binary.LittleEndian.PutUint16(buf[34:36], bitsPerSample)
	copy(buf[36:40], "data")
	binary.LittleEndian.PutUint32(buf[40:44], dataSize)

	offset := headerSize
	for _, s := range samples {
		if s > 1.0 {
			s = 1.0
		} else if s < -1.0 {
			s = -1.0
		}
		binary.LittleEndian.PutUint16(buf[offset:offset+2], uint16(int16(s*32767)))
		offset += 2
	}

	return os.WriteFile(filename, buf, 0644)
}

// loadAudioFromCache reads a 16-bit PCM WAV file from audioCacheDir and returns normalized float32 samples.
func loadAudioFromCache(filename string) ([]float32, error) {
	if filename == "" {
		return nil, fmt.Errorf("no audio file associated with this recording")
	}
	fullPath := filepath.Join(audioCacheDir, filepath.Base(filename))
	data, err := os.ReadFile(fullPath)
	if err != nil {
		return nil, fmt.Errorf("audio file is no longer available in cache")
	}
	if len(data) < 44 || string(data[0:4]) != "RIFF" || string(data[8:12]) != "WAVE" {
		return nil, fmt.Errorf("invalid WAV file format")
	}

	offset := 12
	for offset+8 <= len(data) {
		chunkID := string(data[offset : offset+4])
		chunkSize := int(binary.LittleEndian.Uint32(data[offset+4 : offset+8]))
		offset += 8
		if chunkID == "data" {
			end := offset + chunkSize
			if end > len(data) {
				end = len(data)
			}
			pcm := data[offset:end]
			numSamples := len(pcm) / 2
			if numSamples == 0 {
				return nil, fmt.Errorf("audio file contains no samples")
			}
			samples := make([]float32, numSamples)
			for i := 0; i < numSamples; i++ {
				s := int16(binary.LittleEndian.Uint16(pcm[i*2 : i*2+2]))
				samples[i] = float32(s) / 32768.0
			}
			return samples, nil
		}
		if chunkSize%2 == 1 {
			chunkSize++
		}
		offset += chunkSize
	}
	return nil, fmt.Errorf("WAV data chunk not found")
}
