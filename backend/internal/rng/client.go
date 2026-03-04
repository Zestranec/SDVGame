// Package rng provides a JSON-RPC client for the HyperHive RNG service.
// It always fetches 2 u32 values per draw to keep consumption stable for replay.
package rng

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
)

// Draw holds two u32 values fetched for a single game draw step.
type Draw struct {
	U1 uint32
	U2 uint32
}

// ToFloat converts a u32 to a float64 in [0, 1).
func ToFloat(u uint32) float64 {
	return float64(u) / 4294967296.0
}

// rpcReq is the outgoing JSON-RPC request to the RNG service.
type rpcReq struct {
	JSONRPC string         `json:"jsonrpc"`
	ID      int            `json:"id"`
	Method  string         `json:"method"`
	Params  map[string]any `json:"params"`
}

// rpcResp is the incoming JSON-RPC response from the RNG service.
// The result field can be either an array of uint32 values or
// a nested object {"values": [...]}.
type rpcResp struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      int             `json:"id"`
	Result  json.RawMessage `json:"result"`
	Error   *struct {
		Code    int    `json:"code"`
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

// Fetch is the HTTP function used to call the RNG service.
// Override in tests to inject mock responses.
var Fetch = func(url string, body []byte) ([]byte, error) {
	resp, err := http.Post(url, "application/json", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	var buf bytes.Buffer
	_, err = buf.ReadFrom(resp.Body)
	return buf.Bytes(), err
}

// FetchDraw requests exactly 2 u32 values from the RNG service at rngURL.
func FetchDraw(rngURL string) (Draw, error) {
	reqBody, err := json.Marshal(rpcReq{
		JSONRPC: "2.0",
		ID:      1,
		Method:  "rand",
		Params:  map[string]any{"type": "u32", "qty": 2},
	})
	if err != nil {
		return Draw{}, err
	}

	respBody, err := Fetch(rngURL, reqBody)
	if err != nil {
		return Draw{}, err
	}

	var rr rpcResp
	if err = json.Unmarshal(respBody, &rr); err != nil {
		return Draw{}, err
	}
	if rr.Error != nil {
		return Draw{}, fmt.Errorf("rng error %d: %s", rr.Error.Code, rr.Error.Message)
	}

	vals, err := parseUint32s(rr.Result)
	if err != nil {
		return Draw{}, err
	}
	if len(vals) < 2 {
		return Draw{}, fmt.Errorf("rng returned %d values, need 2", len(vals))
	}
	return Draw{U1: vals[0], U2: vals[1]}, nil
}

// parseUint32s handles two result shapes:
//   - array: [123, 456]
//   - nested: {"values": [123, 456]}
func parseUint32s(raw json.RawMessage) ([]uint32, error) {
	// Try array first
	var arr []uint32
	if err := json.Unmarshal(raw, &arr); err == nil {
		return arr, nil
	}
	// Try nested object
	var obj struct {
		Values []uint32 `json:"values"`
	}
	if err := json.Unmarshal(raw, &obj); err != nil {
		return nil, fmt.Errorf("unexpected rng result shape: %s", string(raw))
	}
	return obj.Values, nil
}
