package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"

	ort "github.com/yalue/onnxruntime_go"
)

type ParakeetFileSpec struct {
	Filename string
	URL      string
	ApproxMB int64
}

type parakeetConfig struct {
	VocabSize    int     `json:"vocab_size"`
	BlankTokenID int     `json:"blank_token_id"`
	MaxTokens    int     `json:"max_tokens_per_step"`
	Durations    []int   `json:"durations"`
	FrameSeconds float64 `json:"encoder_frame_seconds"`
}

type parakeetVocab struct {
	pieces  map[int]string
	blankID int
	skipIDs map[int]bool
	size    int
}

var (
	parakeetMutex       sync.Mutex
	parakeetPreproc     *ort.DynamicAdvancedSession
	parakeetEncoder     *ort.DynamicAdvancedSession
	parakeetDecoder     *ort.DynamicAdvancedSession
	parakeetVocabData   *parakeetVocab
	parakeetCfg         parakeetConfig
	parakeetStateLayers int64
	parakeetStateHidden int64
	parakeetCachedDir   string
	parakeetPreIn       []string
	parakeetPreOut      []string
	parakeetEncIn       []string
	parakeetEncOut      []string
	parakeetDecIn       []string
	parakeetDecOut      []string
)

// IsParakeetActive reports whether modelName refers to an ONNX Parakeet model.
func IsParakeetActive(modelName string) bool {
	return modelName == "parakeet-tdt-v3" || modelName == "parakeet-redux"
}

// ParakeetModelFiles returns the directory name and HuggingFace file list for a Parakeet variant.
func ParakeetModelFiles(id string) (string, []ParakeetFileSpec) {
	switch id {
	case "parakeet-tdt-v3":
		base := "https://huggingface.co/istupakov/parakeet-tdt-0.6b-v3-onnx/resolve/main/"
		return "parakeet-tdt-v3", []ParakeetFileSpec{
			{Filename: "nemo128.onnx", URL: base + "nemo128.onnx?download=true", ApproxMB: 1},
			{Filename: "encoder-model.int8.onnx", URL: base + "encoder-model.int8.onnx?download=true", ApproxMB: 622},
			{Filename: "decoder_joint-model.int8.onnx", URL: base + "decoder_joint-model.int8.onnx?download=true", ApproxMB: 18},
			{Filename: "vocab.txt", URL: base + "vocab.txt?download=true", ApproxMB: 1},
		}
	case "parakeet-redux":
		base := "https://huggingface.co/eschmidbauer/parakeet-redux-onnx/resolve/main/"
		return "parakeet-redux", []ParakeetFileSpec{
			{Filename: "preprocessor.onnx", URL: base + "preprocessor.onnx?download=true", ApproxMB: 1},
			{Filename: "encoder-model.onnx", URL: base + "encoder-model.onnx?download=true", ApproxMB: 328},
			{Filename: "decoder_joint-model.onnx", URL: base + "decoder_joint-model.onnx?download=true", ApproxMB: 69},
			{Filename: "vocab.txt", URL: base + "vocab.txt?download=true", ApproxMB: 1},
			{Filename: "config.json", URL: base + "config.json?download=true", ApproxMB: 1},
		}
	default:
		return "", nil
	}
}

func parakeetRequiredFiles(id string) (preproc, encoder, decoder string) {
	if id == "parakeet-tdt-v3" {
		return "nemo128.onnx", "encoder-model.int8.onnx", "decoder_joint-model.int8.onnx"
	}
	return "preprocessor.onnx", "encoder-model.onnx", "decoder_joint-model.onnx"
}

// IsParakeetModelDownloaded checks whether all required files for id exist in modelsDir (or ./models).
func IsParakeetModelDownloaded(modelsDir, id string) bool {
	dirName, files := ParakeetModelFiles(id)
	if dirName == "" {
		return false
	}
	for _, baseDir := range []string{filepath.Join(modelsDir, dirName), filepath.Join("models", dirName)} {
		allPresent := true
		for _, f := range files {
			if _, err := os.Stat(filepath.Join(baseDir, f.Filename)); err != nil {
				allPresent = false
				break
			}
		}
		if allPresent {
			return true
		}
	}
	return false
}

