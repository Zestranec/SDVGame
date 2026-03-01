import type { Rng } from './Rng';

export type DrawResult = 'bomb' | 'viral_boost' | 'safe';

/**
 * Controls card outcome probabilities.
 *
 * DESIGN — depth-invariant RTP:
 *
 *   BOMB_PROB = 0.15
 *
 *   E[mult | safe] must equal 1 / (1 − BOMB_PROB) = 1 / 0.85 ≈ 1.1765
 *   so that each swipe's survival risk is exactly compensated.
 *
 *   With q = VIRAL_BOOST_PROB_GIVEN_SAFE = 0.003 and VIRAL_BOOST_MULT = 10.0:
 *     E[mult | safe] = q × 10.0 + (1−q) × NORMAL_SAFE_MULT
 *                    = 0.003 × 10 + 0.997 × 1.1499
 *                    ≈ 0.03 + 1.1465  =  1.1765  ✓
 *
 *   RTP = HOUSE_EDGE (0.95) for any cashout depth, because:
 *     • roundValue starts at bet × HOUSE_EDGE (house edge applied once at round start)
 *     • (1 − BOMB_PROB) × E[mult | safe] = 0.85 × 1.1765 ≈ 1.0
 *     • So each swipe preserves expected value; depth of play doesn't change EV.
 *
 * All probabilities are centralised here. Do NOT hardcode them elsewhere.
 */
export class OutcomeController {
  /** Probability that any single card draw is the danger card. */
  static readonly BOMB_PROB = 0.15;

  /**
   * Conditional probability of viral_boost given the draw is not a bomb.
   * Low enough to be a genuine surprise; high enough to occur a few times
   * per session (≈ 1 in 335 non-bomb draws).
   */
  static readonly VIRAL_BOOST_PROB_GIVEN_SAFE = 0.003;

  private readonly rng: Rng;

  constructor(rng: Rng) {
    this.rng = rng;
  }

  /**
   * Draw the next card outcome using the shared RNG.
   * Consumes 1–2 RNG values per call.
   */
  drawCard(): DrawResult {
    if (this.rng.nextBool(OutcomeController.BOMB_PROB)) return 'bomb';
    if (this.rng.nextBool(OutcomeController.VIRAL_BOOST_PROB_GIVEN_SAFE)) return 'viral_boost';
    return 'safe';
  }
}
