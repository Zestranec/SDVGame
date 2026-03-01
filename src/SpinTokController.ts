import { Rng } from './Rng';

export const RTP_TARGET = 0.95;
export const MAX_LEVEL  = 22;

/**
 * Cashout multipliers for each level (index 0 unused).
 * C[1] = 0.9  (slight loss — incentivises first LIKE)
 * C[2] = 1.0  (break-even from level-1 perspective when RTP=95%)
 * ...
 * C[22] = 500 (jackpot — requires surviving all 21 LIKE attempts)
 */
export const CASHOUT_MULTIPLIERS: readonly number[] = [
  0, 0.9, 1.0, 1.36, 1.86, 2.5, 3.5, 4.7, 6.5, 8.8,
  12.0, 16.5, 22.5, 30.5, 41.5, 57, 77, 106, 144, 196, 270, 365, 500,
];

// ── Survival probabilities ────────────────────────────────────────────────────

/**
 * SURVIVAL_PROBS[k] = probability that a LIKE at level k succeeds.
 *
 *  p[1] = RTP_TARGET / C[2]          = 0.95 / 1.0  = 0.95
 *  p[k] = C[k] / C[k+1]  for k=2..21
 *
 * This makes EV(dislike at k) = EV(like at k) = RTP_TARGET × bet
 * for all k ≥ 2 (strategy invariance), and EV(like at 1) = 0.95 × bet.
 */
const _probs = new Array<number>(MAX_LEVEL + 1).fill(0);
_probs[1] = RTP_TARGET / CASHOUT_MULTIPLIERS[2]; // 0.95
for (let k = 2; k <= MAX_LEVEL - 1; k++) {
  _probs[k] = CASHOUT_MULTIPLIERS[k] / CASHOUT_MULTIPLIERS[k + 1];
}
export const SURVIVAL_PROBS: readonly number[] = _probs;

// ── Round sampling ────────────────────────────────────────────────────────────

/**
 * Pre-sample the level at which a LIKE attempt fails.
 * Returns `Infinity` if all levels survive (player can reach level 22 → COLLECT).
 *
 * SECURITY: this value must NEVER be exposed to the player — store it only
 * in a private in-memory field, never log or serialize it.
 */
export function sampleFailAtLike(rng: Rng): number {
  for (let level = 1; level <= MAX_LEVEL - 1; level++) {
    if (!rng.nextBool(SURVIVAL_PROBS[level])) return level;
  }
  return Infinity;
}

/** Cash-out amount for the given level. */
export function calcPayout(bet: number, level: number): number {
  return bet * CASHOUT_MULTIPLIERS[level];
}
