import type { SlotConfig, Outcome, WinKind } from '../types';
import type { Rng } from './Rng';
import type { ProbabilityController } from './ProbabilityController';

/**
 * Picks a fully-determined Outcome BEFORE any animation or grid building.
 * The grid builder then constructs a visual grid that matches this outcome.
 */
export class OutcomeController {
  static pickOutcome(
    config: SlotConfig,
    rng: Rng,
    probCtrl: ProbabilityController,
  ): Outcome {
    const paylineRow = Math.floor(config.rows / 2);

    // Primary roll — lose or win?
    const u = rng.nextFloat();
    if (u < probCtrl.pLose) {
      return { winKind: 'LOSE', payoutMult: 0, paylineRow };
    }

    // Determine win kind
    let winKind: WinKind;
    if (config.cols === 3) {
      winKind = 'MATCH_3';
    } else {
      // cols === 4: split between MATCH_3 and MATCH_4 by their relative shares
      const match4Threshold = probCtrl.pMatch4 / probCtrl.pWin;
      winKind = rng.nextFloat() < match4Threshold ? 'MATCH_4' : 'MATCH_3';
    }

    // Pick payout tier
    const payoutMult = probCtrl.pickTierMult(rng);

    // Pick winning symbol uniformly from 0..symbolsCount-1
    const symbolId = rng.nextInt(config.symbolsCount);

    return { winKind, symbolId, payoutMult, paylineRow };
  }
}
