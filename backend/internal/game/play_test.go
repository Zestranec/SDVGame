package game_test

import (
	"context"
	"testing"

	"adhd-backend/internal/game"
	"adhd-backend/internal/rng"
)

// mockFetch replaces rng.Fetch during tests so we control RNG values.
// It enqueues a series of u32 pair responses.
type rngQueue struct {
	draws []rng.Draw
	pos   int
}

func (q *rngQueue) install() func() {
	orig := rng.Fetch
	rng.Fetch = func(_ context.Context, _ string, _ []byte) ([]byte, error) {
		if q.pos >= len(q.draws) {
			panic("rng queue exhausted")
		}
		d := q.draws[q.pos]
		q.pos++
		// Return JSON-RPC response with array result
		resp := []byte(`{"jsonrpc":"2.0","id":1,"result":[` +
			uint32Str(d.U1) + `,` + uint32Str(d.U2) + `]}`)
		return resp, nil
	}
	return func() { rng.Fetch = orig }
}

func uint32Str(v uint32) string {
	return string(intToBytes(v))
}

func intToBytes(v uint32) []byte {
	if v == 0 {
		return []byte("0")
	}
	buf := make([]byte, 0, 10)
	for v > 0 {
		buf = append([]byte{byte('0' + v%10)}, buf...)
		v /= 10
	}
	return buf
}

// safeU1 is a u32 that produces f1 >= 0.15 (i.e. not a bomb).
// 0.2 * 4294967296 = 858993459
const safeU1 uint32 = 858993459

// bombU1 produces f1 < 0.15 (i.e. a bomb).
// 0.1 * 4294967296 = 429496729
const bombU1 uint32 = 429496729

// boostU2 produces f2 < 0.003 (i.e. viral boost).
// 0.002 * 4294967296 = 8589934
const boostU2 uint32 = 8589934

// normalU2 is a u32 that produces f2 >= 0.003 (normal safe).
const normalU2 uint32 = 100000000

const rngURL = "http://unused-in-tests"

// ── Test: start → swipe → cashout ───────────────────────────────────────────

func TestStartSwipeCashout(t *testing.T) {
	q := &rngQueue{draws: []rng.Draw{
		{U1: safeU1, U2: normalU2}, // draw 1 (start): safe
		{U1: safeU1, U2: normalU2}, // draw 2 (swipe): safe
	}}
	restore := q.install()
	defer restore()

	ctx := context.Background()
	bet := 10.0 // $10.00 → 1000 cents

	// --- start ---
	res1, err := game.Play(ctx, game.PlayParams{
		Req: game.Req{Action: "start", Bet: bet, BetType: "bet"},
	}, rngURL, false, "USD")
	if err != nil {
		t.Fatalf("start: %v", err)
	}
	if res1.Final {
		t.Fatal("start: expected final=false after safe draw")
	}
	if res1.Resp.Outcome == nil || *res1.Resp.Outcome != "safe" {
		t.Fatalf("start: expected outcome=safe, got %v", res1.Resp.Outcome)
	}
	if len(res1.Finance) != 1 {
		t.Fatalf("start: expected 1 finance record (betting), got %d", len(res1.Finance))
	}
	// betCents=1000; initial acc = (1000*9500+5000)/10000 = 950
	// after safe (11499 bp): (950*11499+5000)/10000 = 10929050/10000 = 1092
	const wantAccCents int64 = 1092
	if res1.Round.AccCents != wantAccCents {
		t.Fatalf("start: acc_cents=%d want %d", res1.Round.AccCents, wantAccCents)
	}
	if res1.Resp.AccCents != wantAccCents {
		t.Fatalf("start: resp.acc_cents=%d want %d", res1.Resp.AccCents, wantAccCents)
	}
	if res1.Resp.AppliedMultBP == nil || *res1.Resp.AppliedMultBP != int(game.NormalSafeMultBP) {
		t.Fatalf("start: expected applied_mult_bp=%d, got %v", game.NormalSafeMultBP, res1.Resp.AppliedMultBP)
	}
	if res1.Resp.AppliedMultDisplay == nil || *res1.Resp.AppliedMultDisplay != "1.15" {
		t.Fatalf("start: expected applied_mult_display=1.15, got %v", res1.Resp.AppliedMultDisplay)
	}

	// --- swipe ---
	res2, err := game.Play(ctx, game.PlayParams{
		Round: &res1.Round,
		Req:   game.Req{Action: "swipe"},
	}, rngURL, false, "USD")
	if err != nil {
		t.Fatalf("swipe: %v", err)
	}
	if res2.Final {
		t.Fatal("swipe: expected final=false")
	}
	if res2.Resp.Step != 1 {
		t.Fatalf("swipe: expected step=1, got %d", res2.Resp.Step)
	}

	// --- cashout ---
	res3, err := game.Play(ctx, game.PlayParams{
		Round: &res2.Round,
		Req:   game.Req{Action: "cashout"},
	}, rngURL, false, "USD")
	if err != nil {
		t.Fatalf("cashout: %v", err)
	}
	if !res3.Final {
		t.Fatal("cashout: expected final=true")
	}
	if res3.Resp.EndedBy == nil || *res3.Resp.EndedBy != "cashout" {
		t.Fatal("cashout: expected ended_by=cashout")
	}
	if len(res3.Finance) != 1 {
		t.Fatalf("cashout: expected 1 finance record (payout), got %d", len(res3.Finance))
	}
	// No multiplier on cashout
	if res3.Resp.AppliedMultBP != nil || res3.Resp.AppliedMultDisplay != nil {
		t.Fatal("cashout: expected nil mult fields")
	}
}

