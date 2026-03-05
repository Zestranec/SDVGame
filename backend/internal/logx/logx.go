// Package logx initialises the application-wide slog.Logger from environment
// variables and provides context helpers for request-ID correlation.
package logx

import (
	"context"
	"log/slog"
	"os"
)

type ctxKey struct{}

// New builds a *slog.Logger from env vars and installs it as the slog default.
//
//	LOG_LEVEL    debug|info|warn|error  (default info)
//	LOG_FORMAT   json|text              (default json)
//	SERVICE_NAME                        (default adhdoom-backend)
//	ENV                                 (default local)
func New() *slog.Logger {
	opts := &slog.HandlerOptions{Level: parseLevel(os.Getenv("LOG_LEVEL"))}

	var h slog.Handler
	if os.Getenv("LOG_FORMAT") == "text" {
		h = slog.NewTextHandler(os.Stdout, opts)
	} else {
		h = slog.NewJSONHandler(os.Stdout, opts)
	}

	logger := slog.New(h).With(
		"service", envOr("SERVICE_NAME", "adhdoom-backend"),
		"env", envOr("ENV", "local"),
	)
	slog.SetDefault(logger)
	return logger
}

// WithRequestID returns a child context carrying id.
func WithRequestID(ctx context.Context, id string) context.Context {
	return context.WithValue(ctx, ctxKey{}, id)
}

// RequestID retrieves the request ID stored by WithRequestID, or "".
func RequestID(ctx context.Context) string {
	id, _ := ctx.Value(ctxKey{}).(string)
	return id
}

func parseLevel(s string) slog.Level {
	switch s {
	case "debug":
		return slog.LevelDebug
	case "warn":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
