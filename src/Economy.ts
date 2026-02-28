export const SWIPE_COST = 10;
export const STARTING_BALANCE = 1000;
export const MULT_PER_SWIPE = 1.1;
/** Multiplier applied when a viral_boost card is revealed (overrides MULT_PER_SWIPE). */
export const VIRAL_BOOST_MULT = 2.0;

export class Economy {
  balance: number;
  roundValue: number;
  /** How many real cards have been seen in this round (0 = round not started). */
  cardCount: number;

  constructor() {
    this.balance = STARTING_BALANCE;
    this.roundValue = 0;
    this.cardCount = 0;
  }

  get canStartRound(): boolean {
    return this.balance >= SWIPE_COST;
  }

  /**
   * Called when the player initiates a round (first swipe from intro).
   * Deducts the swipe cost, sets roundValue = SWIPE_COST.
   */
  startRound(): void {
    this.balance -= SWIPE_COST;
    this.roundValue = SWIPE_COST;
    this.cardCount = 0; // incremented after each safe card via onSafeCard()
  }

  /**
   * Called after each safe card is revealed (including viral_boost).
   * @param multiplierOverride  Use this multiplier instead of MULT_PER_SWIPE
   *                           (pass VIRAL_BOOST_MULT for viral_boost cards).
   */
  onSafeCard(multiplierOverride?: number): void {
    this.roundValue *= multiplierOverride ?? MULT_PER_SWIPE;
    this.cardCount++;
  }

  /**
   * Player cashes out.
   * Adds roundValue to balance and returns the gross amount received.
   */
  cashout(): number {
    const gross = this.roundValue;
    this.balance += gross;
    this.roundValue = 0;
    this.cardCount = 0;
    return gross; // total received (not just profit)
  }

  /**
   * Bomb hit — round value is forfeited.
   */
  onBomb(): void {
    this.roundValue = 0;
    this.cardCount = 0;
  }

  /** Current multiplier (1.1^safeCardsRevealed). */
  get multiplier(): number {
    return +Math.pow(MULT_PER_SWIPE, this.cardCount).toFixed(4);
  }

  /** Formatted round value string. */
  get roundValueStr(): string {
    return this.roundValue.toFixed(2);
  }

  /** Formatted balance string. */
  get balanceStr(): string {
    return this.balance.toFixed(2);
  }
}
