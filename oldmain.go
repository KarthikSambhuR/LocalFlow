package main

/*
#cgo CFLAGS: -I./lib
#cgo LDFLAGS: -L./lib -lwhisper -lggml -lggml-base -lggml-cpu -static -lstdc++ -lgomp -lpthread -lm
#include "whisper.h"
#include <stdlib.h>
*/
import "C"
import (
	"fmt"
	"unsafe"
)

func maion() {
	fmt.Println("🚀 Testing Whisper Link...")

	modelPath := C.CString("dummy.bin")
	defer C.free(unsafe.Pointer(modelPath))

	// Using the new recommended initialization method
	params := C.whisper_context_default_params()
	ctx := C.whisper_init_from_file_with_params(modelPath, params)

	if ctx == nil {
		// If we get here without a "cannot find -lggml" error, the linker SUCCEEDED!
		fmt.Println("✅ SUCCESS: The Go linker found all libraries!")
		fmt.Println("System Info:", C.GoString(C.whisper_print_system_info()))
	} else {
		C.whisper_free(ctx)
	}
}
