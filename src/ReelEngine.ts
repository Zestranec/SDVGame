import type { Rng } from './Rng';
import { OutcomeController } from './OutcomeController';
import { BOMB_CARD, VIRAL_BOOST_CARD, type CardDef } from './Card';
import { SAFE_CARDS_CONFIG } from './config/safeCards';
import { CardStyleController } from './CardStyleController';
import { BOMB_VIDEO_URLS, SAFE_VIDEO_URLS, BUFF_VIDEO_URLS } from './config/videoCdnUrls';

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

    if (result === 'bomb') {
      // Outcome first, then pick a random clip from the bomb pool
      return { ...BOMB_CARD, videoUrl: this.rng.pick(BOMB_VIDEO_URLS) };
    }

    if (result === 'viral_boost') {
      return { ...VIRAL_BOOST_CARD, videoUrl: this.rng.pick(BUFF_VIDEO_URLS) };
    }

    // Pick a safe card from the 100-card pool, then assign a random safe clip
    const config = SAFE_CARDS_CONFIG[this.rng.nextInt(SAFE_CARDS_CONFIG.length)];
    const def    = this.styleCtrl.buildCardDef(config);
    return { ...def, videoUrl: this.rng.pick(SAFE_VIDEO_URLS) };
  }
}
