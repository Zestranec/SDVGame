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
	"sync"
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

	cfgPath := getEnv("CONFIG_FILE", defaultConfigPath())
	cfg, err := config.Load(cfgPath)
	if err != nil {
		slog.Warn("config_load_failed", "event", "config_load_failed", "path", cfgPath, "err", err)
		cfg = &config.Config{}
	} else {
		slog.Info("config_loaded", "event", "config_loaded", "path", cfgPath)
	}

	methods := map[string]jsonrpc.Handler{
		// ── Runner-compatible methods ─────────────────────────────────────────
		// These allow the frontend (and automated tests) to talk Runner-style
		// JSON-RPC to this backend without a real HyperHive Runner.
		// In production the Runner sits in front and calls game-function /api
		// with the game-function play contract directly.

		"init": func(ctx context.Context, raw json.RawMessage) (any, error) {
			return handleRunnerInit(ctx, raw, cfg)
		},

		"info": func(ctx context.Context, raw json.RawMessage) (any, error) {
			return handleRunnerInfo(ctx, raw)
		},

		// ── play: accept both Runner-style and game-function-style params ─────
		// Runner-style  : {token, state_lock, req:{action,bet,bet_type}}
		// Game-fn style : {token, game, round, req, config, god_data}
		// Detection     : presence of non-empty "state_lock" field.
		"play": func(ctx context.Context, raw json.RawMessage) (any, error) {
			var probe struct {
				StateLock string `json:"state_lock"`
			}
			_ = json.Unmarshal(raw, &probe)

			if probe.StateLock != "" {
				return handleRunnerPlay(ctx, raw, cfg, rngURL, godMode)
			}

			// Legacy game-function format
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
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"ok"}`))
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

// ── Dev runner: in-memory session store ───────────────────────────────────────
// Implements a minimal HyperHive Runner shim so the frontend can use
// Runner JSON-RPC (init / info / play) against this backend directly in dev.
// Production deployments use a real Runner that calls game-function internally.

type devSessionEntry struct {
	Token   string
	Round   *game.Round
	GameMap map[string]any
}

type devStoreType struct {
	mu       sync.Mutex
	sessions map[string]devSessionEntry
	balances map[string]int64
}

var devStore = &devStoreType{
	sessions: make(map[string]devSessionEntry),
	balances: make(map[string]int64),
}

func (s *devStoreType) initSession(lock, token string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.sessions[lock] = devSessionEntry{Token: token, GameMap: map[string]any{}}
}

func (s *devStoreType) getSession(lock string) (devSessionEntry, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	e, ok := s.sessions[lock]
	return e, ok
}

func (s *devStoreType) rotateSession(oldLock, newLock string, round *game.Round, gameMap map[string]any) {
	s.mu.Lock()
	defer s.mu.Unlock()
	entry := s.sessions[oldLock]
	entry.Round   = round
	entry.GameMap = gameMap
	delete(s.sessions, oldLock)
	s.sessions[newLock] = entry
}

func (s *devStoreType) ensureBalance(token string, initial int64) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, exists := s.balances[token]; !exists {
		s.balances[token] = initial
	}
}

func (s *devStoreType) adjustBalance(token string, delta int64) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.balances[token] += delta
}

func (s *devStoreType) getBalance(token string) int64 {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.balances[token]
}

func newStateLock() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// buildSessionConfig resolves currency attributes and bet limits for a token.
func buildSessionConfig(token string, cfg *config.Config) (
	attrs config.CurrencyAttrs, bets []int64, defBet, balance int64, locale string, urls *optionsURLs,
) {
	var sess config.Session
	var ok bool
	if cfg != nil {
		sess, ok = cfg.Sessions[token]
		if !ok {
			for _, s := range cfg.Sessions {
				sess = s
				ok = true
				break
			}
		}
	}
	if ok {
		attrs   = config.CurrencyByCode(sess.Currency)
		sub     := attrs.Subunits
		bets    = multiplyAll(sess.BetLimits, sub)
		defBet  = sess.DefaultBet * sub
		balance = sess.Balance * sub
		locale  = sess.Locale
		if cfg != nil && (cfg.URLs.ReturnURL != "" || cfg.URLs.DepositURL != "" || cfg.URLs.HistoryURL != "") {
			urls = &optionsURLs{
				ReturnURL:  cfg.URLs.ReturnURL,
				DepositURL: cfg.URLs.DepositURL,
				HistoryURL: cfg.URLs.HistoryURL,
			}
		}
	} else {
		attrs   = config.CurrencyByCode("usd")
		bets    = []int64{1000, 2000, 5000, 10000, 20000}
		defBet  = 1000
		balance = 100000
		locale  = "en"
	}
	if locale == "" {
		locale = "en"
	}
	if len(bets) == 0 {
		bets = []int64{defBet}
	}
	return
}

// handleRunnerInit implements JSON-RPC method "init" in Runner format.
func handleRunnerInit(ctx context.Context, raw json.RawMessage, cfg *config.Config) (any, error) {
	var params struct {
		Token string `json:"token"`
	}
	if err := json.Unmarshal(raw, &params); err != nil || params.Token == "" {
		return nil, &game.PlayError{Code: -32602, Message: "init: token required"}
	}

	attrs, bets, defBet, initialBalance, locale, urls := buildSessionConfig(params.Token, cfg)

	lock := newStateLock()
	devStore.initSession(lock, params.Token)
	devStore.ensureBalance(params.Token, initialBalance)

	resp := optionsResponse{
		StateLock:          lock,
		Balance:            devStore.getBalance(params.Token),
		CurrencyAttributes: attrs,
		Config:             optionsConfig{BetLimits: bets, DefaultBet: defBet},
		Locale:             locale,
		URLs:               urls,
		Freebets:           nil,
	}

	slog.InfoContext(ctx, "runner_init",
		"event",    "runner_init",
		"token",    params.Token,
		"currency", attrs.Code,
		"balance",  resp.Balance,
		"lock",     lock[:8]+"…",
	)
	return resp, nil
}

// handleRunnerInfo implements JSON-RPC method "info" in Runner format.
func handleRunnerInfo(_ context.Context, raw json.RawMessage) (any, error) {
	var params struct {
		Token string `json:"token"`
	}
	_ = json.Unmarshal(raw, &params)

	return map[string]any{
		"balance":  devStore.getBalance(params.Token),
		"freebets": nil,
	}, nil
}

// handleRunnerPlay handles Runner-style play calls: {token, state_lock, req:{...}}.
// It looks up the session state, calls game.Play, and returns a Runner-style result.
func handleRunnerPlay(ctx context.Context, raw json.RawMessage, cfg *config.Config, rngURL string, godMode bool) (any, error) {
	var params struct {
		Token     string        `json:"token"`
		StateLock string        `json:"state_lock"`
		Req       game.Req      `json:"req"`
		GodData   *game.GodData `json:"god_data"`
	}
	if err := json.Unmarshal(raw, &params); err != nil {
		return nil, &game.PlayError{Code: -32602, Message: "invalid play params"}
	}

	entry, ok := devStore.getSession(params.StateLock)
	if !ok {
		return nil, &game.PlayError{Code: -32099, Message: "state_lock invalid or expired"}
	}

	token := entry.Token
	if token == "" {
		token = params.Token
	}

	currencyCode := resolveCurrencyCode(ctx, token, cfg)

	gameParams := game.PlayParams{
		Token:   token,
		Game:    entry.GameMap,
		Round:   entry.Round,
		Req:     game.Req{Action: params.Req.Action, Bet: params.Req.Bet, BetType: params.Req.BetType},
		Config:  map[string]any{},
		GodData: params.GodData,
	}

	result, err := game.Play(ctx, gameParams, rngURL, godMode, currencyCode)
	if err != nil {
		return nil, err
	}

	newLock := newStateLock()
	devStore.rotateSession(params.StateLock, newLock, &result.Round, result.Game)

	// Balance accounting:
	//   start  → deduct bet
	//   final  → credit acc (0 for bomb, win amount for cashout/maxwin)
	if params.Req.Action == "start" {
		devStore.adjustBalance(token, -result.Round.BaseBetCents)
	}
	if result.Final {
		devStore.adjustBalance(token, result.Round.AccCents)
	}

	return map[string]any{
		"state_lock": newLock,
		"balance":    devStore.getBalance(token),
		"round":      result.Round,
		"game":       result.Game,
		"resp":       result.Resp,
		"final":      result.Final,
		"finance":    result.Finance,
		"freebets":   nil,
	}, nil
}

// ── Currency resolution ───────────────────────────────────────────────────────

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

// ── /options handler (legacy REST endpoint — kept for tooling / curl tests) ───

type optionsResponse struct {
	StateLock          string               `json:"state_lock"`
	Balance            int64                `json:"balance"`
	CurrencyAttributes config.CurrencyAttrs `json:"currency_attributes"`
	Config             optionsConfig        `json:"config"`
	Locale             string               `json:"locale,omitempty"`
	URLs               *optionsURLs         `json:"urls,omitempty"`
	Freebets           any                  `json:"freebets"`
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

		attrs, bets, defBet, balance, locale, urls := buildSessionConfig(token, cfg)
		fbLimits := []int64{}
		if cfg != nil {
			if sess, ok := cfg.Sessions[token]; ok {
				fbLimits = multiplyAll(sess.FreebetsLimits, attrs.Subunits)
			}
		}

		cfgBlock := optionsConfig{BetLimits: bets, DefaultBet: defBet}
		if len(fbLimits) > 0 {
			cfgBlock.FreebetsLimits = fbLimits
		}

		resp := optionsResponse{
			StateLock:          "disabled",
			Balance:            balance,
			CurrencyAttributes: attrs,
			Config:             cfgBlock,
			Locale:             locale,
			URLs:               urls,
			Freebets:           nil,
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	}
}

func multiplyAll(src []int64, factor int64) []int64 {
	out := make([]int64, len(src))
	for i, v := range src {
		out[i] = v * factor
	}
	return out
}

// ── HTTP middleware ───────────────────────────────────────────────────────────

func loggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		reqID := r.Header.Get("X-Request-ID")
		if reqID == "" {
			b := make([]byte, 12)
			_, _ = rand.Read(b)
			reqID = hex.EncodeToString(b)
		}
		ctx := logx.WithRequestID(r.Context(), reqID)
		r = r.WithContext(ctx)

		rw    := &statusWriter{ResponseWriter: w, status: http.StatusOK}
		start := time.Now()
		next.ServeHTTP(rw, r)

		slog.InfoContext(ctx, "http_request",
			"event",      "http_request",
			"request_id", reqID,
			"method",     r.Method,
			"path",       r.URL.Path,
			"status",     rw.status,
			"latency_ms", time.Since(start).Milliseconds(),
		)
	})
}

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

// ── Helpers ───────────────────────────────────────────────────────────────────

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// defaultConfigPath locates config.yml, trying:
//  1. Same directory as the running binary  (works in Docker with COPY config.yml .)
//  2. Source-tree root                      (works with `go run`)
//  3. Current working directory variants
func defaultConfigPath() string {
	if exe, err := os.Executable(); err == nil {
		c := filepath.Join(filepath.Dir(exe), "config.yml")
		if _, err := os.Stat(c); err == nil {
			return c
		}
	}
	_, file, _, ok := runtime.Caller(0)
	if ok {
		dir := filepath.Dir(filepath.Dir(filepath.Dir(file)))
		c := filepath.Join(dir, "config.yml")
		if _, err := os.Stat(c); err == nil {
			return c
		}
	}
	for _, rel := range []string{"config.yml", "../config.yml", "../../config.yml"} {
		if _, err := os.Stat(rel); err == nil {
			return rel
		}
	}
	return "config.yml"
}
