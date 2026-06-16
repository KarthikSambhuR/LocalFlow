package main

import (
	"encoding/json"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"strings"

	ort "github.com/yalue/onnxruntime_go"
	"sync"
)

// Global cache for vocab, masks, and sessions
var (
	conformerVocab      map[string][]string
	conformerMasks      map[string][]bool
	conformerLoaded     bool
	conformerMutex      sync.Mutex
	preprocessorSession *ort.DynamicAdvancedSession
	encoderSession      *ort.DynamicAdvancedSession
	ctcSession          *ort.DynamicAdvancedSession
	cachedEngine        string
	cachedGPU           string
)

func getConformerFolder() string {
	cfg := loadConfig()
	return filepath.Join(getDataDir(cfg), "models", "indic-conformer-600m-multilingual")
}



func loadConformerMetadata(tsFolder string) error {
	if conformerLoaded {
		return nil
	}

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

	conformerLoaded = true
	return nil
}

func createONNXSession(modelPath string, inputNames, outputNames []string) (*ort.DynamicAdvancedSession, error) {
	// Create session options
	options, err := ort.NewSessionOptions()
	if err != nil {
		fmt.Printf("Error: failed to create session options: %v\n", err)
		return nil, fmt.Errorf("failed to create session options: %w", err)
	}
	defer options.Destroy()

	// Try to enable DirectML for GPU acceleration
	cfg := loadConfig()
	gpuIndex := 0
	gpuEnabled := false
	if cfg.ProcessingEngine == "vulkan" {
		if cfg.SelectedGPU != "Default" {
			gpus := GetGPUDevicesList()
			for i, name := range gpus {
				if name == cfg.SelectedGPU {
					gpuIndex = i
					break
				}
			}
		}

		errDML := options.AppendExecutionProviderDirectML(gpuIndex)
		if errDML != nil {
			fmt.Printf("Warning: Failed to enable DirectML on GPU %d for %s (falling back to CPU): %v\n", gpuIndex, filepath.Base(modelPath), errDML)
		} else {
			fmt.Printf("Successfully enabled ONNX GPU acceleration (DirectML) on GPU %d for %s\n", gpuIndex, filepath.Base(modelPath))
			gpuEnabled = true
		}
	}

	if !gpuEnabled {
		fmt.Printf("Info: Running %s on CPU\n", filepath.Base(modelPath))
	}

	session, err := ort.NewDynamicAdvancedSession(
		modelPath,
		inputNames,
		outputNames,
		options,
	)
	if err != nil {
		fmt.Printf("Error: Failed to create session for %s: %v\n", filepath.Base(modelPath), err)
		return nil, err
	}
	return session, nil
}

// initOrReuseSessions ensures the sessions are loaded and match current config.
func initOrReuseSessions(tsFolder string) error {
	conformerMutex.Lock()
	defer conformerMutex.Unlock()

	cfg := loadConfig()
	if preprocessorSession != nil && encoderSession != nil && ctcSession != nil &&
		cachedEngine == cfg.ProcessingEngine && cachedGPU == cfg.SelectedGPU {
		return nil
	}

	// Clean up old sessions
	if preprocessorSession != nil {
		preprocessorSession.Destroy()
		preprocessorSession = nil
	}
	if encoderSession != nil {
		encoderSession.Destroy()
		encoderSession = nil
	}
	if ctcSession != nil {
		ctcSession.Destroy()
		ctcSession = nil
	}

	fmt.Println("Initializing new ONNX Conformer sessions...")

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
	cachedEngine = cfg.ProcessingEngine
	cachedGPU = cfg.SelectedGPU

	fmt.Println("Successfully initialized and cached ONNX Conformer sessions.")
	return nil
}

