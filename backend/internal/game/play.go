package game

import (
	"encoding/json"
	"fmt"

	"adhd-backend/internal/rng"
)

// ── Request types ────────────────────────────────────────────────────────────

// GodEntry overrides one draw step when god mode is enabled.
type GodEntry struct {
	U1 *uint32 `json:"u1"`
	U2 *uint32 `json:"u2"`
}

// GodData carries the optional god-mode override list.
type GodData struct {
	Random []GodEntry `json:"random"`
}

// Req is the per-play action request from the runner.
type Req struct {
	Action  string  `json:"action"`
	Bet     float64 `json:"bet"`
	BetType string  `json:"bet_type"`
}

// PlayParams are the full params block sent by the runner.
type PlayParams struct {
	Game    map[string]any  `json:"game"`
	Round   *Round          `json:"round"`
	Req     Req             `json:"req"`
	Config  map[string]any  `json:"config"`
	GodData *GodData        `json:"god_data"`
}

// ── Errors ───────────────────────────────────────────────────────────────────

// PlayError is a JSON-RPC application-level error.
type PlayError struct {
	Code    int
	Message string
}

func (e *PlayError) Error() string   { return e.Message }
func (e *PlayError) GetCode() int    { return e.Code }

// ── Play entry point ─────────────────────────────────────────────────────────

// Play processes one runner call and returns a PlayResult or a PlayError.
func Play(params PlayParams, rngURL string, godModeEnabled bool) (PlayResult, error) {
	switch params.Req.Action {
	case "start":
		return handleStart(params, rngURL, godModeEnabled)
	case "swipe":
		return handleSwipe(params, rngURL, godModeEnabled)
	case "cashout":
		return handleCashout(params)
	default:
		return PlayResult{}, &PlayError{Code: -32602, Message: fmt.Sprintf("unknown action: %q", params.Req.Action)}
	}
}

// ── Handlers ─────────────────────────────────────────────────────────────────

func handleStart(params PlayParams, rngURL string, godModeEnabled bool) (PlayResult, error) {
	bet := params.Req.Bet
	betType := params.Req.BetType
	if betType == "" {
		betType = "bet"
	}

	round := Round{
		BaseBet:    bet,
		Acc:        bet * HouseEdge,
		Step:       0,
		Alive:      true,
		MaxReached: false,
		EndedBy:    nil,
	}

	// Emit betting finance record
	bettingRaw, _ := json.Marshal(FinanceBetting{
		Type:    "betting",
		Bet:     -bet,
		Base:    bet,
		BetType: betType,
	})

	// Perform the first draw
	draw, err := getRNG(rngURL, params.GodData, round.GodCursor, godModeEnabled)
	if err != nil {
		return PlayResult{}, err
	}
	if godModeEnabled {
		round.GodCursor++
	}

	outcome, mult, contentID, final, endedBy := performDraw(draw, &round)

	resp := Resp{
		Action:      "start",
		Step:        0,
		Outcome:     strPtr(outcome),
		AppliedMult: &mult,
		Acc:         round.Acc,
		ContentID:   strPtr(contentID),
		EndedBy:     endedBy,
		MaxReached:  round.MaxReached,
	}

	var finance []json.RawMessage
	finance = append(finance, bettingRaw)

	// If maxwin hit on very first draw, emit payout immediately
	if final && round.MaxReached {
		payoutRaw, _ := json.Marshal(FinancePayout{Type: "payout", Amount: round.Acc, Currency: "FUN"})
		finance = append(finance, payoutRaw)
	}

	return PlayResult{
		Final:   final,
		Finance: finance,
		Game:    map[string]any{},
		Round:   round,
		Resp:    resp,
	}, nil
}

func handleSwipe(params PlayParams, rngURL string, godModeEnabled bool) (PlayResult, error) {
	if params.Round == nil {
		return PlayResult{}, &PlayError{Code: -32602, Message: "round state is required for swipe"}
	}
	round := *params.Round

	if !round.Alive {
		return PlayResult{}, &PlayError{Code: -32602, Message: "round already ended"}
	}

	round.Step++

	draw, err := getRNG(rngURL, params.GodData, round.GodCursor, godModeEnabled)
	if err != nil {
		return PlayResult{}, err
	}
	if godModeEnabled {
		round.GodCursor++
	}

	outcome, mult, contentID, final, endedBy := performDraw(draw, &round)

	resp := Resp{
		Action:      "swipe",
		Step:        round.Step,
		Outcome:     strPtr(outcome),
		AppliedMult: &mult,
		Acc:         round.Acc,
		ContentID:   strPtr(contentID),
		EndedBy:     endedBy,
		MaxReached:  round.MaxReached,
	}

	var finance []json.RawMessage

	if final && round.MaxReached {
		payoutRaw, _ := json.Marshal(FinancePayout{Type: "payout", Amount: round.Acc, Currency: "FUN"})
		finance = append(finance, payoutRaw)
	}

	if finance == nil {
		finance = []json.RawMessage{}
	}

	return PlayResult{
		Final:   final,
		Finance: finance,
		Game:    map[string]any{},
		Round:   round,
		Resp:    resp,
	}, nil
}

