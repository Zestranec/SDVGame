package game

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"math"

	"adhd-backend/internal/logx"
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
	Game    map[string]any `json:"game"`
	Round   *Round         `json:"round"`
	Req     Req            `json:"req"`
	Config  map[string]any `json:"config"`
	GodData *GodData       `json:"god_data"`
}

// ── Errors ───────────────────────────────────────────────────────────────────

// PlayError is a JSON-RPC application-level error.
type PlayError struct {
	Code    int
	Message string
}

func (e *PlayError) Error() string { return e.Message }
func (e *PlayError) GetCode() int  { return e.Code }

// ── Play entry point ─────────────────────────────────────────────────────────

// Play processes one runner call and returns a PlayResult or a PlayError.
func Play(ctx context.Context, params PlayParams, rngURL string, godModeEnabled bool) (PlayResult, error) {
	switch params.Req.Action {
	case "start":
		return handleStart(ctx, params, rngURL, godModeEnabled)
	case "swipe":
		return handleSwipe(ctx, params, rngURL, godModeEnabled)
	case "cashout":
		return handleCashout(ctx, params)
	default:
		return PlayResult{}, &PlayError{Code: -32602, Message: fmt.Sprintf("unknown action: %q", params.Req.Action)}
	}
}

// ── Handlers ─────────────────────────────────────────────────────────────────

func handleStart(ctx context.Context, params PlayParams, rngURL string, godModeEnabled bool) (PlayResult, error) {
	// Convert float bet from runner to integer cents (round-half-up).
	betCents := int64(math.Round(params.Req.Bet * 100))
	betType := params.Req.BetType
	if betType == "" {
		betType = "bet"
	}

	round := Round{
		BaseBetCents: betCents,
		AccCents:     (betCents*HouseEdgeBP + 5000) / 10000,
		Step:         0,
		Alive:        true,
		MaxReached:   false,
		EndedBy:      nil,
	}

	bettingRaw, _ := json.Marshal(FinanceBetting{
		Type:         "betting",
		BetCents:     -betCents,
		BaseBetCents: betCents,
		BetType:      betType,
	})

	accBefore := round.AccCents

	draw, err := getRNG(ctx, rngURL, params.GodData, round.GodCursor, godModeEnabled)
	if err != nil {
		return PlayResult{}, err
	}
	if godModeEnabled {
		round.GodCursor++
	}

	outcome, multBP, contentID, final, endedBy := performDraw(draw, &round)
	multBPPtr, multDispPtr := multPtrs(outcome, multBP)

	resp := Resp{
		Action:             "start",
		Step:               0,
		Outcome:            strPtr(outcome),
		AppliedMultBP:      multBPPtr,
		AppliedMultDisplay: multDispPtr,
		AccCents:           round.AccCents,
		ContentID:          strPtr(contentID),
		EndedBy:            endedBy,
		MaxReached:         round.MaxReached,
	}

	var finance []json.RawMessage
	finance = append(finance, bettingRaw)

	if final && round.MaxReached {
		payoutRaw, _ := json.Marshal(FinancePayout{Type: "payout", AmountCents: round.AccCents, Currency: "FUN"})
		finance = append(finance, payoutRaw)
	}

	result := PlayResult{
		Final:   final,
		Finance: finance,
		Game:    map[string]any{},
		Round:   round,
		Resp:    resp,
	}

	logPlayStep(ctx, resp, 0, 0, betCents, accBefore, round.AccCents, final)

	return result, nil
}

func handleSwipe(ctx context.Context, params PlayParams, rngURL string, godModeEnabled bool) (PlayResult, error) {
	if params.Round == nil {
		return PlayResult{}, &PlayError{Code: -32602, Message: "round state is required for swipe"}
	}
	round := *params.Round

	if !round.Alive {
		slog.WarnContext(ctx, "invalid_state",
			"event", "invalid_state",
			"request_id", logx.RequestID(ctx),
			"action", "swipe",
			"reason", "round already ended",
		)
		return PlayResult{}, &PlayError{Code: -32602, Message: "round already ended"}
	}

	stepBefore := round.Step
	accBefore := round.AccCents
	round.Step++

	draw, err := getRNG(ctx, rngURL, params.GodData, round.GodCursor, godModeEnabled)
	if err != nil {
		return PlayResult{}, err
	}
	if godModeEnabled {
		round.GodCursor++
	}

	outcome, multBP, contentID, final, endedBy := performDraw(draw, &round)
	multBPPtr, multDispPtr := multPtrs(outcome, multBP)

	resp := Resp{
		Action:             "swipe",
		Step:               round.Step,
		Outcome:            strPtr(outcome),
		AppliedMultBP:      multBPPtr,
		AppliedMultDisplay: multDispPtr,
		AccCents:           round.AccCents,
		ContentID:          strPtr(contentID),
		EndedBy:            endedBy,
		MaxReached:         round.MaxReached,
	}

	var finance []json.RawMessage

	if final && round.MaxReached {
		payoutRaw, _ := json.Marshal(FinancePayout{Type: "payout", AmountCents: round.AccCents, Currency: "FUN"})
		finance = append(finance, payoutRaw)
	}

	if finance == nil {
		finance = []json.RawMessage{}
	}

	result := PlayResult{
		Final:   final,
		Finance: finance,
		Game:    map[string]any{},
		Round:   round,
		Resp:    resp,
	}

	logPlayStep(ctx, resp, stepBefore, round.Step, round.BaseBetCents, accBefore, round.AccCents, final)

	return result, nil
}

