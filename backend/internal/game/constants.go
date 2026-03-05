package game

const (
	// ── Probability thresholds (float, used for RNG draw comparison) ──────────

	BombProb          = 0.15
	BoostProbGivenSafe = 0.003

	// ── Fixed-point multipliers in basis points (10000 bp = 1.0000×) ─────────
	// Integer arithmetic: acc_cents = (acc_cents * mult_bp + 5000) / 10000

	HouseEdgeBP      int64 = 9500   // 0.95×
	NormalSafeMultBP int64 = 11499  // 1.1499×
	BoostMultBP      int64 = 100000 // 10.00×

	// ── Hard cap ──────────────────────────────────────────────────────────────

	// MaxMult is the maximum win multiplier (unitless).
	// cap_cents = base_bet_cents * MaxMult
	MaxMult int64 = 500
)
