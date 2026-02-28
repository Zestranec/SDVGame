import type { SlotConfig } from '../types';
import { Rng } from './Rng';
import { ProbabilityController } from './ProbabilityController';
import { OutcomeController } from './OutcomeController';
import { GridBuilder, evaluatePayline } from '../game/GridBuilder';

export interface SimulationResult {
  rtp: number;
  hitRate: number;
  /** Average win multiplier on winning spins only. */
  avgWinOnHit: number;
  maxWinMult: number;
  distribution: {
    lose:   number;   // payoutMult = 0
    sub1:   number;   // 0 < mult < 1
    x1:     number;   // 1 ≤ mult < 2
    x2:     number;   // 2 ≤ mult < 5
    x5:     number;   // 5 ≤ mult < 10
    x10:    number;   // 10 ≤ mult < 25
    x25p:   number;   // mult ≥ 25
  };
  totalSpins: number;
}

export class Simulation {
  /**
   * Runs `spins` rounds with a deterministic RNG (fixed `seed`) and returns
   * aggregate stats.  Also verifies grid integrity on every spin — throws if
   * evaluatePayline disagrees with the pre-determined outcome.
   */
  static simulate(
    config: SlotConfig,
    seed: number,
    spins: number,
    bet = 1,
  ): SimulationResult {
    const rng      = new Rng(seed);
    const probCtrl = new ProbabilityController(config);

    let totalBet  = 0;
    let totalWin  = 0;
    let wins      = 0;
    let maxWinMult = 0;

    const dist = { lose: 0, sub1: 0, x1: 0, x2: 0, x5: 0, x10: 0, x25p: 0 };

    for (let i = 0; i < spins; i++) {
      const outcome = OutcomeController.pickOutcome(config, rng, probCtrl);
      const grid    = GridBuilder.buildFinalGrid(config, rng, outcome);

      // Verify grid matches outcome
      const actual = evaluatePayline(grid, outcome.paylineRow, config.cols);
      if (actual !== outcome.winKind) {
        throw new Error(
          `Simulation integrity failure at spin ${i}: ` +
          `outcome=${outcome.winKind}, grid=${actual}`,
        );
      }

      totalBet += bet;
      const win  = bet * outcome.payoutMult;
      totalWin  += win;

      const m = outcome.payoutMult;

      if (outcome.winKind !== 'LOSE') {
        wins++;
        if (m > maxWinMult) maxWinMult = m;
      }

      if (m === 0)       dist.lose++;
      else if (m < 1)    dist.sub1++;
      else if (m < 2)    dist.x1++;
      else if (m < 5)    dist.x2++;
      else if (m < 10)   dist.x5++;
      else if (m < 25)   dist.x10++;
      else               dist.x25p++;
    }

    return {
      rtp:         totalWin / totalBet,
      hitRate:     wins / spins,
      avgWinOnHit: wins > 0 ? totalWin / wins : 0,
      maxWinMult,
      distribution: dist,
      totalSpins: spins,
    };
  }
}
