package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"time"

	"adhd-backend/internal/game"
	"adhd-backend/internal/jsonrpc"
	"adhd-backend/internal/logx"
)

func main() {
	logx.New()

	port := getEnv("PORT", "80")
	rngURL := getEnv("RNG_URL", "http://localhost:4002/api")
	godMode := os.Getenv("ENABLE_GOD_MODE") == "1"

	if godMode {
		slog.Info("god_mode_enabled", "event", "god_mode_enabled")
	}

	methods := map[string]jsonrpc.Handler{
		"play": func(ctx context.Context, raw json.RawMessage) (any, error) {
			var params game.PlayParams
			if err := json.Unmarshal(raw, &params); err != nil {
				return nil, &game.PlayError{Code: -32602, Message: fmt.Sprintf("invalid params: %v", err)}
			}
			return game.Play(ctx, params, rngURL, godMode)
		},
	}

	rpcHandler := jsonrpc.Serve("/api", methods)

	mux := http.NewServeMux()
	mux.Handle("/api", loggingMiddleware(corsMiddleware(rpcHandler)))
	mux.HandleFunc("/health", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})

	addr := ":" + port
	slog.Info("server_starting",
		"event", "server_starting",
		"addr", addr,
		"rng_url", rngURL,
		"god_mode", godMode,
	)
	if err := http.ListenAndServe(addr, mux); err != nil {
		slog.Error("server_fatal", "event", "server_fatal", "err", err)
		os.Exit(1)
	}
}

// loggingMiddleware generates a request_id, injects it into the context,
// captures the response status, and logs one http_request line after the
// handler returns.
func loggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Honour an upstream-supplied ID, otherwise generate one.
		reqID := r.Header.Get("X-Request-ID")
		if reqID == "" {
			b := make([]byte, 12)
			_, _ = rand.Read(b)
			reqID = hex.EncodeToString(b)
		}

		ctx := logx.WithRequestID(r.Context(), reqID)
		r = r.WithContext(ctx)

		rw := &statusWriter{ResponseWriter: w, status: http.StatusOK}
		start := time.Now()

		next.ServeHTTP(rw, r)

		slog.InfoContext(ctx, "http_request",
			"event", "http_request",
			"request_id", reqID,
			"method", r.Method,
			"path", r.URL.Path,
			"status", rw.status,
			"latency_ms", time.Since(start).Milliseconds(),
		)
	})
}

// statusWriter wraps http.ResponseWriter to capture the written status code.
type statusWriter struct {
	http.ResponseWriter
	status int
}

func (sw *statusWriter) WriteHeader(code int) {
	sw.status = code
	sw.ResponseWriter.WriteHeader(code)
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