// ResolveParakeetModelDir locates the downloaded Parakeet model directory.
func ResolveParakeetModelDir(cfg Config, modelName string) string {
	dataDir := getBaseAppDir()
	if cfg.DataFolder != "" && cfg.DataFolder != "Default" {
		dataDir = cfg.DataFolder
	}
	modelsDir := filepath.Join(dataDir, "models")
	for _, candidate := range []string{filepath.Join(modelsDir, modelName), filepath.Join("models", modelName)} {
		if st, err := os.Stat(candidate); err == nil && st.IsDir() {
			return candidate
		}
	}
	return filepath.Join(modelsDir, modelName)
}

func loadParakeetVocab(path string) (*parakeetVocab, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	v := &parakeetVocab{
		pieces:  make(map[int]string),
		blankID: 8192,
		skipIDs: make(map[int]bool),
	}
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := scanner.Text()
		if line == "" {
			continue
		}
		idx := strings.LastIndex(line, " ")
		if idx <= 0 {
			continue
		}
		piece := line[:idx]
		id, err := strconv.Atoi(strings.TrimSpace(line[idx+1:]))
		if err != nil {
			continue
		}
		v.pieces[id] = piece
		if id+1 > v.size {
			v.size = id + 1
		}
		if piece == "<blk>" {
			v.blankID = id
			v.skipIDs[id] = true
		} else if piece == "<unk>" || piece == "<pad>" {
			v.skipIDs[id] = true
		}
	}
	if err := scanner.Err(); err != nil {
		return nil, err
	}
	return v, nil
}

func ioNames(infos []ort.InputOutputInfo) []string {
	names := make([]string, len(infos))
	for i, info := range infos {
		names[i] = info.Name
	}
	return names
}

