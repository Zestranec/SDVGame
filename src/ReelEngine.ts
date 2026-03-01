import type { Rng } from './Rng';
import { OutcomeController } from './OutcomeController';
import { BOMB_CARD, VIRAL_BOOST_CARD, type CardDef } from './Card';
import { SAFE_CARDS_CONFIG } from './config/safeCards';
import { CardStyleController } from './CardStyleController';

/**
 * Manages the sequence of cards shown in a round.
 * Card type (bomb / viral_boost / safe) is decided per-draw by OutcomeController.
 * Safe card identity and visuals are derived deterministically by CardStyleController.
 */
export class ReelEngine {
  private readonly rng: Rng;
  private readonly outcomeCtrl: OutcomeController;
  private readonly styleCtrl: CardStyleController;

  constructor(rng: Rng, outcomeCtrl: OutcomeController) {
    this.rng         = rng;
    this.outcomeCtrl = outcomeCtrl;
    this.styleCtrl   = new CardStyleController();
  }

  /** No-op — kept for API compatibility; no per-round state to reset. */
  startRound(): void { /* no-op */ }

  /** Draw and return the next card. Safe to call multiple times per round. */
  nextCard(): CardDef {
    const result = this.outcomeCtrl.drawCard();
    if (result === 'bomb')        return BOMB_CARD;
    if (result === 'viral_boost') return VIRAL_BOOST_CARD;

    // Pick a safe card from the 100-card pool using the shared RNG
    const config = SAFE_CARDS_CONFIG[this.rng.nextInt(SAFE_CARDS_CONFIG.length)];
    return this.styleCtrl.buildCardDef(config);
  }
}
