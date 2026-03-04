package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"

	"adhd-backend/internal/game"
	"adhd-backend/internal/jsonrpc"
)

func main() {
	port := getEnv("PORT", "80")
	rngURL := getEnv("RNG_URL", "http://localhost:4002/api")
	godMode := os.Getenv("ENABLE_GOD_MODE") == "1"

	if godMode {
		log.Println("[ADHDoom] GOD MODE ENABLED")
	}

	methods := map[string]jsonrpc.Handler{
		"play": func(raw json.RawMessage) (any, error) {
			var params game.PlayParams
			if err := json.Unmarshal(raw, &params); err != nil {
				return nil, &game.PlayError{Code: -32602, Message: fmt.Sprintf("invalid params: %v", err)}
			}
			return game.Play(params, rngURL, godMode)
		},
	}

	handler := jsonrpc.Serve("/api", methods)

	// Add CORS headers for local development / runner
	mux := http.NewServeMux()
	mux.Handle("/api", corsMiddleware(handler))
	mux.HandleFunc("/health", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})

	addr := ":" + port
	log.Printf("[ADHDoom] listening on %s  rng=%s  godMode=%v", addr, rngURL, godMode)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatal(err)
	}
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