func handleCashout(ctx context.Context, params PlayParams) (PlayResult, error) {
	if params.Round == nil {
		return PlayResult{}, &PlayError{Code: -32602, Message: "round state is required for cashout"}
	}
	round := *params.Round

	if !round.Alive {
		slog.WarnContext(ctx, "invalid_state",
			"event", "invalid_state",
			"request_id", logx.RequestID(ctx),
			"action", "cashout",
			"reason", "round already ended",
		)
		return PlayResult{}, &PlayError{Code: -32602, Message: "round already ended"}
	}

	accBefore := round.AccCents
	endedBy := "cashout"
	round.Alive = false
	round.EndedBy = &endedBy

	payoutRaw, _ := json.Marshal(FinancePayout{Type: "payout", AmountCents: round.AccCents, Currency: "FUN"})

	resp := Resp{
		Action:             "cashout",
		Step:               round.Step,
		Outcome:            nil,
		AppliedMultBP:      nil,
		AppliedMultDisplay: nil,
		AccCents:           round.AccCents,
		ContentID:          nil,
		EndedBy:            &endedBy,
		MaxReached:         round.MaxReached,
	}

	result := PlayResult{
		Final:   true,
		Finance: []json.RawMessage{payoutRaw},
		Game:    map[string]any{},
		Round:   round,
		Resp:    resp,
	}

	logPlayStep(ctx, resp, round.Step, round.Step, round.BaseBetCents, accBefore, round.AccCents, true)

	return result, nil
}

// ── Draw logic ───────────────────────────────────────────────────────────────

// performDraw applies one RNG draw to the round state.
// Returns: outcome, multBP (basis points), contentID, final, endedBy.
// multBP is 0 for bomb (no multiplier applied).
func performDraw(draw rng.Draw, round *Round) (string, int, string, bool, *string) {
	f1 := rng.ToFloat(draw.U1)
	f2 := rng.ToFloat(draw.U2)

	if f1 < BombProb {
		contentID := fmt.Sprintf("bomb_%d", (draw.U1%5)+1)
		endedBy := "bomb"
		round.AccCents = 0
		round.Alive = false
		round.EndedBy = &endedBy
		return "bomb", 0, contentID, true, &endedBy
	}

	var outcome string
	var multBP int
	var contentID string

	if f2 < BoostProbGivenSafe {
		outcome = "viral_boost"
		multBP = int(BoostMultBP)
		contentID = fmt.Sprintf("buff_%d", (draw.U2%4)+1)
	} else {
		outcome = "safe"
		multBP = int(NormalSafeMultBP)
		contentID = fmt.Sprintf("safe_%d", (draw.U1%16)+1)
	}

	// Integer fixed-point multiplication, round-half-up.
	round.AccCents = (round.AccCents*int64(multBP) + 5000) / 10000

	cap := round.BaseBetCents * MaxMult
	if round.AccCents >= cap {
		round.AccCents = cap
		round.MaxReached = true
		round.Alive = false
		endedBy := "maxwin"
		round.EndedBy = &endedBy
		return outcome, multBP, contentID, true, &endedBy
	}

	return outcome, multBP, contentID, false, nil
}

// ── RNG fetch ────────────────────────────────────────────────────────────────

// getRNG returns a Draw either from god_data overrides or the live RNG service.
func getRNG(ctx context.Context, rngURL string, godData *GodData, cursor int, godModeEnabled bool) (rng.Draw, error) {
	if godModeEnabled && godData != nil && cursor < len(godData.Random) {
		entry := godData.Random[cursor]
		draw := rng.Draw{}

		needU1 := entry.U1 == nil
		needU2 := entry.U2 == nil

		if !needU1 && !needU2 {
			draw.U1 = *entry.U1
			draw.U2 = *entry.U2
			return draw, nil
		}

		fetched, err := rng.FetchDraw(ctx, rngURL)
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

	return rng.FetchDraw(ctx, rngURL)
}

// ── Logging helpers ───────────────────────────────────────────────────────────

// logPlayStep emits one structured "play_step" log line per game action.
func logPlayStep(ctx context.Context, resp Resp, stepBefore, stepAfter int, betCents, accBefore, accAfter int64, final bool) {
	multBP := 0
	if resp.AppliedMultBP != nil {
		multBP = *resp.AppliedMultBP
	}
	slog.InfoContext(ctx, "play_step",
		"event", "play_step",
		"request_id", logx.RequestID(ctx),
		"action", resp.Action,
		"step_before", stepBefore,
		"step_after", stepAfter,
		"bet_cents", betCents,
		"acc_before_cents", accBefore,
		"acc_after_cents", accAfter,
		"outcome", derefStr(resp.Outcome),
		"applied_mult_bp", multBP,
		"content_id", derefStr(resp.ContentID),
		"final", final,
		"ended_by", derefStr(resp.EndedBy),
		"max_reached", resp.MaxReached,
	)
}

// ── General helpers ───────────────────────────────────────────────────────────

// multPtrs returns (AppliedMultBP, AppliedMultDisplay) pointers for the resp.
// Returns (nil, nil) for bomb (multBP==0) or cashout since no multiplier was applied.
func multPtrs(outcome string, multBP int) (*int, *string) {
	if outcome == "bomb" || multBP == 0 {
		return nil, nil
	}
	bp := multBP
	disp := fmt.Sprintf("%.2f", float64(multBP)/10000)
	return &bp, &disp
}

func strPtr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func derefStr(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}
