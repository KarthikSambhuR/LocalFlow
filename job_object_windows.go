package main

import (
	"fmt"
	"os/exec"
	"sync"
	"syscall"
	"unsafe"
)

// jobObject holds the single Windows Job Object that all llama-server processes
// are assigned to. When the parent process exits for any reason (clean shutdown,
// panic, kill, crash), the OS automatically kills every process in the job because
// JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE is set.
var (
	jobOnce   sync.Once
	jobHandle syscall.Handle
)

const (
	jobObjectExtendedLimitInformation = 9
	jobObjectLimitKillOnJobClose      = 0x00002000
)

type ioCounters struct {
	ReadOperationCount  uint64
	WriteOperationCount uint64
	OtherOperationCount uint64
	ReadTransferCount   uint64
	WriteTransferCount  uint64
	OtherTransferCount  uint64
}

type jobObjectBasicLimitInformation struct {
	PerProcessUserTimeLimit uint64
	PerJobUserTimeLimit     uint64
	LimitFlags              uint32
	MinimumWorkingSetSize   uintptr
	MaximumWorkingSetSize   uintptr
	ActiveProcessLimit      uint32
	Affinity                uintptr
	PriorityClass           uint32
	SchedulingClass         uint32
}

type jobObjectExtendedLimitInfo struct {
	BasicLimitInformation jobObjectBasicLimitInformation
	IoInfo                ioCounters
	ProcessMemoryLimit    uintptr
	JobMemoryLimit        uintptr
	PeakProcessMemoryUsed uintptr
	PeakJobMemoryUsed     uintptr
}

// ensureJobObject creates the global job object once. Subsequent calls are no-ops.
func ensureJobObject() {
	jobOnce.Do(func() {
		k32 := syscall.NewLazyDLL("kernel32.dll")
		procCreateJobObject := k32.NewProc("CreateJobObjectW")
		procSetInfoJobObject := k32.NewProc("SetInformationJobObject")

		h, _, err := procCreateJobObject.Call(0, 0)
		if h == 0 {
			fmt.Println("Warning: failed to create Windows Job Object:", err)
			return
		}
		jobHandle = syscall.Handle(h)

		info := jobObjectExtendedLimitInfo{}
		info.BasicLimitInformation.LimitFlags = jobObjectLimitKillOnJobClose

		ret, _, err := procSetInfoJobObject.Call(
			h,
			jobObjectExtendedLimitInformation,
			uintptr(unsafe.Pointer(&info)),
			unsafe.Sizeof(info),
		)
		if ret == 0 {
			fmt.Println("Warning: failed to set JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE:", err)
		}
	})
}

// assignToJobObject adds the process started by cmd to the global job object.
// Must be called after cmd.Start() and before the process has a chance to create
// children of its own (which is guaranteed here since we call it synchronously).
func assignToJobObject(cmd *exec.Cmd) {
	if cmd == nil || cmd.Process == nil {
		return
	}

	ensureJobObject()
	if jobHandle == 0 {
		return
	}

	k32 := syscall.NewLazyDLL("kernel32.dll")
	procAssignProcessToJobObject := k32.NewProc("AssignProcessToJobObject")

	const processAllAccess = 0x1F0FFF
	handle, err := syscall.OpenProcess(processAllAccess, false, uint32(cmd.Process.Pid))
	if err != nil {
		fmt.Println("Warning: failed to open llama-server process handle:", err)
		return
	}
	defer syscall.CloseHandle(handle)

	ret, _, err := procAssignProcessToJobObject.Call(uintptr(jobHandle), uintptr(handle))
	if ret == 0 {
		fmt.Println("Warning: failed to assign llama-server to job object:", err)
	} else {
		fmt.Println("llama-server assigned to Windows Job Object (will auto-kill on parent exit)")
	}
}
