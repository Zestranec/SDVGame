// Package rng provides a JSON-RPC client for the HyperHive RNG service.
// It always fetches 2 u32 values per draw to keep consumption stable for replay.
package rng

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"adhd-backend/internal/logx"
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
var Fetch = func(ctx context.Context, url string, body []byte) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	var buf bytes.Buffer
	_, err = buf.ReadFrom(resp.Body)
	return buf.Bytes(), err
}

// FetchDraw requests exactly 2 u32 values from the RNG service at rngURL.
// It logs one structured line per call: event="rng_call_ok" or "rng_call_failed".
func FetchDraw(ctx context.Context, rngURL string) (draw Draw, err error) {
	start := time.Now()

	defer func() {
		latencyMs := time.Since(start).Milliseconds()
		reqID := logx.RequestID(ctx)
		if err != nil {
			slog.ErrorContext(ctx, "rng_call_failed",
				"event", "rng_call_failed",
				"request_id", reqID,
				"rng_url", rngURL,
				"latency_ms", latencyMs,
				"qty", 2,
				"err", err.Error(),
			)
		} else {
			slog.InfoContext(ctx, "rng_call_ok",
				"event", "rng_call_ok",
				"request_id", reqID,
				"rng_url", rngURL,
				"latency_ms", latencyMs,
				"qty", 2,
			)
		}
	}()

	reqBody, err := json.Marshal(rpcReq{
		JSONRPC: "2.0",
		ID:      1,
		Method:  "rand",
		Params:  map[string]any{"type": "u32", "qty": 2},
	})
	if err != nil {
		return Draw{}, err
	}

	respBody, err := Fetch(ctx, rngURL, reqBody)
	if err != nil {
		return Draw{}, err
	}

	var rr rpcResp
	if err = json.Unmarshal(respBody, &rr); err != nil {
		return Draw{}, err
	}
	if rr.Error != nil {
		err = fmt.Errorf("rng error %d: %s", rr.Error.Code, rr.Error.Message)
		return Draw{}, err
	}

	vals, err := parseUint32s(rr.Result)
	if err != nil {
		return Draw{}, err
	}
	if len(vals) < 2 {
		err = fmt.Errorf("rng returned %d values, need 2", len(vals))
		return Draw{}, err
	}
	return Draw{U1: vals[0], U2: vals[1]}, nil
}

// parseUint32s handles two result shapes:
//   - array: [123, 456]
//   - nested: {"values": [123, 456]}
func parseUint32s(raw json.RawMessage) ([]uint32, error) {
	var arr []uint32
	if err := json.Unmarshal(raw, &arr); err == nil {
		return arr, nil
	}
	var obj struct {
		Values []uint32 `json:"values"`
	}
	if err := json.Unmarshal(raw, &obj); err != nil {
		return nil, fmt.Errorf("unexpected rng result shape: %s", string(raw))
	}
	return obj.Values, nil
}