func handleCashout(params PlayParams) (PlayResult, error) {
	if params.Round == nil {
		return PlayResult{}, &PlayError{Code: -32602, Message: "round state is required for cashout"}
	}
	round := *params.Round

	if !round.Alive {
		return PlayResult{}, &PlayError{Code: -32602, Message: "round already ended"}
	}

	endedBy := "cashout"
	round.Alive = false
	round.EndedBy = &endedBy

	payoutRaw, _ := json.Marshal(FinancePayout{Type: "payout", Amount: round.Acc, Currency: "FUN"})

	resp := Resp{
		Action:      "cashout",
		Step:        round.Step,
		Outcome:     nil,
		AppliedMult: nil,
		Acc:         round.Acc,
		ContentID:   nil,
		EndedBy:     &endedBy,
		MaxReached:  round.MaxReached,
	}

	return PlayResult{
		Final:   true,
		Finance: []json.RawMessage{payoutRaw},
		Game:    map[string]any{},
		Round:   round,
		Resp:    resp,
	}, nil
}

// ── Draw logic ───────────────────────────────────────────────────────────────

// performDraw applies one RNG draw to the round state.
// Returns: outcome, appliedMult, contentID, final, endedBy.
func performDraw(draw rng.Draw, round *Round) (string, float64, string, bool, *string) {
	f1 := rng.ToFloat(draw.U1)
	f2 := rng.ToFloat(draw.U2)

	var outcome string
	var mult float64
	var contentID string

	if f1 < BombProb {
		// Bomb
		outcome = "bomb"
		mult = 0
		contentID = fmt.Sprintf("bomb_%d", (draw.U1%5)+1)
		endedBy := "bomb"
		round.Acc = 0
		round.Alive = false
		round.EndedBy = &endedBy
		return outcome, mult, contentID, true, &endedBy
	}

	// Safe or viral boost (f2 decides)
	if f2 < BoostProbGivenSafe {
		outcome = "viral_boost"
		mult = BoostMult
		contentID = fmt.Sprintf("buff_%d", (draw.U2%4)+1)
	} else {
		outcome = "safe"
		mult = NormalSafeMult
		contentID = fmt.Sprintf("safe_%d", (draw.U1%16)+1)
	}

	round.Acc *= mult

	// Check max win cap
	cap := round.BaseBet * MaxMult
	if round.Acc >= cap {
		round.Acc = cap
		round.MaxReached = true
		round.Alive = false
		endedBy := "maxwin"
		round.EndedBy = &endedBy
		return outcome, mult, contentID, true, &endedBy
	}

	return outcome, mult, contentID, false, nil
}

// ── RNG fetch ────────────────────────────────────────────────────────────────

// getRNG returns a Draw either from god_data overrides or the live RNG service.
func getRNG(rngURL string, godData *GodData, cursor int, godModeEnabled bool) (rng.Draw, error) {
	if godModeEnabled && godData != nil && cursor < len(godData.Random) {
		entry := godData.Random[cursor]
		draw := rng.Draw{}

		needU1 := entry.U1 == nil
		needU2 := entry.U2 == nil

		if !needU1 && !needU2 {
			// Both values provided — no RNG call needed
			draw.U1 = *entry.U1
			draw.U2 = *entry.U2
			return draw, nil
		}

		// Fetch live values for the missing ones
		fetched, err := rng.FetchDraw(rngURL)
		if err != nil {
			return rng.Draw{}, err
		}
		if !needU1 {
			draw.U1 = *entry.U1
		} else {
			draw.U1 = fetched.U1
		}
		if !needU2 {
			draw.U2 = *entry.U2
		} else {
			draw.U2 = fetched.U2
		}
		return draw, nil
	}

	return rng.FetchDraw(rngURL)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

func strPtr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
