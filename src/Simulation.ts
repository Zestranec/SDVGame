import { Rng } from './Rng';
import { OutcomeController } from './OutcomeController';
import { SWIPE_COST, MULT_PER_SWIPE, VIRAL_BOOST_MULT } from './Economy';

export interface SimResult {
  rounds: number;
  rtp: number;
  avgSwipes: number;
  winRate: number;
  loseRate: number;
  totalWagered: number;
  totalReturned: number;
  viralBoosts: number;
  playerModel: string;
}

/**
 * Simulate N rounds using the per-draw probability model.
 *
 * MATH — RTP at cashoutDepth = 1 (optimal):
 *   P(bomb)         = 0.15
 *   P(viral_boost)  = 0.85 × 0.0196 ≈ 1.67 %
 *   P(normal safe)  = 0.85 × 0.9804 ≈ 83.33 %
 *   E[mult | safe]  = 0.0196 × 2.0 + 0.9804 × 1.1 = 1.1176
 *   RTP             = 0.85 × 1.1176 ≈ 95.0 %
 *
 * @param rounds       Number of rounds to simulate.
 * @param seed         Deterministic PRNG seed.
 * @param cashoutDepth Cash out after this many safe draws (1 = optimal / target).
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

    let roundValue = SWIPE_COST;
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
        const mult = draw === 'viral_boost' ? VIRAL_BOOST_MULT : MULT_PER_SWIPE;
        if (draw === 'viral_boost') viralBoosts++;

        roundValue *= mult;
        safeCount++;

        if (safeCount >= cashoutDepth || cardIdx >= 15) {
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

  const label =
    cashoutDepth === 1
      ? 'optimal (cash out after 1 safe card)'
      : `depth-${cashoutDepth} (cash out after ${cashoutDepth} safe cards)`;

  return {
    rounds,
    rtp:          totalWagered > 0 ? totalReturned / totalWagered : 0,
    avgSwipes:    totalSwipes  / rounds,
    winRate:      wins         / rounds,
    loseRate:     losses       / rounds,
    totalWagered,
    totalReturned,
    viralBoosts,
    playerModel:  label,
  };
}
