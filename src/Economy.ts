// ── House-edge and multiplier constants ───────────────────────────────────────

/**
 * Fraction of the bet that seeds the round value.
 * Applying the 5% house edge once at round start (rather than per-draw) means
 * EV(cashout after N safe swipes) = HOUSE_EDGE × bet for any N ≥ 1.
 */
export const HOUSE_EDGE = 0.95;

/**
 * Hard cap: round value can never exceed bet × MAX_MULT.
 * Ensures no single round can return more than 500× the wager.
 */
export const MAX_MULT = 500;

/**
 * Multiplier applied to roundValue on a normal (non-viral-boost) safe swipe.
 *
 * Derived so that E[mult | safe] = 1 / (1 − BOMB_PROB) = 1/0.85 ≈ 1.1765:
 *   q   = VIRAL_BOOST_PROB_GIVEN_SAFE = 0.003
 *   VB  = VIRAL_BOOST_MULT = 10.0
 *   X   = (1.1765 − q × VB) / (1 − q)
 *       = (1.1765 − 0.03)   / 0.997
 *       ≈ 1.1499
 *
 * This keeps survival risk exactly compensated, making RTP ≈ HOUSE_EDGE
 * regardless of how many safe swipes the player takes before cashing out.
 */
export const NORMAL_SAFE_MULT = 1.1499;

/**
 * Multiplier applied on a viral_boost swipe.
 * Rare (0.3% conditional probability) but high-impact.
 * Must match VIRAL_BOOST_CARD.multiplierOverride in Card.ts.
 */
export const VIRAL_BOOST_MULT = 10.0;

/** Bet selector range and step (FUN). */
export const BET_MIN  = 10;
export const BET_MAX  = 200;
export const BET_STEP = 10;

export const SWIPE_COST      = BET_MIN; // kept for Simulation compat
export const STARTING_BALANCE = 1000;

export class Economy {
  balance: number;
  roundValue: number;
  /** How many safe cards have been seen in this round. */
  cardCount: number;
  /** Currently selected bet amount. */
  bet: number;

  constructor() {
    this.balance    = STARTING_BALANCE;
    this.roundValue = 0;
    this.cardCount  = 0;
    this.bet        = SWIPE_COST;
  }

  get canStartRound(): boolean {
    return this.balance >= this.bet;
  }

  /**
   * Deduct bet and seed the round value with the house-edge-adjusted amount.
   * Starting at bet × HOUSE_EDGE (not bet) is the single point where the 5%
   * edge is applied, making EV depth-invariant.
   */
  startRound(): void {
    this.balance   -= this.bet;
    this.roundValue = this.bet * HOUSE_EDGE;
    this.cardCount  = 0;
  }

  /**
   * Called after each safe card (including viral_boost).
   * @param multiplierOverride  10.0 for viral_boost; omit for normal safe.
   */
  onSafeCard(multiplierOverride?: number): void {
    const mult = multiplierOverride ?? NORMAL_SAFE_MULT;
    this.roundValue = Math.min(this.roundValue * mult, this.bet * MAX_MULT);
    this.cardCount++;
  }

  /** Player cashes out. Returns the gross amount credited to balance. */
  cashout(): number {
    const gross = this.roundValue;
    this.balance   += gross;
    this.roundValue = 0;
    this.cardCount  = 0;
    return gross;
  }

  /** Bomb hit — round value is forfeited. */
  onBomb(): void {
    this.roundValue = 0;
    this.cardCount  = 0;
  }

  /**
   * Cumulative multiplier relative to the edge-adjusted starting value.
   * Starts at 1.0 after the first safe card and grows with each subsequent safe.
   */
  get multiplier(): number {
    const start = this.bet * HOUSE_EDGE;
    return start > 0 ? +(this.roundValue / start).toFixed(4) : 1;
  }

  /** True when the round value has been clamped to the ×500 cap. */
  get isMaxWin(): boolean {
    return this.roundValue >= this.bet * MAX_MULT - 0.001;
  }

  get roundValueStr(): string { return this.roundValue.toFixed(2); }
  get balanceStr():    string { return this.balance.toFixed(2); }
}
