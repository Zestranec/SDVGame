package game

import "encoding/json"

// Round holds the mutable per-round state passed back and forth
// between the runner and the backend.
type Round struct {
	BaseBet    float64  `json:"base_bet"`
	Acc        float64  `json:"acc"`
	Step       int      `json:"step"`
	Alive      bool     `json:"alive"`
	MaxReached bool     `json:"max_reached"`
	EndedBy    *string  `json:"ended_by"`
	GodCursor  int      `json:"god_cursor,omitempty"`
}

// FinanceBetting is the finance record emitted on "start".
type FinanceBetting struct {
	Type    string  `json:"type"`
	Bet     float64 `json:"bet"`
	Base    float64 `json:"base"`
	BetType string  `json:"bet_type"`
}

// FinancePayout is the finance record emitted on cashout / maxwin.
type FinancePayout struct {
	Type     string  `json:"type"`
	Amount   float64 `json:"amount"`
	Currency string  `json:"currency"`
}

// Resp is the per-step response object returned in "resp".
type Resp struct {
	Action      string   `json:"action"`
	Step        int      `json:"step"`
	Outcome     *string  `json:"outcome"`
	AppliedMult *float64 `json:"applied_mult"`
	Acc         float64  `json:"acc"`
	ContentID   *string  `json:"content_id"`
	EndedBy     *string  `json:"ended_by"`
	MaxReached  bool     `json:"max_reached"`
}

// PlayResult is the full result returned inside the JSON-RPC response.
type PlayResult struct {
	Final   bool              `json:"final"`
	Finance []json.RawMessage `json:"finance"`
	Game    map[string]any    `json:"game"`
	Round   Round             `json:"round"`
	Resp    Resp              `json:"resp"`
}
