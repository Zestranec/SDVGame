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
	"path/filepath"
	"runtime"
	"time"

	"adhd-backend/internal/config"
	"adhd-backend/internal/game"
	"adhd-backend/internal/jsonrpc"
	"adhd-backend/internal/logx"
)

func main() {
	logx.New()

	port    := getEnv("PORT", "80")
	rngURL  := getEnv("RNG_URL", "http://localhost:4002/api")
	godMode := os.Getenv("ENABLE_GOD_MODE") == "1"

	if godMode {
		slog.Info("god_mode_enabled", "event", "god_mode_enabled")
	}

	// Load config.yml (config file is in the repo root /backend directory).
	cfgPath := getEnv("CONFIG_FILE", defaultConfigPath())
	cfg, err := config.Load(cfgPath)
	if err != nil {
		slog.Warn("config_load_failed", "event", "config_load_failed", "path", cfgPath, "err", err)
		cfg = &config.Config{} // continue without config; /options will return defaults
	} else {
		slog.Info("config_loaded", "event", "config_loaded", "path", cfgPath)
	}

	methods := map[string]jsonrpc.Handler{
		"play": func(ctx context.Context, raw json.RawMessage) (any, error) {
			var params game.PlayParams
			if err := json.Unmarshal(raw, &params); err != nil {
				return nil, &game.PlayError{Code: -32602, Message: fmt.Sprintf("invalid params: %v", err)}
			}
			currencyCode := resolveCurrencyCode(ctx, params.Token, cfg)
			return game.Play(ctx, params, rngURL, godMode, currencyCode)
		},
	}

	rpcHandler := jsonrpc.Serve("/api", methods)

	mux := http.NewServeMux()
	mux.Handle("/api",     loggingMiddleware(corsMiddleware(rpcHandler)))
	mux.Handle("/options", loggingMiddleware(corsMiddleware(http.HandlerFunc(makeOptionsHandler(cfg)))))
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

// ── Currency resolution ───────────────────────────────────────────────────────

// resolveCurrencyCode returns the ISO currency code for the given token by
// looking up the session config.  Falls back to "USD" and logs a warning when
// the token is missing or not found — so the game stays functional even in
// environments where the config is incomplete.
func resolveCurrencyCode(ctx context.Context, token string, cfg *config.Config) string {
	if token != "" && cfg != nil {
		if sess, ok := cfg.Sessions[token]; ok {
			if attrs := config.CurrencyByCode(sess.Currency); attrs.Code != "" {
				return attrs.Code
			}
		}
		slog.WarnContext(ctx, "play_unknown_token",
			"event", "play_unknown_token",
			"token", token,
		)
	}
	return "USD"
}

// ── /options handler ──────────────────────────────────────────────────────────

// optionsResponse mirrors the RunnerInitResult shape the frontend expects,
// so that gameOptions.populateFromInit() works without modification.
type optionsResponse struct {
	StateLock          string              `json:"state_lock"`
	Balance            int64               `json:"balance"`
	CurrencyAttributes config.CurrencyAttrs `json:"currency_attributes"`
	Config             optionsConfig        `json:"config"`
	Locale             string              `json:"locale,omitempty"`
	URLs               *optionsURLs        `json:"urls,omitempty"`
	Freebets           any                 `json:"freebets"` // null | object
}

type optionsConfig struct {
	BetLimits      []int64 `json:"bet_limits"`
	FreebetsLimits []int64 `json:"freebets_limits,omitempty"`
	DefaultBet     int64   `json:"default_bet"`
}

type optionsURLs struct {
	ReturnURL  string `json:"return_url,omitempty"`
	DepositURL string `json:"deposit_url,omitempty"`
	HistoryURL string `json:"history_url,omitempty"`
}

func makeOptionsHandler(cfg *config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		token := r.URL.Query().Get("token")
		if token == "" {
			http.Error(w, `{"error":"missing token"}`, http.StatusBadRequest)
			return
		}

		// Look up session; fall back to built-in defaults when not found.
		sess, ok := cfg.Sessions[token]
		if !ok {
			slog.Warn("options_unknown_token",
				"event", "options_unknown_token",
				"token", token,
			)
			// Use first session if any, otherwise built-in defaults.
			for _, s := range cfg.Sessions {
				sess = s
				ok = true
				break
			}
		}

		var attrs config.CurrencyAttrs
		var betLimits []int64
		var defaultBet int64
		var balance int64
		var locale string
		var fbLimits []int64

		if ok {
			attrs      = config.CurrencyByCode(sess.Currency)
			locale     = sess.Locale
			// Convert whole-unit amounts to subunits (e.g. $10 → 1000 cents for USD).
			sub := attrs.Subunits
			betLimits  = multiplyAll(sess.BetLimits, sub)
			defaultBet = sess.DefaultBet * sub
			balance    = sess.Balance * sub
			fbLimits   = multiplyAll(sess.FreebetsLimits, sub)
		} else {
			// Hard-coded fallback so dev works even without config.yml.
			attrs      = config.CurrencyByCode("usd")
			locale     = "en"
			betLimits  = []int64{1000, 2000, 5000, 10000, 20000}
			defaultBet = 1000
			balance    = 100000
		}

		if locale == "" {
			locale = "en"
		}
		if len(betLimits) == 0 {
			betLimits = []int64{defaultBet}
		}

		urls := &optionsURLs{
			ReturnURL:  cfg.URLs.ReturnURL,
			DepositURL: cfg.URLs.DepositURL,
			HistoryURL: cfg.URLs.HistoryURL,
		}
		if urls.ReturnURL == "" && urls.DepositURL == "" && urls.HistoryURL == "" {
			urls = nil
		}

		cfgBlock := optionsConfig{
			BetLimits:  betLimits,
			DefaultBet: defaultBet,
		}
		if len(fbLimits) > 0 {
			cfgBlock.FreebetsLimits = fbLimits
		}

		resp := optionsResponse{
			StateLock:          "disabled", // frontend ignores this for play routing
			Balance:            balance,
			CurrencyAttributes: attrs,
			Config:             cfgBlock,
			Locale:             locale,
			URLs:               urls,
			Freebets:           nil,
		}

		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(resp); err != nil {
			slog.Error("options_encode_err", "event", "options_encode_err", "err", err)
		}
	}
}

// multiplyAll multiplies every element of src by factor.
func multiplyAll(src []int64, factor int64) []int64 {
	out := make([]int64, len(src))
	for i, v := range src {
		out[i] = v * factor
	}
	return out
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
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
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

// defaultConfigPath returns the path to config.yml relative to this binary's
// source file (works for both `go run` and compiled binaries placed alongside config).
func defaultConfigPath() string {
	// Walk up from the source file to find config.yml in the backend root.
	_, file, _, ok := runtime.Caller(0)
	if ok {
		// file = .../backend/cmd/server/main.go  → go up two levels
		dir := filepath.Dir(filepath.Dir(filepath.Dir(file)))
		candidate := filepath.Join(dir, "config.yml")
		if _, err := os.Stat(candidate); err == nil {
			return candidate
		}
	}
	// Fallback: look in the current working directory and parent.
	for _, rel := range []string{"config.yml", "../config.yml", "../../config.yml"} {
		if _, err := os.Stat(rel); err == nil {
			return rel
		}
	}
	return "config.yml"
}
