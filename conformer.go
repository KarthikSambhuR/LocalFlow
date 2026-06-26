package main

import (
	"fmt"
	"math"
	"math/cmplx"
	"path/filepath"
	"sync"

	sp "github.com/tggo/goSentencePiece"
	ort "github.com/yalue/onnxruntime_go"
)

var (
	conformerSession   *ort.DynamicAdvancedSession
	conformerTokenizer *sp.Tokenizer
	conformerMutex     sync.Mutex
	cachedModelPath    string
	cachedEngine       string
	cachedGPU          string
)

// fft computes the 1D Radix-2 FFT of the input slice.
func fft(x []complex128) []complex128 {
	n := len(x)
	if n <= 1 {
		return x
	}
	even := make([]complex128, n/2)
	odd := make([]complex128, n/2)
	for i := 0; i < n/2; i++ {
		even[i] = x[2*i]
		odd[i] = x[2*i+1]
	}
	evenFFT := fft(even)
	oddFFT := fft(odd)

	y := make([]complex128, n)
	for k := 0; k < n/2; k++ {
		angle := -2.0 * math.Pi * float64(k) / float64(n)
		twiddle := cmplx.Rect(1.0, angle) * oddFFT[k]
		y[k] = evenFFT[k] + twiddle
		y[k+n/2] = evenFFT[k] - twiddle
	}
	return y
}

// resample performs simple linear resampling of the input waveform.
func resample(input []float32, fromRate, toRate int) []float32 {
	if fromRate == toRate {
		return input
	}
	ratio := float64(fromRate) / float64(toRate)
	outLen := int(float64(len(input)) / ratio)
	output := make([]float32, outLen)
	for i := 0; i < outLen; i++ {
		pos := float64(i) * ratio
		idx := int(pos)
		frac := pos - float64(idx)
		if idx+1 < len(input) {
			output[i] = input[idx]*(1.0-float32(frac)) + input[idx+1]*float32(frac)
		} else {
			output[i] = input[idx]
		}
	}
	return output
}

// reflectPad pads the input waveform at both ends by pad samples using reflection.
func reflectPad(x []float32, pad int) []float32 {
	n := len(x)
	padded := make([]float32, n+2*pad)
	copy(padded[pad:], x)
	for i := 0; i < pad; i++ {
		padded[pad-1-i] = x[i+1]
		padded[pad+n+i] = x[n-2-i]
	}
	return padded
}

// hzToMelHTK converts Hertz to Mel scale using HTK formula.
func hzToMelHTK(hz float64) float64 {
	return 2595.0 * math.Log10(1.0+hz/700.0)
}

// melToHzHTK converts Mel scale to Hertz using HTK formula.
func melToHzHTK(mel float64) float64 {
	return 700.0 * (math.Pow(10.0, mel/2595.0) - 1.0)
}

// createMelFilterbank generates the 80-channel Mel filterbank matrix of shape [80][257].
func createMelFilterbank() [][]float64 {
	n_mels := 80
	n_fft := 512
	sr := 16000.0
	fmin := 0.0
	fmax := 8000.0

	mel_min := hzToMelHTK(fmin)
	mel_max := hzToMelHTK(fmax)

	mel_points := make([]float64, n_mels+2)
	for i := 0; i < n_mels+2; i++ {
		mel_points[i] = mel_min + float64(i)*(mel_max-mel_min)/float64(n_mels+1)
	}

	hz_points := make([]float64, n_mels+2)
	for i := 0; i < n_mels+2; i++ {
		hz_points[i] = melToHzHTK(mel_points[i])
	}

	fft_freqs := make([]float64, 1+n_fft/2)
	for i := 0; i < len(fft_freqs); i++ {
		fft_freqs[i] = float64(i) * sr / float64(n_fft)
	}

	weights := make([][]float64, n_mels)
	for i := 0; i < n_mels; i++ {
		weights[i] = make([]float64, 1+n_fft/2)
		f_left := hz_points[i]
		f_center := hz_points[i+1]
		f_right := hz_points[i+2]

		fdiff_left := f_center - f_left
		fdiff_right := f_right - f_center

		for j := 0; j < len(fft_freqs); j++ {
			f_bin := fft_freqs[j]
			lower := (f_bin - f_left) / fdiff_left
			upper := (f_right - f_bin) / fdiff_right

			val := math.Min(lower, upper)
			if val < 0 {
				val = 0
			}
			weights[i][j] = val
		}
	}
	return weights
}

