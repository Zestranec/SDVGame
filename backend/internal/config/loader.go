// Package config loads and exposes the backend configuration from config.yml.
package config

import (
	"os"

	"gopkg.in/yaml.v3"
)

// ── YAML schema ───────────────────────────────────────────────────────────────

// Session holds per-token settings read from config.yml sessions.<token>.
// Monetary amounts (bet_limits, default_bet, balance, freebets_limits) are in
// "whole display units" (e.g. dollars for USD) — the /options handler converts
// them to integer subunits before responding.
type Session struct {
	State          string  `yaml:"state"`
	Currency       string  `yaml:"currency"`   // lowercase code: "usd", "eur", "btc"
	Locale         string  `yaml:"locale"`
	BetLimits      []int64 `yaml:"bet_limits"`
	FreebetsLimits []int64 `yaml:"freebets_limits"`
	DefaultBet     int64   `yaml:"default_bet"`
	Balance        int64   `yaml:"balance"`
	RTP            float64 `yaml:"rtp"`
}

// URLs holds redirect URLs exposed to the frontend.
type URLs struct {
	ReturnURL  string `yaml:"return_url"`
	DepositURL string `yaml:"deposit_url"`
	HistoryURL string `yaml:"history_url"`
}

// Config is the top-level structure for config.yml.
type Config struct {
	Game struct {
		Code string `yaml:"code"`
	} `yaml:"game"`
	Backend struct {
		URL string `yaml:"url"`
	} `yaml:"backend"`
	RNG struct {
		URL string `yaml:"url"`
	} `yaml:"rng"`
	Sessions map[string]Session `yaml:"sessions"`
	URLs     URLs               `yaml:"urls"`
}

// Load reads and parses the YAML file at path.
func Load(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var cfg Config
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, err
	}
	return &cfg, nil
}

// ── Currency catalogue ────────────────────────────────────────────────────────

// CurrencyAttrs holds the display attributes for a currency.
type CurrencyAttrs struct {
	Code     string `json:"code"`
	Symbol   string `json:"symbol,omitempty"`
	Subunits int64  `json:"subunits"`
	Exponent int    `json:"exponent"`
}

// CurrencyByCode returns well-known attributes for lowercase currency codes.
// Falls back to a generic 2-decimal entry for unknown codes.
func CurrencyByCode(code string) CurrencyAttrs {
	switch code {
	case "usd":
		return CurrencyAttrs{Code: "USD", Symbol: "$", Subunits: 100, Exponent: 2}
	case "eur":
		return CurrencyAttrs{Code: "EUR", Symbol: "€", Subunits: 100, Exponent: 2}
	case "gbp":
		return CurrencyAttrs{Code: "GBP", Symbol: "£", Subunits: 100, Exponent: 2}
	case "btc":
		return CurrencyAttrs{Code: "BTC", Symbol: "₿", Subunits: 100_000_000, Exponent: 8}
	case "mbtc":
		return CurrencyAttrs{Code: "mBTC", Symbol: "m₿", Subunits: 100_000, Exponent: 5}
	case "usdt":
		return CurrencyAttrs{Code: "USDT", Symbol: "₮", Subunits: 100, Exponent: 2}
	case "usdc":
		return CurrencyAttrs{Code: "USDC", Subunits: 100, Exponent: 2}
	default:
		// Generic fallback: uppercase the code, 2 decimals, subunits=100
		upper := make([]byte, len(code))
		for i := range code {
			c := code[i]
			if c >= 'a' && c <= 'z' {
				c -= 32
			}
			upper[i] = c
		}
		return CurrencyAttrs{Code: string(upper), Subunits: 100, Exponent: 2}
	}
}
