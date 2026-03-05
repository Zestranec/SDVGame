// Package jsonrpc provides a minimal JSON-RPC 2.0 request/response handler.
package jsonrpc

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"

	"adhd-backend/internal/logx"
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
// ctx carries the request context, including the request ID set by the logging middleware.
type Handler func(ctx context.Context, params json.RawMessage) (any, error)

// Serve registers a single JSON-RPC 2.0 handler on path and serves HTTP.
func Serve(path string, methods map[string]Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()

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
			logRPCError(ctx, -32700, "parse error")
			writeError(w, nil, -32700, "parse error")
			return
		}

		var req Request
		if err = json.Unmarshal(body, &req); err != nil {
			reason := fmt.Sprintf("parse error: %v", err)
			logRPCError(ctx, -32700, reason)
			writeError(w, nil, -32700, reason)
			return
		}

		handler, ok := methods[req.Method]
		if !ok {
			reason := fmt.Sprintf("method not found: %q", req.Method)
			logRPCError(ctx, -32601, reason)
			writeError(w, req.ID, -32601, reason)
			return
		}

		result, err := handler(ctx, req.Params)
		if err != nil {
			logRPCError(ctx, 0, err.Error())
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

func logRPCError(ctx context.Context, code int, reason string) {
	slog.WarnContext(ctx, "rpc_error",
		"event", "rpc_error",
		"request_id", logx.RequestID(ctx),
		"code", code,
		"reason", reason,
	)
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
