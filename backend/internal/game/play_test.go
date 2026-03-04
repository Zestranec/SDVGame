package game_test

import (
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
	rng.Fetch = func(_ string, _ []byte) ([]byte, error) {
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

	bet := 10.0

	// --- start ---
	res1, err := game.Play(game.PlayParams{
		Req: game.Req{Action: "start", Bet: bet, BetType: "bet"},
	}, rngURL, false)
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
	expectedAcc := bet * game.HouseEdge * game.NormalSafeMult
	if abs(res1.Round.Acc-expectedAcc) > 0.0001 {
		t.Fatalf("start: acc=%f want %f", res1.Round.Acc, expectedAcc)
	}

	// --- swipe ---
	res2, err := game.Play(game.PlayParams{
		Round: &res1.Round,
		Req:   game.Req{Action: "swipe"},
	}, rngURL, false)
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
	res3, err := game.Play(game.PlayParams{
		Round: &res2.Round,
		Req:   game.Req{Action: "cashout"},
	}, rngURL, false)
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
}

// ── Test: start → bomb ───────────────────────────────────────────────────────

func TestStartBomb(t *testing.T) {
	q := &rngQueue{draws: []rng.Draw{
		{U1: bombU1, U2: normalU2}, // draw 1 (start): bomb
	}}
	restore := q.install()
	defer restore()

	res, err := game.Play(game.PlayParams{
		Req: game.Req{Action: "start", Bet: 10, BetType: "bet"},
	}, rngURL, false)
	if err != nil {
		t.Fatalf("start+bomb: %v", err)
	}
	if !res.Final {
		t.Fatal("start+bomb: expected final=true on bomb")
	}
	if res.Resp.Outcome == nil || *res.Resp.Outcome != "bomb" {
		t.Fatalf("start+bomb: expected outcome=bomb, got %v", res.Resp.Outcome)
	}
	if res.Round.Acc != 0 {
		t.Fatalf("start+bomb: acc should be 0, got %f", res.Round.Acc)
	}
	if res.Round.Alive {
		t.Fatal("start+bomb: alive should be false after bomb")
	}
	// Finance should have only the betting record (no payout on bomb)
	if len(res.Finance) != 1 {
		t.Fatalf("start+bomb: expected 1 finance record (betting only), got %d", len(res.Finance))
	}
}

// ── Test: swipe after final returns error ────────────────────────────────────

func TestSwipeAfterFinal(t *testing.T) {
	q := &rngQueue{draws: []rng.Draw{
		{U1: bombU1, U2: normalU2}, // start: bomb → final=true
	}}
	restore := q.install()
	defer restore()

	res, _ := game.Play(game.PlayParams{
		Req: game.Req{Action: "start", Bet: 10, BetType: "bet"},
	}, rngURL, false)

	// Round is dead — swipe must error
	_, err := game.Play(game.PlayParams{
		Round: &res.Round,
		Req:   game.Req{Action: "swipe"},
	}, rngURL, false)
	if err == nil {
		t.Fatal("swipe after final: expected error, got nil")
	}
}

// ── Test: maxwin is forced final ─────────────────────────────────────────────

func TestMaxWin(t *testing.T) {
	// We need enough safe draws to exceed bet*500.
	// With bet=10, cap=5000. acc starts at 10*0.95=9.5.
	// Each safe ×1.1499. After N swipes acc ≥ 5000.
	// 9.5 * 1.1499^N >= 5000 → N >= log(5000/9.5)/log(1.1499) ≈ 47 swipes
	// To keep test fast use a large bet that hits quickly.
	// bet=1000, cap=500000. acc=950*1.1499^N
	// Actually let's use god mode with a forced safe to drive acc up faster.
	// Simpler: use the boost (×10) — need fewer draws.
	// acc=9.5, one boost → 95, another → 950, another → 9500 > 5000 → capped.
	// 3 boost draws.

	q := &rngQueue{draws: []rng.Draw{
		{U1: safeU1, U2: boostU2}, // start: boost ×10 → acc = 9.5*10 = 95
		{U1: safeU1, U2: boostU2}, // swipe 1: boost ×10 → acc = 950
		{U1: safeU1, U2: boostU2}, // swipe 2: boost ×10 → acc = 9500 → capped to 5000, final
	}}
	restore := q.install()
	defer restore()

	bet := 10.0
	cap := bet * game.MaxMult // 5000

	res1, err := game.Play(game.PlayParams{
		Req: game.Req{Action: "start", Bet: bet, BetType: "bet"},
	}, rngURL, false)
	if err != nil {
		t.Fatalf("maxwin start: %v", err)
	}

	res2, err := game.Play(game.PlayParams{
		Round: &res1.Round,
		Req:   game.Req{Action: "swipe"},
	}, rngURL, false)
	if err != nil {
		t.Fatalf("maxwin swipe1: %v", err)
	}

	res3, err := game.Play(game.PlayParams{
		Round: &res2.Round,
		Req:   game.Req{Action: "swipe"},
	}, rngURL, false)
	if err != nil {
		t.Fatalf("maxwin swipe2: %v", err)
	}

	if !res3.Final {
		t.Fatal("maxwin: expected final=true when cap reached")
	}
	if !res3.Round.MaxReached {
		t.Fatal("maxwin: expected max_reached=true")
	}
	if res3.Round.Acc != cap {
		t.Fatalf("maxwin: acc=%f want %f", res3.Round.Acc, cap)
	}
	if res3.Resp.EndedBy == nil || *res3.Resp.EndedBy != "maxwin" {
		t.Fatalf("maxwin: expected ended_by=maxwin, got %v", res3.Resp.EndedBy)
	}
	// Payout finance should be present
	if len(res3.Finance) != 1 {
		t.Fatalf("maxwin: expected 1 finance record (payout), got %d", len(res3.Finance))
	}
}

func abs(f float64) float64 {
	if f < 0 {
		return -f
	}
	return f
}
