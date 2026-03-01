import { Rng } from './Rng';
import { OutcomeController } from './OutcomeController';
import {
  SWIPE_COST,
  HOUSE_EDGE,
  NORMAL_SAFE_MULT,
  VIRAL_BOOST_MULT,
  MAX_MULT,
} from './Economy';

export interface SimResult {
  rounds:        number;
  rtp:           number;
  avgSwipes:     number;
  winRate:       number;
  loseRate:      number;
  totalWagered:  number;
  totalReturned: number;
  viralBoosts:   number;
  playerModel:   string;
}

/**
 * Simulate N rounds using the depth-invariant probability model.
 *
 * MATH — why RTP ≈ HOUSE_EDGE for any cashout depth:
 *
 *   1. roundValue starts at bet × HOUSE_EDGE (5% edge applied once at round start).
 *   2. BOMB_PROB = 0.15 — constant per-swipe danger probability.
 *   3. E[mult | safe] = NORMAL_SAFE_MULT × (1 − q) + VIRAL_BOOST_MULT × q
 *                     ≈ 1.1499 × 0.997 + 10.0 × 0.003
 *                     ≈ 1.1765  =  1 / (1 − 0.15)  =  1 / 0.85
 *   4. Therefore: (1 − BOMB_PROB) × E[mult | safe] ≈ 0.85 × 1.1765 ≈ 1.0
 *      Each swipe preserves expected round value → depth does not affect RTP.
 *
 *   EV(return | cashout at depth N) = (0.85^N) × bet × HOUSE_EDGE × (1/0.85)^N
 *                                   = bet × HOUSE_EDGE  ≈ 0.95 × bet  ✓
 *
 * @param rounds        Number of rounds to simulate.
 * @param seed          Deterministic RNG seed.
 * @param cashoutDepth  Cash out after this many safe draws (any value gives ~95% RTP).
 */
export function runSimulation(
  rounds: number,
  seed: number = 42,
  cashoutDepth = 1,
): SimResult {
  const rng     = new Rng(seed);
  const outCtrl = new OutcomeController(rng);

  let totalWagered  = 0;
  let totalReturned = 0;
  let totalSwipes   = 0;
  let wins          = 0;
  let losses        = 0;
  let viralBoosts   = 0;

  for (let r = 0; r < rounds; r++) {
    totalWagered += SWIPE_COST;

    let roundValue = SWIPE_COST * HOUSE_EDGE; // edge applied once at round start
    let safeCount  = 0;
    let cardIdx    = 0;
    let done       = false;

    while (!done) {
      const draw = outCtrl.drawCard();

      if (draw === 'bomb') {
        losses++;
        totalSwipes += cardIdx + 1;
        done = true;
      } else {
        const mult = draw === 'viral_boost' ? VIRAL_BOOST_MULT : NORMAL_SAFE_MULT;
        if (draw === 'viral_boost') viralBoosts++;

        roundValue = Math.min(roundValue * mult, SWIPE_COST * MAX_MULT);
        safeCount++;

        if (safeCount >= cashoutDepth || cardIdx >= 30) {
          totalReturned += roundValue;
          wins++;
          totalSwipes += cardIdx + 1;
          done = true;
        } else {
          cardIdx++;
        }
      }
    }
  }

  const label = `depth-${cashoutDepth} (cash out after ${cashoutDepth} safe card${cashoutDepth === 1 ? '' : 's'})`;

  return {
    rounds,
    rtp:           totalWagered > 0 ? totalReturned / totalWagered : 0,
    avgSwipes:     totalSwipes  / rounds,
    winRate:       wins         / rounds,
    loseRate:      losses       / rounds,
    totalWagered,
    totalReturned,
    viralBoosts,
    playerModel:   label,
  };
}
