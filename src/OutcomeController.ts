import type { Rng } from './Rng';

export type DrawResult = 'bomb' | 'viral_boost' | 'safe';

/**
 * Controls card outcome probabilities to target RTP ≈ 95%.
 *
 * Per-draw math:
 *   P(bomb)        = 0.15
 *   P(viral_boost) = 0.85 × 0.0196 ≈ 1.666 %
 *   P(safe)        = 0.85 × 0.9804 ≈ 83.33 %
 *
 * E[multiplier | not bomb] = 0.0196 × 2.0 + 0.9804 × 1.1 = 1.1176
 *
 * RTP for optimal play (cash out after 1 safe card):
 *   RTP = P(not bomb) × E[mult] = 0.85 × 1.1176 ≈ 95.0 %
 *
 * All probabilities are centralised here. Do NOT hardcode them elsewhere.
 */
export class OutcomeController {
  /** Probability that any single card draw is the danger card. */
  static readonly BOMB_PROB = 0.15;

  /**
   * Conditional probability of viral_boost given the draw is not a bomb.
   * Chosen so E[mult | not bomb] ≈ 1.1176 which keeps RTP at 95 %.
   */
  static readonly VIRAL_BOOST_PROB_GIVEN_SAFE = 0.0196;

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
