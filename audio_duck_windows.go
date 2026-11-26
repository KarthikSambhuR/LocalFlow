package main

/*
#cgo LDFLAGS: -lole32
#define COBJMACROS
#include <windows.h>
#include <objbase.h>
#include <mmdeviceapi.h>
#include <endpointvolume.h>

static const GUID lf_CLSID_MMDeviceEnumerator = {0xBCDE0395, 0xE52F, 0x467C, {0x8E, 0x3D, 0xC4, 0x57, 0x92, 0x91, 0x69, 0x2E}};
static const GUID lf_IID_IMMDeviceEnumerator  = {0xA95664D2, 0x9614, 0x4F35, {0xA7, 0x46, 0xDE, 0x8D, 0xB6, 0x36, 0x17, 0xE6}};
static const GUID lf_IID_IAudioEndpointVolume = {0x5CDF2C82, 0x841E, 0x4546, {0x97, 0x22, 0x0C, 0xF7, 0x40, 0x78, 0x22, 0x9A}};

static HRESULT lf_get_endpoint_volume(IAudioEndpointVolume **outVol, BOOL *didCoInit) {
	*outVol = NULL;
	*didCoInit = FALSE;

	HRESULT hrInit = CoInitializeEx(NULL, COINIT_MULTITHREADED);
	if (hrInit == S_OK || hrInit == S_FALSE) {
		*didCoInit = TRUE;
	} else if (hrInit != RPC_E_CHANGED_MODE) {
		return hrInit;
	}

	IMMDeviceEnumerator *pEnum = NULL;
	HRESULT hr = CoCreateInstance(
		&lf_CLSID_MMDeviceEnumerator,
		NULL,
		CLSCTX_ALL,
		&lf_IID_IMMDeviceEnumerator,
		(void **)&pEnum
	);
	if (FAILED(hr) || !pEnum) {
		if (*didCoInit) CoUninitialize();
		*didCoInit = FALSE;
		return hr;
	}

	IMMDevice *pDev = NULL;
	hr = IMMDeviceEnumerator_GetDefaultAudioEndpoint(pEnum, eRender, eConsole, &pDev);
	IMMDeviceEnumerator_Release(pEnum);
	if (FAILED(hr) || !pDev) {
		if (*didCoInit) CoUninitialize();
		*didCoInit = FALSE;
		return hr;
	}

	IAudioEndpointVolume *pVol = NULL;
	hr = IMMDevice_Activate(pDev, &lf_IID_IAudioEndpointVolume, CLSCTX_ALL, NULL, (void **)&pVol);
	IMMDevice_Release(pDev);
	if (FAILED(hr) || !pVol) {
		if (*didCoInit) CoUninitialize();
		*didCoInit = FALSE;
		return hr;
	}

	*outVol = pVol;
	return S_OK;
}

static int lf_get_master_volume(float *outLevel) {
	IAudioEndpointVolume *pVol = NULL;
	BOOL didCoInit = FALSE;
	HRESULT hr = lf_get_endpoint_volume(&pVol, &didCoInit);
	if (FAILED(hr)) {
		return (int)hr;
	}
	hr = IAudioEndpointVolume_GetMasterVolumeLevelScalar(pVol, outLevel);
	IAudioEndpointVolume_Release(pVol);
	if (didCoInit) CoUninitialize();
	return (int)hr;
}

static int lf_set_master_volume(float level) {
	IAudioEndpointVolume *pVol = NULL;
	BOOL didCoInit = FALSE;
	HRESULT hr = lf_get_endpoint_volume(&pVol, &didCoInit);
	if (FAILED(hr)) {
		return (int)hr;
	}
	hr = IAudioEndpointVolume_SetMasterVolumeLevelScalar(pVol, level, NULL);
	IAudioEndpointVolume_Release(pVol);
	if (didCoInit) CoUninitialize();
	return (int)hr;
}
*/
import "C"
import "fmt"

// getSystemMasterVolume returns the Windows default render endpoint master volume in [0.0, 1.0].
func getSystemMasterVolume() (float32, error) {
	var level C.float
	if hr := C.lf_get_master_volume(&level); hr < 0 {
		return 0, fmt.Errorf("GetMasterVolumeLevelScalar failed: 0x%08x", uint32(hr))
	}
	return float32(level), nil
}

// setSystemMasterVolume sets the Windows default render endpoint master volume in [0.0, 1.0].
func setSystemMasterVolume(level float32) error {
	if level < 0 {
		level = 0
	} else if level > 1 {
		level = 1
	}
	if hr := C.lf_set_master_volume(C.float(level)); hr < 0 {
		return fmt.Errorf("SetMasterVolumeLevelScalar failed: 0x%08x", uint32(hr))
	}
	return nil
}