// preprocessFeatures takes a raw waveform and produces a flattened float32 mel spectrogram of shape [1, 80, numFrames]
func preprocessFeatures(waveform []float32, melFilterbank [][]float64, hann []float64) ([]float32, int) {
	paddedWaveform := reflectPad(waveform, 256)
	hopLength := 160
	nFFT := 512
	numFrames := 0
	for t := 0; t*hopLength+nFFT <= len(paddedWaveform); t++ {
		numFrames++
	}

	if numFrames == 0 {
		return nil, 0
	}

	powerSpec := make([][]float64, numFrames)
	for t := 0; t < numFrames; t++ {
		powerSpec[t] = make([]float64, 257)
		frame := make([]complex128, nFFT)
		startIdx := t * hopLength
		for j := 0; j < nFFT; j++ {
			var val float64
			if j >= 56 && j < 456 {
				val = float64(paddedWaveform[startIdx+j]) * hann[j-56]
			}
			frame[j] = complex(val, 0)
		}

		fftOut := fft(frame)

		for b := 0; b < 257; b++ {
			r := real(fftOut[b])
			i := imag(fftOut[b])
			powerSpec[t][b] = r*r + i*i
		}
	}

	numMels := 80
	melEnergies := make([][]float64, numMels)
	for c := 0; c < numMels; c++ {
		melEnergies[c] = make([]float64, numFrames)
		for t := 0; t < numFrames; t++ {
			var sum float64
			for b := 0; b < 257; b++ {
				sum += powerSpec[t][b] * melFilterbank[c][b]
			}
			if sum < 1e-10 {
				sum = 1e-10
			}
			melEnergies[c][t] = math.Log(sum)
		}
	}

	for c := 0; c < numMels; c++ {
		var sum float64
		for t := 0; t < numFrames; t++ {
			sum += melEnergies[c][t]
		}
		mean := sum / float64(numFrames)

		var sqDiffSum float64
		for t := 0; t < numFrames; t++ {
			diff := melEnergies[c][t] - mean
			sqDiffSum += diff * diff
		}
		variance := sqDiffSum / float64(numFrames)
		std := math.Sqrt(variance)

		for t := 0; t < numFrames; t++ {
			melEnergies[c][t] = (melEnergies[c][t] - mean) / (std + 1e-5)
		}
	}

	flatMelFeatures := make([]float32, numMels*numFrames)
	for c := 0; c < numMels; c++ {
		for t := 0; t < numFrames; t++ {
			flatMelFeatures[c*numFrames+t] = float32(melEnergies[c][t])
		}
	}

	return flatMelFeatures, numFrames
}

func initOrReuseSessions() error {
	conformerMutex.Lock()
	defer conformerMutex.Unlock()

	cfg := loadConfig()
	activeModel := cfg.ActiveModel
	if cfg.BilingualRoutingEnabled {
		activeModel = cfg.BilingualConformerModel
	}
	if activeModel == "" || filepath.Ext(activeModel) == ".bin" {
		activeModel = "indicconformer.int8.onnx"
	}

	modelsDir := filepath.Join(getDataDir(cfg), "models")
	modelPath := filepath.Join(modelsDir, activeModel)

	if conformerSession != nil && conformerTokenizer != nil &&
		cachedModelPath == modelPath && cachedEngine == cfg.ProcessingEngine && cachedGPU == cfg.SelectedGPU {
		return nil
	}

	// Clean up old sessions
	if conformerSession != nil {
		conformerSession.Destroy()
		conformerSession = nil
	}
	conformerTokenizer = nil

	fmt.Printf("Initializing new ONNX Conformer session for %s...\n", activeModel)

	// Create session options
	options, err := ort.NewSessionOptions()
	if err != nil {
		return fmt.Errorf("failed to create session options: %w", err)
	}
	defer options.Destroy()

	// Try to enable DirectML for GPU acceleration
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
		[]string{"audio_signal", "length"},
		[]string{"logprobs"},
		options,
	)
	if err != nil {
		return fmt.Errorf("failed to create conformer session: %w", err)
	}

	tokenizerPath := filepath.Join(modelsDir, "tokenizer.model")
	tokenizer, err := sp.NewTokenizer(tokenizerPath)
	if err != nil {
		session.Destroy()
		return fmt.Errorf("failed to load tokenizer: %w", err)
	}

	conformerSession = session
	conformerTokenizer = tokenizer
	cachedModelPath = modelPath
	cachedEngine = cfg.ProcessingEngine
	cachedGPU = cfg.SelectedGPU

	fmt.Println("Successfully initialized and cached ONNX Conformer session.")
	return nil
}

