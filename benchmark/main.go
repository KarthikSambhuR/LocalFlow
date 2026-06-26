package main

import (
	"encoding/json"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"time"

	ort "github.com/yalue/onnxruntime_go"
)

var (
	conformerVocab      map[string][]string
	conformerMasks      map[string][]bool
	preprocessorSession *ort.DynamicAdvancedSession
	encoderSession      *ort.DynamicAdvancedSession
	ctcSession          *ort.DynamicAdvancedSession
)

func loadConformerMetadata(tsFolder string) error {
	// Load vocab.json
	vocabPath := filepath.Join(tsFolder, "assets", "vocab.json")
	vocabData, err := os.ReadFile(vocabPath)
	if err != nil {
		return fmt.Errorf("failed to read vocab.json: %w", err)
	}
	if err := json.Unmarshal(vocabData, &conformerVocab); err != nil {
		return fmt.Errorf("failed to parse vocab.json: %w", err)
	}

	// Load language_masks.json
	masksPath := filepath.Join(tsFolder, "assets", "language_masks.json")
	masksData, err := os.ReadFile(masksPath)
	if err != nil {
		return fmt.Errorf("failed to read language_masks.json: %w", err)
	}
	if err := json.Unmarshal(masksData, &conformerMasks); err != nil {
		return fmt.Errorf("failed to parse language_masks.json: %w", err)
	}

	return nil
}

func createONNXSession(modelPath string, inputNames, outputNames []string) (*ort.DynamicAdvancedSession, error) {
	options, err := ort.NewSessionOptions()
	if err != nil {
		return nil, fmt.Errorf("failed to create session options: %w", err)
	}
	defer options.Destroy()

	// Run on CPU for pure standard baseline
	session, err := ort.NewDynamicAdvancedSession(
		modelPath,
		inputNames,
		outputNames,
		options,
	)
	if err != nil {
		return nil, err
	}
	return session, nil
}

func loadSessions(tsFolder string) error {
	// 1. Create preprocessor session
	preprocessorPath := filepath.Join(tsFolder, "assets", "preprocessor.onnx")
	pSession, err := createONNXSession(preprocessorPath, []string{"input_signal", "length"}, []string{"audio_signal", "length_out"})
	if err != nil {
		return fmt.Errorf("failed to create preprocessor session: %w", err)
	}

	// 2. Create encoder session
	encoderPath := filepath.Join(tsFolder, "assets", "encoder.onnx")
	eSession, err := createONNXSession(encoderPath, []string{"audio_signal", "length"}, []string{"outputs", "encoded_lengths"})
	if err != nil {
		pSession.Destroy()
		return fmt.Errorf("failed to create encoder session: %w", err)
	}

	// 3. Create ctc_decoder session
	ctcPath := filepath.Join(tsFolder, "assets", "ctc_decoder.onnx")
	cSession, err := createONNXSession(ctcPath, []string{"encoder_output"}, []string{"logprobs"})
	if err != nil {
		pSession.Destroy()
		eSession.Destroy()
		return fmt.Errorf("failed to create ctc_decoder session: %w", err)
	}

	preprocessorSession = pSession
	encoderSession = eSession
	ctcSession = cSession
	return nil
}

