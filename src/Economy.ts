/**
 * Economy — tracks per-session bigint monetary state.
 *
 * Balance is managed locally because the game backend is a pure game engine
 * that does not own wallets:
 *   - Starting balance comes from GET /options.
 *   - Bet is deducted at round start (startRound).
 *   - Win is credited at cashout/maxwin (applyCashoutFromBackend).
 *
 * Round value is driven by backend resp.acc_cents.
 * All values are in the currency's minimal subunit (bigint).
 * Formatting for display is handled by moneyFormat.ts, not here.
 */

// ── Legacy float constants (still exported for Simulation.ts) ────────────────
/** Fraction of bet that seeds the initial round value. */
export const HOUSE_EDGE = 0.95;
/** Hard cap multiplier: round value ≤ bet × MAX_MULT. */
export const MAX_MULT = 500;
/** Multiplier per normal safe swipe. */
export const NORMAL_SAFE_MULT = 1.1499;
/** Multiplier on a viral-boost swipe. */
export const VIRAL_BOOST_MULT = 10.0;
/** Default bet for simulation compat. */
export const SWIPE_COST = 10;

// ── Economy class ─────────────────────────────────────────────────────────────

export class Economy {
  /** Current wallet balance in subunits (bigint). */
  balance: bigint;
  /** Current round's accumulated value in subunits (bigint). 0 when no round active. */
  roundValue: bigint = 0n;
  /** How many cards have been seen in this round. */
  cardCount: number = 0;

  constructor(initialBalance: bigint) {
    this.balance = initialBalance;
  }

  /** True if balance can cover `bet`. */
  canAfford(bet: bigint): boolean {
    return this.balance >= bet;
  }

  /**
   * Deduct `bet` from balance at round start.
   * The round value is subsequently driven by backend responses.
   */
  startRound(bet: bigint): void {
    this.balance -= bet;
    this.roundValue = 0n;
    this.cardCount  = 0;
  }

  /**
   * Update round value and card count from the backend's acc_cents integer.
   * Replaces any local outcome computation.
   */
  setRoundValueFromBackend(accCents: bigint, step: number): void {
    this.roundValue = accCents;
    this.cardCount  = step;
  }

  /**
   * Credit the backend-authoritative win amount to balance.
   * Clears the round state and returns the gross amount credited.
   */
  applyCashoutFromBackend(accCents: bigint): bigint {
    this.balance   += accCents;
    this.roundValue = 0n;
    this.cardCount  = 0;
    return accCents;
  }

  /** Bomb hit — forfeit the round value (bet already deducted). */
  onBomb(): void {
    this.roundValue = 0n;
    this.cardCount  = 0;
  }
}
