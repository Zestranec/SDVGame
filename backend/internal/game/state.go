package game

import "encoding/json"

// Round holds the mutable per-round state passed back and forth
// between the runner and the backend. All money is in integer subunits (cents).
type Round struct {
	BaseBetCents int64   `json:"base_bet_cents"`
	AccCents     int64   `json:"acc_cents"`
	Step         int     `json:"step"`
	Alive        bool    `json:"alive"`
	MaxReached   bool    `json:"max_reached"`
	EndedBy      *string `json:"ended_by"`
	GodCursor    int     `json:"god_cursor,omitempty"`
}

// FinanceEvent is the finance record emitted in the Runner-compatible format.
// Type is "bet" (negative debit on start) or "win" (positive credit on cashout/maxwin).
// Amount is in integer subunits (cents); negative for bet, positive for win.
type FinanceEvent struct {
	Type   string `json:"type"`
	Amount int64  `json:"amount"`
}

// Resp is the per-step response object returned in "resp".
// AppliedMultBP is the multiplier in basis points (10000 = 1.0000×); nil for bomb/cashout.
// AppliedMultDisplay is a human-friendly 2-decimal string (e.g. "1.15", "10.00"); nil for bomb/cashout.
type Resp struct {
	Action             string  `json:"action"`
	Step               int     `json:"step"`
	Outcome            *string `json:"outcome"`
	AppliedMultBP      *int    `json:"applied_mult_bp"`
	AppliedMultDisplay *string `json:"applied_mult_display"`
	AccCents           int64   `json:"acc_cents"`
	ContentID          *string `json:"content_id"`
	EndedBy            *string `json:"ended_by"`
	MaxReached         bool    `json:"max_reached"`
}

// PlayResult is the full result returned inside the JSON-RPC response.
type PlayResult struct {
	Final   bool              `json:"final"`
	Finance []json.RawMessage `json:"finance"`
	Game    map[string]any    `json:"game"`
	Round   Round             `json:"round"`
	Resp    Resp              `json:"resp"`
}
