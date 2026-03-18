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
/** Fisher-Yates shuffled deck that cycles through all items before repeating. */
class ShuffleDeck<T> {
  private deck: T[] = [];
  private cursor = 0;

  constructor(private readonly pool: readonly T[], private readonly rng: Rng) {
    this.refill();
  }

  private refill(): void {
    this.deck = [...this.pool];
    for (let i = this.deck.length - 1; i > 0; i--) {
      const j = this.rng.nextInt(i + 1);
      [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
    }
    this.cursor = 0;
  }

  next(): T {
    if (this.cursor >= this.deck.length) this.refill();
    return this.deck[this.cursor++];
  }
}

export class ReelEngine {
  private readonly rng: Rng;
  private readonly outcomeCtrl: OutcomeController;
  private readonly styleCtrl: CardStyleController;
  private readonly safeDeck: ShuffleDeck<string>;
  private readonly bombDeck: ShuffleDeck<string>;
  private readonly buffDeck: ShuffleDeck<string>;

  constructor(rng: Rng, outcomeCtrl: OutcomeController) {
    this.rng         = rng;
    this.outcomeCtrl = outcomeCtrl;
    this.styleCtrl   = new CardStyleController();
    this.safeDeck    = new ShuffleDeck(SAFE_VIDEO_URLS, rng);
    this.bombDeck    = new ShuffleDeck(BOMB_VIDEO_URLS, rng);
    this.buffDeck    = new ShuffleDeck(BUFF_VIDEO_URLS, rng);
  }

  /** No-op — kept for API compatibility; no per-round state to reset. */
  startRound(): void { /* no-op */ }

  /** Draw and return the next card. Safe to call multiple times per round. */
  nextCard(): CardDef {
    const result = this.outcomeCtrl.drawCard();

    if (result === 'bomb') {
      return { ...BOMB_CARD, videoUrl: this.bombDeck.next() };
    }

    if (result === 'viral_boost') {
      return { ...VIRAL_BOOST_CARD, videoUrl: this.buffDeck.next() };
    }

    const config = SAFE_CARDS_CONFIG[this.rng.nextInt(SAFE_CARDS_CONFIG.length)];
    const def    = this.styleCtrl.buildCardDef(config);
    return { ...def, videoUrl: this.safeDeck.next() };
  }
}
