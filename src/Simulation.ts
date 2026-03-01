import { Rng } from './Rng';
import { sampleFailAtLike, calcPayout, CASHOUT_MULTIPLIERS, MAX_LEVEL } from './SpinTokController';

export interface SimResult {
  rounds:        number;
  rtp:           number;
  avgLevel:      number;
  winRate:       number;
  loseRate:      number;
  totalWagered:  number;
  totalReturned: number;
  playerModel:   string;
}

/**
 * Simulate N rounds of SpinTok with a fixed cashout strategy.
 *
 * MATH — optimal RTP (cashoutAtLevel ≥ 2):
 *   p[1] = RTP_TARGET / C[2]  = 0.95 / 1.0 = 0.95
 *   EV   = p[1] × C[2] × bet = 0.95 × bet  → RTP = 95 %
 *
 *   For k ≥ 2:  p[k] = C[k] / C[k+1]
 *   EV(dislike at k) = EV(like at k) = RTP_TARGET × bet  (strategy invariant)
 *
 * @param rounds           Number of rounds to simulate.
 * @param seed             Deterministic RNG seed.
 * @param cashoutAtLevel   Dislike (collect) upon reaching this level.
 *                         Use MAX_LEVEL to always try for the jackpot.
 */
export function runSimulation(
  rounds: number,
  seed: number = 42,
  cashoutAtLevel = 2,
): SimResult {
  const rng = new Rng(seed);
  const bet = 10;

  let totalWagered  = 0;
  let totalReturned = 0;
  let totalLevels   = 0;
  let wins          = 0;
  let losses        = 0;

  for (let r = 0; r < rounds; r++) {
    totalWagered += bet;

    const failAt = sampleFailAtLike(rng);
    let level    = 1;
    let done     = false;

    while (!done) {
      if (level >= cashoutAtLevel || level === MAX_LEVEL) {
        // Player dislike-cashes-out at this level
        totalReturned += calcPayout(bet, level);
        wins++;
        totalLevels += level;
        done = true;
      } else if (level === failAt) {
        // LIKE attempt fails → round lost
        losses++;
        totalLevels += level;
        done = true;
      } else {
        level++; // survived LIKE, advance
      }
    }
  }

  const label = cashoutAtLevel >= MAX_LEVEL
    ? `always LIKE (jackpot at level ${MAX_LEVEL}, C×${CASHOUT_MULTIPLIERS[MAX_LEVEL]})`
    : `dislike at level ${cashoutAtLevel} (C×${CASHOUT_MULTIPLIERS[cashoutAtLevel]})`;

  return {
    rounds,
    rtp:           totalWagered > 0 ? totalReturned / totalWagered : 0,
    avgLevel:      totalLevels / rounds,
    winRate:       wins   / rounds,
    loseRate:      losses / rounds,
    totalWagered,
    totalReturned,
    playerModel:   label,
  };
}