// LoadParakeetSessions loads preprocessor, encoder, and decoder_joint ONNX sessions.
func LoadParakeetSessions(modelDir string, modelID string) error {
	parakeetMutex.Lock()
	defer parakeetMutex.Unlock()

	if parakeetCachedDir == modelDir && parakeetEncoder != nil && parakeetDecoder != nil && parakeetPreproc != nil {
		return nil
	}

	freeParakeetSessionsLocked()

	if err := ort.InitializeEnvironment(); err != nil {
		// Ignore if already initialized
		if !strings.Contains(strings.ToLower(err.Error()), "already") {
			if initErr := InitONNXEnvironment(); initErr != nil {
				return initErr
			}
		}
	}

	preFile, encFile, decFile := parakeetRequiredFiles(modelID)
	prePath := filepath.Join(modelDir, preFile)
	encPath := filepath.Join(modelDir, encFile)
	decPath := filepath.Join(modelDir, decFile)
	vocabPath := filepath.Join(modelDir, "vocab.txt")

	vocab, err := loadParakeetVocab(vocabPath)
	if err != nil {
		return fmt.Errorf("failed to load Parakeet vocab: %w", err)
	}

	pCfg := parakeetConfig{
		VocabSize:    vocab.size,
		BlankTokenID: vocab.blankID,
		MaxTokens:    10,
		Durations:    []int{0, 1, 2, 3, 4},
		FrameSeconds: 0.08,
	}
	if cfgBytes, err := os.ReadFile(filepath.Join(modelDir, "config.json")); err == nil {
		var diskCfg parakeetConfig
		if json.Unmarshal(cfgBytes, &diskCfg) == nil {
			if diskCfg.VocabSize > 0 {
				pCfg.VocabSize = diskCfg.VocabSize
			}
			if diskCfg.BlankTokenID > 0 {
				pCfg.BlankTokenID = diskCfg.BlankTokenID
			}
			if diskCfg.MaxTokens > 0 {
				pCfg.MaxTokens = diskCfg.MaxTokens
			}
			if len(diskCfg.Durations) > 0 {
				pCfg.Durations = diskCfg.Durations
			}
		}
	}

	preIns, preOuts, err := ort.GetInputOutputInfo(prePath)
	if err != nil {
		return fmt.Errorf("failed to inspect preprocessor.onnx: %w", err)
	}
	encIns, encOuts, err := ort.GetInputOutputInfo(encPath)
	if err != nil {
		return fmt.Errorf("failed to inspect encoder.onnx: %w", err)
	}
	decIns, decOuts, err := ort.GetInputOutputInfo(decPath)
	if err != nil {
		return fmt.Errorf("failed to inspect decoder_joint.onnx: %w", err)
	}

	stateLayers := int64(2)
	stateHidden := int64(640)
	for _, in := range decIns {
		if in.Name == "input_states_1" && len(in.Dimensions) >= 3 {
			if in.Dimensions[0] > 0 {
				stateLayers = in.Dimensions[0]
			}
			if in.Dimensions[2] > 0 {
				stateHidden = in.Dimensions[2]
			}
			break
		}
	}

	opts, err := ort.NewSessionOptions()
	if err != nil {
		return fmt.Errorf("failed to create ONNX session options: %w", err)
	}
	defer opts.Destroy()

	preInNames, preOutNames := ioNames(preIns), ioNames(preOuts)
	encInNames, encOutNames := ioNames(encIns), ioNames(encOuts)
	decInNames, decOutNames := ioNames(decIns), ioNames(decOuts)

	preSess, err := ort.NewDynamicAdvancedSession(prePath, preInNames, preOutNames, opts)
	if err != nil {
		return fmt.Errorf("failed to load Parakeet preprocessor: %w", err)
	}
	encSess, err := ort.NewDynamicAdvancedSession(encPath, encInNames, encOutNames, opts)
	if err != nil {
		preSess.Destroy()
		return fmt.Errorf("failed to load Parakeet encoder: %w", err)
	}
	decSess, err := ort.NewDynamicAdvancedSession(decPath, decInNames, decOutNames, opts)
	if err != nil {
		preSess.Destroy()
		encSess.Destroy()
		return fmt.Errorf("failed to load Parakeet decoder: %w", err)
	}

	parakeetPreproc = preSess
	parakeetEncoder = encSess
	parakeetDecoder = decSess
	parakeetVocabData = vocab
	parakeetCfg = pCfg
	parakeetStateLayers = stateLayers
	parakeetStateHidden = stateHidden
	parakeetPreIn, parakeetPreOut = preInNames, preOutNames
	parakeetEncIn, parakeetEncOut = encInNames, encOutNames
	parakeetDecIn, parakeetDecOut = decInNames, decOutNames
	parakeetCachedDir = modelDir

	fmt.Printf("Successfully loaded Parakeet ONNX model from %s (vocab=%d, state=[%d,1,%d])\n", modelDir, vocab.size, stateLayers, stateHidden)
	return nil
}

func freeParakeetSessionsLocked() {
	if parakeetPreproc != nil {
		_ = parakeetPreproc.Destroy()
		parakeetPreproc = nil
	}
	if parakeetEncoder != nil {
		_ = parakeetEncoder.Destroy()
		parakeetEncoder = nil
	}
	if parakeetDecoder != nil {
		_ = parakeetDecoder.Destroy()
		parakeetDecoder = nil
	}
	parakeetVocabData = nil
	parakeetCachedDir = ""
}

// FreeParakeetSessions releases Parakeet ONNX sessions from memory.
func FreeParakeetSessions() {
	parakeetMutex.Lock()
	defer parakeetMutex.Unlock()
	freeParakeetSessionsLocked()
}

