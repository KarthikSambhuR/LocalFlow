package main

import (
	_ "embed"
	"errors"
)

//go:embed payload.zip
var payloadZip []byte

func GetPayloadZip() ([]byte, error) {
	if len(payloadZip) == 0 {
		return nil, errors.New("empty payload zip file")
	}
	return payloadZip, nil
}
