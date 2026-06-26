package main

import (
	"fmt"
	"io"
	"math"
	"math/cmplx"
	"net/http"
	"os"
	"path/filepath"
	"time"

	sp "github.com/tggo/goSentencePiece"
	ort "github.com/yalue/onnxruntime_go"
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

func downloadFile(url, filepath string) error {
	out, err := os.Create(filepath)
	if err != nil {
		return err
	}
	defer out.Close()

	resp, err := http.Get(url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	_, err = io.Copy(out, resp.Body)
	return err
}

func benchmarkModel(modelName, modelPath, tokenizerPath string, dummyWaveform []float32) {
	fmt.Printf("\n=======================================================\n")
	fmt.Printf("BENCHMARKING MODEL: %s\n", modelName)
	fmt.Printf("=======================================================\n")

	fmt.Println("Measuring model load time...")
	startLoad := time.Now()

	options, err := ort.NewSessionOptions()
	if err != nil {
		fmt.Printf("Options error: %v\n", err)
		return
	}
	defer options.Destroy()

	session, err := ort.NewDynamicAdvancedSession(
		modelPath,
		[]string{"audio_signal", "length"},
		[]string{"logprobs"},
		options,
	)
	if err != nil {
		fmt.Printf("Session load error: %v\n", err)
		return
	}
	defer session.Destroy()

	tokenizer, err := sp.NewTokenizer(tokenizerPath)
	if err != nil {
		fmt.Printf("Tokenizer load error: %v\n", err)
		return
	}

	loadDuration := time.Since(startLoad)
	fmt.Printf("Model and Tokenizer loaded in: %v\n", loadDuration)

	// Preprocess
	melFilterbank := createMelFilterbank()
	hann := make([]float64, 400)
	for i := 0; i < 400; i++ {
		hann[i] = 0.5 * (1.0 - math.Cos(2.0*math.Pi*float64(i)/400.0))
	}

	flatMelFeatures, numFrames := preprocessFeatures(dummyWaveform, melFilterbank, hann)

	runInference := func() error {
		audioShape := ort.NewShape(1, 80, int64(numFrames))
		audioTensor, err := ort.NewTensor(audioShape, flatMelFeatures)
		if err != nil {
			return err
		}
		defer audioTensor.Destroy()

		lenShape := ort.NewShape(1)
		lenTensor, err := ort.NewTensor(lenShape, []int64{int64(numFrames)})
		if err != nil {
			return err
		}
		defer lenTensor.Destroy()

		outputs := []ort.Value{nil}
		if err := session.Run([]ort.Value{audioTensor, lenTensor}, outputs); err != nil {
			return err
		}
		defer outputs[0].Destroy()

		logprobsTensor, ok := outputs[0].(*ort.Tensor[float32])
		if !ok {
			return fmt.Errorf("not a float32 tensor")
		}

		logprobsData := logprobsTensor.GetData()
		outShape := logprobsTensor.GetShape()
		tPrime := int(outShape[1])
		vocabSize := int(outShape[2])

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
				if bestIdx != 5632 {
					localID := bestIdx - 2560
					decodedIDs = append(decodedIDs, localID)
				}
				lastID = bestIdx
			}
		}

		_, err = tokenizer.Decode(decodedIDs)
		return err
	}

	fmt.Println("Running warm-up inference...")
	if err := runInference(); err != nil {
		fmt.Printf("Warmup failed: %v\n", err)
		return
	}
	fmt.Println("Warm-up complete.")

	runs := 3
	var totalInferenceDuration time.Duration
	for i := 1; i <= runs; i++ {
		startInf := time.Now()
		if err := runInference(); err != nil {
			fmt.Printf("Run %d failed: %v\n", i, err)
			return
		}
		duration := time.Since(startInf)
		fmt.Printf("Run %d: %v\n", i, duration)
		totalInferenceDuration += duration
	}

	avgDuration := totalInferenceDuration / time.Duration(runs)
	rtf := avgDuration.Seconds() / 10.0

	fmt.Println("\n--- Results ---")
	fmt.Printf("Load Time: %v\n", loadDuration)
	fmt.Printf("Average Inference Time: %v\n", avgDuration)
	fmt.Printf("Realtime Factor (RTF): %.4f\n", rtf)
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

	modelsDir := filepath.Join("build", "New Folder", "models")
	_ = os.MkdirAll(modelsDir, 0755)

	tokenizerPath := filepath.Join(modelsDir, "tokenizer.model")
	if _, err := os.Stat(tokenizerPath); err != nil {
		fmt.Println("Downloading tokenizer.model...")
		err = downloadFile("https://huggingface.co/KarthikSambhuR/indicconformer_stt_ml_hybrid_rnnt_large/resolve/main/tokenizer.model?download=true", tokenizerPath)
		if err != nil {
			fmt.Printf("Failed to download tokenizer: %v\n", err)
			return
		}
	}

	int8Path := filepath.Join(modelsDir, "model.int8.onnx")
	if _, err := os.Stat(int8Path); err != nil {
		fmt.Println("Downloading model.int8.onnx...")
		err = downloadFile("https://huggingface.co/KarthikSambhuR/indicconformer_stt_ml_hybrid_rnnt_large/resolve/main/model.int8.onnx?download=true", int8Path)
		if err != nil {
			fmt.Printf("Failed to download int8 model: %v\n", err)
			return
		}
	}

	fp32Path := filepath.Join(modelsDir, "model.fp32.onnx")
	if _, err := os.Stat(fp32Path); err != nil {
		fmt.Println("Downloading model.fp32.onnx...")
		err = downloadFile("https://huggingface.co/KarthikSambhuR/indicconformer_stt_ml_hybrid_rnnt_large/resolve/main/model.fp32.onnx?download=true", fp32Path)
		if err != nil {
			fmt.Printf("Failed to download fp32 model: %v\n", err)
			return
		}
	}

	// Create dummy audio: 16 kHz sample rate, 10 seconds = 160,000 samples
	audioDurationSec := 10.0
	sampleRate := 16000
	numSamples := int(audioDurationSec * float64(sampleRate))
	dummyWaveform := make([]float32, numSamples)
	for i := 0; i < numSamples; i++ {
		dummyWaveform[i] = float32(math.Sin(2.0 * math.Pi * 440.0 * float64(i) / float64(sampleRate)))
	}

	benchmarkModel("120M INT8 Conformer", int8Path, tokenizerPath, dummyWaveform)
	benchmarkModel("120M FP32 Conformer", fp32Path, tokenizerPath, dummyWaveform)
}
