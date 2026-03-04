// Package jsonrpc provides a minimal JSON-RPC 2.0 request/response handler.
package jsonrpc

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
)

// Request is an incoming JSON-RPC 2.0 call.
type Request struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params"`
}

// response is the outgoing JSON-RPC 2.0 envelope.
type response struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id"`
	Result  any             `json:"result,omitempty"`
	Error   *rpcError       `json:"error,omitempty"`
}

type rpcError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

// Handler is a function that processes a decoded params payload and returns a result.
type Handler func(params json.RawMessage) (any, error)

// Serve registers a single JSON-RPC 2.0 handler on path and serves HTTP.
// Only the method named "play" is expected; other methods return a -32601 error.
func Serve(path string, methods map[string]Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != path {
			http.NotFound(w, r)
			return
		}
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		body, err := io.ReadAll(r.Body)
		if err != nil {
			writeError(w, nil, -32700, "parse error")
			return
		}

		var req Request
		if err = json.Unmarshal(body, &req); err != nil {
			writeError(w, nil, -32700, fmt.Sprintf("parse error: %v", err))
			return
		}

		handler, ok := methods[req.Method]
		if !ok {
			writeError(w, req.ID, -32601, fmt.Sprintf("method not found: %q", req.Method))
			return
		}

		result, err := handler(req.Params)
		if err != nil {
			// Check if this is a structured error with a JSON-RPC code.
			if pe, ok2 := err.(interface {
				Error() string
				GetCode() int
			}); ok2 {
				writeError(w, req.ID, pe.GetCode(), pe.Error())
				return
			}
			writeError(w, req.ID, -32603, err.Error())
			return
		}

		writeResult(w, req.ID, result)
	})
}

func writeResult(w http.ResponseWriter, id json.RawMessage, result any) {
	write(w, response{JSONRPC: "2.0", ID: id, Result: result})
}

func writeError(w http.ResponseWriter, id json.RawMessage, code int, message string) {
	if id == nil {
		id = json.RawMessage(`null`)
	}
	write(w, response{JSONRPC: "2.0", ID: id, Error: &rpcError{Code: code, Message: message}})
}

func write(w http.ResponseWriter, r response) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(r)
}