// TranscribeIndicConformer runs the conformer model on the given audio samples.
func TranscribeIndicConformer(samples []float32) (string, error) {
	if err := initOrReuseSessions(); err != nil {
		return "", err
	}

	// 1. Preprocess features in Go
	melFilterbank := createMelFilterbank()
	hann := make([]float64, 400)
	for i := 0; i < 400; i++ {
		hann[i] = 0.5 * (1.0 - math.Cos(2.0*math.Pi*float64(i)/400.0))
	}

	flatMelFeatures, numFrames := preprocessFeatures(samples, melFilterbank, hann)
	if numFrames == 0 {
		return "", fmt.Errorf("audio is too short to process")
	}

	// 2. Run ONNX Inference
	audioShape := ort.NewShape(1, 80, int64(numFrames))
	audioTensor, err := ort.NewTensor(audioShape, flatMelFeatures)
	if err != nil {
		return "", fmt.Errorf("failed to create audio tensor: %w", err)
	}
	defer audioTensor.Destroy()

	lenShape := ort.NewShape(1)
	lenTensor, err := ort.NewTensor(lenShape, []int64{int64(numFrames)})
	if err != nil {
		return "", fmt.Errorf("failed to create len tensor: %w", err)
	}
	defer lenTensor.Destroy()

	outputs := []ort.Value{nil}
	if err := conformerSession.Run([]ort.Value{audioTensor, lenTensor}, outputs); err != nil {
		return "", fmt.Errorf("failed to run inference: %w", err)
	}
	defer outputs[0].Destroy()

	logprobsTensor, ok := outputs[0].(*ort.Tensor[float32])
	if !ok {
		return "", fmt.Errorf("ctc_decoder output is not a float32 tensor")
	}

	outShape := logprobsTensor.GetShape()
	tPrime := int(outShape[1])
	vocabSize := int(outShape[2])
	logprobsData := logprobsTensor.GetData()

	var decodedIDs []int
	var lastID int = -1

	for tIdx := 0; tIdx < tPrime; tIdx++ {
		bestIdx := 0
		bestVal := float32(-1e30)
		offset := tIdx * vocabSize
		for vIdx := 0; vIdx < vocabSize; vIdx++ {
			val := logprobsData[offset+vIdx]
			if val > bestVal {
				bestVal = val
				bestIdx = vIdx
			}
		}

		if bestIdx != lastID {
			if bestIdx != 5632 { // Ignore blank token
				localID := bestIdx - 2560
				decodedIDs = append(decodedIDs, localID)
			}
			lastID = bestIdx
		}
	}

	decodedText, err := conformerTokenizer.Decode(decodedIDs)
	if err != nil {
		return "", fmt.Errorf("failed to decode tokens: %w", err)
	}

	return decodedText, nil
}

// LoadConformerSessions explicitly initializes the conformer model in memory/GPU.
func LoadConformerSessions() error {
	return initOrReuseSessions()
}

// FreeConformerSessions explicitly destroys the conformer session and releases memory/GPU.
func FreeConformerSessions() {
	conformerMutex.Lock()
	defer conformerMutex.Unlock()

	if conformerSession == nil {
		return
	}

	conformerSession.Destroy()
	conformerSession = nil
	conformerTokenizer = nil
	cachedModelPath = ""
	cachedEngine = ""
	cachedGPU = ""
	fmt.Println("Freed ONNX Conformer session from memory/GPU.")
}