// ── Test: start → bomb ───────────────────────────────────────────────────────

func TestStartBomb(t *testing.T) {
	q := &rngQueue{draws: []rng.Draw{
		{U1: bombU1, U2: normalU2}, // draw 1 (start): bomb
	}}
	restore := q.install()
	defer restore()

	res, err := game.Play(context.Background(), game.PlayParams{
		Req: game.Req{Action: "start", Bet: 10, BetType: "bet"},
	}, rngURL, false, "USD")
	if err != nil {
		t.Fatalf("start+bomb: %v", err)
	}
	if !res.Final {
		t.Fatal("start+bomb: expected final=true on bomb")
	}
	if res.Resp.Outcome == nil || *res.Resp.Outcome != "bomb" {
		t.Fatalf("start+bomb: expected outcome=bomb, got %v", res.Resp.Outcome)
	}
	if res.Round.AccCents != 0 {
		t.Fatalf("start+bomb: acc_cents should be 0, got %d", res.Round.AccCents)
	}
	if res.Round.Alive {
		t.Fatal("start+bomb: alive should be false after bomb")
	}
	// Finance should have only the betting record (no payout on bomb)
	if len(res.Finance) != 1 {
		t.Fatalf("start+bomb: expected 1 finance record (betting only), got %d", len(res.Finance))
	}
	// No multiplier on bomb
	if res.Resp.AppliedMultBP != nil || res.Resp.AppliedMultDisplay != nil {
		t.Fatal("start+bomb: expected nil mult fields on bomb")
	}
}

// ── Test: swipe after final returns error ────────────────────────────────────

func TestSwipeAfterFinal(t *testing.T) {
	q := &rngQueue{draws: []rng.Draw{
		{U1: bombU1, U2: normalU2}, // start: bomb → final=true
	}}
	restore := q.install()
	defer restore()

	ctx := context.Background()

	res, _ := game.Play(ctx, game.PlayParams{
		Req: game.Req{Action: "start", Bet: 10, BetType: "bet"},
	}, rngURL, false, "USD")

	// Round is dead — swipe must error
	_, err := game.Play(ctx, game.PlayParams{
		Round: &res.Round,
		Req:   game.Req{Action: "swipe"},
	}, rngURL, false, "USD")
	if err == nil {
		t.Fatal("swipe after final: expected error, got nil")
	}
}

// ── Test: maxwin is forced final ─────────────────────────────────────────────

func TestMaxWin(t *testing.T) {
	// betCents=1000, cap=1000*500=500000 cents ($5000.00).
	// After HouseEdge: (1000*9500+5000)/10000 = 950 cents.
	// Each boost (100000 bp, 10×): (acc*100000+5000)/10000 ≈ acc*10.
	//   step start:  acc = 950
	//   swipe 1 boost: (950*100000+5000)/10000 = 9500
	//   swipe 2 boost: (9500*100000+5000)/10000 = 95000
	//   swipe 3 boost: (95000*100000+5000)/10000 = 950000 → capped at 500000

	q := &rngQueue{draws: []rng.Draw{
		{U1: safeU1, U2: boostU2}, // start: boost ×10
		{U1: safeU1, U2: boostU2}, // swipe 1: boost ×10
		{U1: safeU1, U2: boostU2}, // swipe 2: boost ×10 → capped
	}}
	restore := q.install()
	defer restore()

	ctx := context.Background()
	bet := 10.0
	capCents := int64(1000) * game.MaxMult // 500000

	res1, err := game.Play(ctx, game.PlayParams{
		Req: game.Req{Action: "start", Bet: bet, BetType: "bet"},
	}, rngURL, false, "USD")
	if err != nil {
		t.Fatalf("maxwin start: %v", err)
	}

	res2, err := game.Play(ctx, game.PlayParams{
		Round: &res1.Round,
		Req:   game.Req{Action: "swipe"},
	}, rngURL, false, "USD")
	if err != nil {
		t.Fatalf("maxwin swipe1: %v", err)
	}

	res3, err := game.Play(ctx, game.PlayParams{
		Round: &res2.Round,
		Req:   game.Req{Action: "swipe"},
	}, rngURL, false, "USD")
	if err != nil {
		t.Fatalf("maxwin swipe2: %v", err)
	}

	if !res3.Final {
		t.Fatal("maxwin: expected final=true when cap reached")
	}
	if !res3.Round.MaxReached {
		t.Fatal("maxwin: expected max_reached=true")
	}
	if res3.Round.AccCents != capCents {
		t.Fatalf("maxwin: acc_cents=%d want %d", res3.Round.AccCents, capCents)
	}
	if res3.Resp.EndedBy == nil || *res3.Resp.EndedBy != "maxwin" {
		t.Fatalf("maxwin: expected ended_by=maxwin, got %v", res3.Resp.EndedBy)
	}
	// Payout finance should be present
	if len(res3.Finance) != 1 {
		t.Fatalf("maxwin: expected 1 finance record (payout), got %d", len(res3.Finance))
	}
}
