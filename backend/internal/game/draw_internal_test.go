package game

import (
	"fmt"
	"math"
	"math/rand"
	"testing"

	"adhd-backend/internal/rng"
)

// TestIdxMulHiDistribution verifies that idxMulHi covers every bucket for the
// three pool sizes used in production (4, 5, 24) without any empty buckets.
// Uses 65 536 evenly-spaced u32 inputs — fast and fully deterministic.
func TestIdxMulHiDistribution(t *testing.T) {
	for _, n := range []uint32{4, 5, 24} {
		counts := make([]int, n)
		const samples = 65536
		step := uint32(math.MaxUint32/samples) + 1
		for i := uint32(0); i < samples; i++ {
			counts[idxMulHi(i*step, n)]++
		}
		for bucket, c := range counts {
			if c == 0 {
				t.Errorf("idxMulHi n=%d: bucket %d never hit over %d inputs", n, bucket, samples)
			}
		}
	}
}

// TestDrawStats runs 100 000 draws with a seeded PRNG and checks:
//   - bomb rate ≈ BombProb (±2 pp)
//   - viral_boost conditional rate ≈ BoostProbGivenSafe (±0.2 pp)
//   - every content_id slot (bomb_1..5, buff_1..4, safe_1..24) appears at least once
//
// Tolerances are intentionally loose to avoid flakiness across seeds.
func TestDrawStats(t *testing.T) {
	const N = 100_000
	r := rand.New(rand.NewSource(42)) //nolint:gosec // test RNG, not crypto

	var nBomb, nBoost, nSafe int
	contentCounts := make(map[string]int, 33) // 5+4+24

	for i := 0; i < N; i++ {
		draw := rng.Draw{U1: r.Uint32(), U2: r.Uint32()}
		// Fresh round per draw — large cap so MaxMult never triggers mid-stat.
		round := Round{BaseBetCents: 1_000_000_000, AccCents: 1000, Alive: true}
		outcome, _, contentID, _, _ := performDraw(draw, &round)
		switch outcome {
		case "bomb":
			nBomb++
		case "viral_boost":
			nBoost++
		case "safe":
			nSafe++
		}
		contentCounts[contentID]++
	}

	// ── Outcome rates ──────────────────────────────────────────────────────

	bombRate := float64(nBomb) / N
	if math.Abs(bombRate-BombProb) > 0.02 {
		t.Errorf("bomb rate %.4f deviates from expected %.4f by >2pp", bombRate, BombProb)
	}

	nNonBomb := nBoost + nSafe
	if nNonBomb > 0 {
		boostRate := float64(nBoost) / float64(nNonBomb)
		if math.Abs(boostRate-BoostProbGivenSafe) > 0.002 {
			t.Errorf("boost|safe rate %.5f deviates from expected %.5f by >0.2pp", boostRate, BoostProbGivenSafe)
		}
	}

	// ── Content coverage ───────────────────────────────────────────────────

	for i := 1; i <= 5; i++ {
		k := fmt.Sprintf("bomb_%d", i)
		if contentCounts[k] == 0 {
			t.Errorf("content_id %q never appeared in %d draws", k, N)
		}
	}
	for i := 1; i <= 4; i++ {
		k := fmt.Sprintf("buff_%d", i)
		if contentCounts[k] == 0 {
			t.Errorf("content_id %q never appeared in %d draws", k, N)
		}
	}
	for i := 1; i <= 24; i++ {
		k := fmt.Sprintf("safe_%d", i)
		if contentCounts[k] == 0 {
			t.Errorf("content_id %q never appeared in %d draws", k, N)
		}
	}
}