func runInference(samples []float32) (string, error) {
	// 1. Create input tensors for preprocessor.onnx
	wavShape := ort.NewShape(1, int64(len(samples)))
	wavTensor, err := ort.NewTensor(wavShape, samples)
	if err != nil {
		return "", err
	}
	defer wavTensor.Destroy()

	lenShape := ort.NewShape(1)
	lenTensor, err := ort.NewTensor(lenShape, []int64{int64(len(samples))})
	if err != nil {
		return "", err
	}
	defer lenTensor.Destroy()

	// 2. Run preprocessor session
	preprocessorOutputs := make([]ort.Value, 2)
	err = preprocessorSession.Run([]ort.Value{wavTensor, lenTensor}, preprocessorOutputs)
	if err != nil {
		return "", err
	}
	defer preprocessorOutputs[0].Destroy()
	defer preprocessorOutputs[1].Destroy()

	// 3. Run encoder session
	encoderOutputs := make([]ort.Value, 2)
	err = encoderSession.Run([]ort.Value{preprocessorOutputs[0], preprocessorOutputs[1]}, encoderOutputs)
	if err != nil {
		return "", err
	}
	defer encoderOutputs[0].Destroy()
	defer encoderOutputs[1].Destroy()

	// 4. Run ctc_decoder session
	ctcOutputs := make([]ort.Value, 1)
	err = ctcSession.Run([]ort.Value{encoderOutputs[0]}, ctcOutputs)
	if err != nil {
		return "", err
	}
	defer ctcOutputs[0].Destroy()

	// 5. Decode output
	logprobsTensor, ok := ctcOutputs[0].(*ort.Tensor[float32])
	if !ok {
		return "", fmt.Errorf("ctc_decoder output is not a float32 tensor")
	}

	logprobsData := logprobsTensor.GetData()
	logprobsShape := logprobsTensor.GetShape()
	outTimeSteps := logprobsShape[1]
	vocabSize := logprobsShape[2]

	lang := "ml"
	mask := conformerMasks[lang]

	var collapsedIndices []int
	var lastIdx = -1

	for t := int64(0); t < outTimeSteps; t++ {
		offset := t * vocabSize
		frameLogprobs := logprobsData[offset : offset+vocabSize]

		maxVal := float32(-math.MaxFloat32)
		maxIdx := -1
		filteredIdx := 0

		for i := 0; i < int(vocabSize); i++ {
			if i < len(mask) && mask[i] {
				val := frameLogprobs[i]
				if val > maxVal {
					maxVal = val
					maxIdx = filteredIdx
				}
				filteredIdx++
			}
		}

		if maxIdx != -1 {
			if maxIdx != 256 {
				if maxIdx != lastIdx {
					collapsedIndices = append(collapsedIndices, maxIdx)
					lastIdx = maxIdx
				}
			} else {
				lastIdx = -1
			}
		}
	}

	return fmt.Sprintf("Decoded %d tokens", len(collapsedIndices)), nil
}

func main() {
	dllPath := filepath.Join("lib", "dll", "onnxruntime.dll")
	fmt.Printf("Initializing ONNX Runtime: %s\n", dllPath)
	ort.SetSharedLibraryPath(dllPath)
	if err := ort.InitializeEnvironment(); err != nil {
		fmt.Printf("Error: %v\n", err)
		return
	}
	defer ort.DestroyEnvironment()

	tsFolder := filepath.Join("build", "New Folder", "models", "indic-conformer-600m-multilingual")

	fmt.Println("Measuring model load time...")
	startLoad := time.Now()
	if err := loadConformerMetadata(tsFolder); err != nil {
		fmt.Printf("Metadata load error: %v\n", err)
		return
	}
	metadataDuration := time.Since(startLoad)
	fmt.Printf("Metadata loaded in: %v\n", metadataDuration)

	startSessions := time.Now()
	if err := loadSessions(tsFolder); err != nil {
		fmt.Printf("Sessions load error: %v\n", err)
		return
	}
	sessionsDuration := time.Since(startSessions)
	fmt.Printf("ONNX Sessions loaded in: %v\n", sessionsDuration)
	
	totalLoadDuration := time.Since(startLoad)
	fmt.Printf("Total load time: %v\n", totalLoadDuration)

	// Create dummy audio: 16 kHz sample rate, 10 seconds = 160,000 samples
	audioDurationSec := 10.0
	sampleRate := 16000
	numSamples := int(audioDurationSec * float64(sampleRate))
	dummyWaveform := make([]float32, numSamples)
	// Fill with a simple sine wave so it's not all zeros
	for i := 0; i < numSamples; i++ {
		dummyWaveform[i] = float32(math.Sin(2.0 * math.Pi * 440.0 * float64(i) / float64(sampleRate)))
	}

	fmt.Printf("\nRunning warm-up inference on %.1fs of audio...\n", audioDurationSec)
	_, err := runInference(dummyWaveform)
	if err != nil {
		fmt.Printf("Warmup failed: %v\n", err)
		return
	}
	fmt.Println("Warm-up complete.")

	// Benchmark runs
	runs := 3
	fmt.Printf("Running %d benchmark iterations...\n", runs)
	var totalInferenceDuration time.Duration

	for i := 1; i <= runs; i++ {
		startInf := time.Now()
		_, err := runInference(dummyWaveform)
		if err != nil {
			fmt.Printf("Run %d failed: %v\n", i, err)
			return
		}
		duration := time.Since(startInf)
		fmt.Printf("Run %d: %v\n", i, duration)
		totalInferenceDuration += duration
	}

	avgDuration := totalInferenceDuration / time.Duration(runs)
	rtf := avgDuration.Seconds() / audioDurationSec

	fmt.Println("\n--- Benchmark Results ---")
	fmt.Printf("Model Load Time: %v\n", totalLoadDuration)
	fmt.Printf("Average Inference Time (%.1fs Audio): %v\n", audioDurationSec, avgDuration)
	fmt.Printf("Realtime Factor (RTF): %.4f\n", rtf)
	fmt.Println("-------------------------")
}
