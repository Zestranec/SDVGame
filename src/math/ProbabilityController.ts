import type { SlotConfig, Volatility } from '../types';
import type { Rng } from './Rng';

interface BaseProfile {
  /** Target hit rate (probability of any win). */
  hitRate: number;
  /** Share of MATCH_4 wins among all wins when cols=4. */
  match4Share: number;
  tierMultipliers: number[];
  tierWeights: number[];
}

const BASE_PROFILES: Record<Volatility, BaseProfile> = {
  LOW: {
    hitRate: 0.55,
    match4Share: 0.12,
    tierMultipliers: [1.0, 1.2, 1.5, 2.0, 3.0, 5.0],
    tierWeights:     [40,  25,  18,  10,  5,   2],
  },
  MED: {
    hitRate: 0.35,
    match4Share: 0.25,
    tierMultipliers: [1.0, 1.5, 2.0, 3.0, 5.0,  8.0, 12.0],
    tierWeights:     [28,  22,  18,  13,  10,   6,   3],
  },
  HIGH: {
    hitRate: 0.20,
    match4Share: 0.40,
    tierMultipliers: [1.2, 2.0, 4.0, 8.0, 15.0, 30.0, 60.0],
    tierWeights:     [22,  18,  16,  14,  12,   10,   8],
  },
};

/**
 * Stores volatility profiles and computes RTP-normalized tier multipliers.
 *
 * Normalization guarantees E[payout / bet] == targetRtp for every
 * (rows, cols, volatility) combination, by scaling all tier multipliers
 * uniformly so the weighted average satisfies:
 *
 *   pWin × avgNormalizedTierMult = targetRtp
 *   ⟹ scale = targetRtp / (pWin × avgBaseTierMult)
 */
export class ProbabilityController {
  readonly pWin: number;
  readonly pLose: number;
  readonly pMatch3: number;
  readonly pMatch4: number;

  private readonly weights: number[];
  private readonly normalizedMults: number[];

  constructor(config: SlotConfig) {
    const base = BASE_PROFILES[config.volatility];

    this.pWin  = base.hitRate;
    this.pLose = 1 - this.pWin;

    if (config.cols === 4) {
      this.pMatch4 = this.pWin * base.match4Share;
      this.pMatch3 = this.pWin - this.pMatch4;
    } else {
      this.pMatch4 = 0;
      this.pMatch3 = this.pWin;
    }

    // Weighted average of base tier multipliers
    const totalWeight = base.tierWeights.reduce((a, b) => a + b, 0);
    const avgBaseMult  = base.tierMultipliers.reduce(
      (sum, m, i) => sum + m * base.tierWeights[i],
      0,
    ) / totalWeight;

    // Scale so that E[payout] = pWin × avgNormalizedMult = targetRtp
    const scale = config.targetRtp / (this.pWin * avgBaseMult);

    this.weights          = base.tierWeights;
    this.normalizedMults  = base.tierMultipliers.map(m => m * scale);
  }

  /** Normalized tier multipliers (not clamped; may be < 1). */
  getTierMultipliers(): readonly number[] { return this.normalizedMults; }
  getTierWeights():     readonly number[] { return this.weights; }

  /**
   * Picks a tier multiplier from the weighted distribution using `rng`.
   * Uses single linear scan — fast for small tier arrays.
   */
  pickTierMult(rng: Rng): number {
    const totalWeight = this.weights.reduce((a, b) => a + b, 0);
    let r = rng.nextFloat() * totalWeight;
    for (let i = 0; i < this.weights.length; i++) {
      r -= this.weights[i];
      if (r < 0) return this.normalizedMults[i];
    }
    return this.normalizedMults[this.normalizedMults.length - 1];
  }
}