// TranscribeParakeet transcribes 16kHz mono float32 audio using the loaded Parakeet ONNX model.
func TranscribeParakeet(samples []float32) (string, error) {
	parakeetMutex.Lock()
	defer parakeetMutex.Unlock()

	if parakeetPreproc == nil || parakeetEncoder == nil || parakeetDecoder == nil || parakeetVocabData == nil {
		return "", fmt.Errorf("Parakeet model is not loaded")
	}
	if len(samples) < 320 {
		return "", nil
	}

	const maxChunkSamples = 30 * 16000
	var parts []string
	for start := 0; start < len(samples); start += maxChunkSamples {
		end := start + maxChunkSamples
		if end > len(samples) {
			end = len(samples)
		}
		if end-start < 320 {
			break
		}
		txt, err := transcribeParakeetSegmentLocked(samples[start:end])
		if err != nil {
			return "", err
		}
		if txt != "" {
			parts = append(parts, txt)
		}
	}
	return strings.TrimSpace(strings.Join(parts, " ")), nil
}

func transcribeParakeetSegmentLocked(pcm []float32) (string, error) {
	// 1. Preprocessor: waveforms [1, N], waveforms_lens [1] -> features, features_lens
	waveTensor, err := ort.NewTensor(ort.NewShape(1, int64(len(pcm))), pcm)
	if err != nil {
		return "", err
	}
	defer waveTensor.Destroy()

	waveLenTensor, err := ort.NewTensor(ort.NewShape(1), []int64{int64(len(pcm))})
	if err != nil {
		return "", err
	}
	defer waveLenTensor.Destroy()

	preOutputs := make([]ort.Value, len(parakeetPreOut))
	if err := parakeetPreproc.Run([]ort.Value{waveTensor, waveLenTensor}, preOutputs); err != nil {
		return "", fmt.Errorf("Parakeet preprocessor failed: %w", err)
	}
	for _, v := range preOutputs {
		if v != nil {
			defer v.Destroy()
		}
	}

	// 2. Encoder: features, features_lens -> outputs [1, D, T'], out_lengths [1]
	encOutputs := make([]ort.Value, len(parakeetEncOut))
	if err := parakeetEncoder.Run(preOutputs, encOutputs); err != nil {
		return "", fmt.Errorf("Parakeet encoder failed: %w", err)
	}
	for _, v := range encOutputs {
		if v != nil {
			defer v.Destroy()
		}
	}

	encTensor, ok := encOutputs[0].(*ort.Tensor[float32])
	if !ok {
		return "", fmt.Errorf("Parakeet encoder output is not float32")
	}
	encLenTensor, ok := encOutputs[1].(*ort.Tensor[int64])
	if !ok {
		return "", fmt.Errorf("Parakeet encoder length output is not int64")
	}

	encShape := encTensor.GetShape() // [1, D, T_max]
	if len(encShape) < 3 {
		return "", fmt.Errorf("unexpected encoder shape: %v", encShape)
	}
	encDim := int(encShape[1])
	encMaxFrames := int(encShape[2])
	validFrames := int(encLenTensor.GetData()[0])
	if validFrames > encMaxFrames {
		validFrames = encMaxFrames
	}
	if validFrames <= 0 {
		return "", nil
	}
	encData := encTensor.GetData() // row-major [1, D, T_max]

	// 3. Greedy TDT decoding loop
	stateLen := int(parakeetStateLayers * 1 * parakeetStateHidden)
	state1 := make([]float32, stateLen)
	state2 := make([]float32, stateLen)
	stateShape := ort.NewShape(parakeetStateLayers, 1, parakeetStateHidden)

	lastToken := int32(parakeetCfg.BlankTokenID)
	frame := 0
	steps := parakeetCfg.MaxTokens * validFrames
	vocabSize := parakeetCfg.VocabSize
	durations := parakeetCfg.Durations

	encFrameBuf := make([]float32, encDim)
	encFrameShape := ort.NewShape(1, int64(encDim), 1)
	targetShape := ort.NewShape(1, 1)
	targetLenShape := ort.NewShape(1)

	var decodedTokens []int

	for frame < validFrames && steps > 0 {
		for d := 0; d < encDim; d++ {
			encFrameBuf[d] = encData[d*encMaxFrames+frame]
		}

		encFrameT, err := ort.NewTensor(encFrameShape, encFrameBuf)
		if err != nil {
			return "", err
		}
		targetT, err := ort.NewTensor(targetShape, []int32{lastToken})
		if err != nil {
			encFrameT.Destroy()
			return "", err
		}
		targetLenT, err := ort.NewTensor(targetLenShape, []int32{1})
		if err != nil {
			encFrameT.Destroy()
			targetT.Destroy()
			return "", err
		}
		s1T, err := ort.NewTensor(stateShape, state1)
		if err != nil {
			encFrameT.Destroy()
			targetT.Destroy()
			targetLenT.Destroy()
			return "", err
		}
		s2T, err := ort.NewTensor(stateShape, state2)
		if err != nil {
			encFrameT.Destroy()
			targetT.Destroy()
			targetLenT.Destroy()
			s1T.Destroy()
			return "", err
		}

		// Map inputs by name in case order differs between exports
		decInVals := make([]ort.Value, len(parakeetDecIn))
		for idx, name := range parakeetDecIn {
			switch name {
			case "encoder_outputs":
				decInVals[idx] = encFrameT
			case "targets":
				decInVals[idx] = targetT
			case "target_length":
				decInVals[idx] = targetLenT
			case "input_states_1":
				decInVals[idx] = s1T
			case "input_states_2":
				decInVals[idx] = s2T
			}
		}

		decOutVals := make([]ort.Value, len(parakeetDecOut))
		runErr := parakeetDecoder.Run(decInVals, decOutVals)

		encFrameT.Destroy()
		targetT.Destroy()
		targetLenT.Destroy()
		s1T.Destroy()
		s2T.Destroy()

		if runErr != nil {
			return "", fmt.Errorf("Parakeet decoder failed: %w", runErr)
		}

		logitsT, _ := decOutVals[0].(*ort.Tensor[float32])
		logits := logitsT.GetData()

		bestTok := 0
		bestTokVal := float32(-math.MaxFloat32)
		for i := 0; i < vocabSize && i < len(logits); i++ {
			if logits[i] > bestTokVal {
				bestTokVal = logits[i]
				bestTok = i
			}
		}

		bestDurIdx := 0
		bestDurVal := float32(-math.MaxFloat32)
		for i := vocabSize; i < len(logits) && (i-vocabSize) < len(durations); i++ {
			if logits[i] > bestDurVal {
				bestDurVal = logits[i]
				bestDurIdx = i - vocabSize
			}
		}
		dur := durations[bestDurIdx]
		if bestTok == parakeetCfg.BlankTokenID && dur == 0 {
			dur = 1
		}
		frame += dur

		if bestTok != parakeetCfg.BlankTokenID {
			decodedTokens = append(decodedTokens, bestTok)
			lastToken = int32(bestTok)
			if len(decOutVals) >= 4 {
				if hT, ok := decOutVals[2].(*ort.Tensor[float32]); ok {
					copy(state1, hT.GetData())
				}
				if cT, ok := decOutVals[3].(*ort.Tensor[float32]); ok {
					copy(state2, cT.GetData())
				}
			}
		}

		for _, v := range decOutVals {
			if v != nil {
				v.Destroy()
			}
		}
		steps--
	}

	var sb strings.Builder
	for _, tok := range decodedTokens {
		if parakeetVocabData.skipIDs[tok] {
			continue
		}
		if piece, ok := parakeetVocabData.pieces[tok]; ok {
			sb.WriteString(strings.ReplaceAll(piece, "▁", " "))
		}
	}
	return strings.TrimSpace(sb.String()), nil
}