// TranscribeIndicConformer runs the conformer model on the given audio samples.
func TranscribeIndicConformer(samples []float32) (string, error) {
	tsFolder := getConformerFolder()
	
	// Ensure metadata is loaded
	if err := loadConformerMetadata(tsFolder); err != nil {
		fmt.Printf("Error: failed to load conformer metadata: %v\n", err)
		return "", err
	}

	// Ensure sessions are initialized
	if err := initOrReuseSessions(tsFolder); err != nil {
		return "", err
	}

	// 1. Create input tensors for preprocessor.onnx
	wavShape := ort.NewShape(1, int64(len(samples)))
	wavTensor, err := ort.NewTensor(wavShape, samples)
	if err != nil {
		fmt.Printf("Error: failed to create wav tensor: %v\n", err)
		return "", fmt.Errorf("failed to create wav tensor: %w", err)
	}
	defer wavTensor.Destroy()

	lenShape := ort.NewShape(1)
	lenTensor, err := ort.NewTensor(lenShape, []int64{int64(len(samples))})
	if err != nil {
		fmt.Printf("Error: failed to create len tensor: %v\n", err)
		return "", fmt.Errorf("failed to create len tensor: %w", err)
	}
	defer lenTensor.Destroy()

	// 2. Run preprocessor session
	preprocessorOutputs := make([]ort.Value, 2) // audio_signal, length_out
	err = preprocessorSession.Run([]ort.Value{wavTensor, lenTensor}, preprocessorOutputs)
	if err != nil {
		fmt.Printf("Error: failed to run preprocessor: %v\n", err)
		return "", fmt.Errorf("failed to run preprocessor: %w", err)
	}
	defer preprocessorOutputs[0].Destroy()
	defer preprocessorOutputs[1].Destroy()

	// 3. Run encoder session
	encoderOutputs := make([]ort.Value, 2) // outputs, encoded_lengths
	err = encoderSession.Run([]ort.Value{preprocessorOutputs[0], preprocessorOutputs[1]}, encoderOutputs)
	if err != nil {
		fmt.Printf("Error: failed to run encoder session: %v\n", err)
		return "", fmt.Errorf("failed to run encoder session: %w", err)
	}
	defer encoderOutputs[0].Destroy()
	defer encoderOutputs[1].Destroy()

	// 4. Run ctc_decoder session
	ctcOutputs := make([]ort.Value, 1) // logprobs
	err = ctcSession.Run([]ort.Value{encoderOutputs[0]}, ctcOutputs)
	if err != nil {
		fmt.Printf("Error: failed to run ctc_decoder session: %v\n", err)
		return "", fmt.Errorf("failed to run ctc_decoder session: %w", err)
	}
	defer ctcOutputs[0].Destroy()

	// 5. Decode output logprobs
	logprobsTensor, ok := ctcOutputs[0].(*ort.Tensor[float32])
	if !ok {
		fmt.Println("Error: ctc_decoder output is not a float32 tensor")
		return "", fmt.Errorf("ctc_decoder output is not a float32 tensor")
	}

	logprobsData := logprobsTensor.GetData()
	logprobsShape := logprobsTensor.GetShape() // shape should be [1, time_steps, vocab_size]
	if len(logprobsShape) < 3 {
		fmt.Printf("Error: invalid logprobs shape: %v\n", logprobsShape)
		return "", fmt.Errorf("invalid logprobs shape: %v", logprobsShape)
	}
	outTimeSteps := logprobsShape[1]
	vocabSize := logprobsShape[2]

	lang := "ml"
	mask := conformerMasks[lang]
	vocab := conformerVocab[lang]

	var collapsedIndices []int
	var lastIdx = -1

	for t := int64(0); t < outTimeSteps; t++ {
		offset := t * vocabSize
		frameLogprobs := logprobsData[offset : offset+vocabSize]

		// Find the argmax of the logprobs filtered by the language mask
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
			// BLANK_ID is 256 for conformer
			if maxIdx != 256 {
				if maxIdx != lastIdx {
					collapsedIndices = append(collapsedIndices, maxIdx)
					lastIdx = maxIdx
				}
			} else {
				lastIdx = -1 // Reset duplicate tracking on blank
			}
		}
	}

	// Map indices back to characters using vocabulary
	var words []string
	for _, idx := range collapsedIndices {
		if idx < len(vocab) {
			words = append(words, vocab[idx])
		}
	}

	rawText := strings.Join(words, "")
	// Clean up formatting: NeMo uses '▁' as word boundaries
	cleanedText := strings.ReplaceAll(rawText, "▁", " ")
	cleanedText = strings.TrimSpace(cleanedText)

	return cleanedText, nil
}

// LoadConformerSessions explicitly initializes the conformer model in memory/GPU.
func LoadConformerSessions() error {
	tsFolder := getConformerFolder()
	if err := loadConformerMetadata(tsFolder); err != nil {
		return err
	}
	return initOrReuseSessions(tsFolder)
}

// FreeConformerSessions explicitly destroys the conformer sessions and releases memory/GPU.
func FreeConformerSessions() {
	conformerMutex.Lock()
	defer conformerMutex.Unlock()

	if preprocessorSession == nil && encoderSession == nil && ctcSession == nil {
		return
	}

	if preprocessorSession != nil {
		preprocessorSession.Destroy()
		preprocessorSession = nil
	}
	if encoderSession != nil {
		encoderSession.Destroy()
		encoderSession = nil
	}
	if ctcSession != nil {
		ctcSession.Destroy()
		ctcSession = nil
	}
	cachedEngine = ""
	cachedGPU = ""
	fmt.Println("Freed ONNX Conformer sessions from memory/GPU.")
}

