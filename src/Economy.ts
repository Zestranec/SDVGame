/**
 * Economy — tracks per-session bigint monetary state.
 *
 * Balance is authoritative from the Runner (set by Game.ts after each runner response).
 * Round value is driven by runner resp.acc_cents.
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
  /** Current wallet balance in subunits (bigint). Set from runner responses. */
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
   * Reset round state at round start.
   * Balance is managed externally via runner responses — not touched here.
   */
  onRoundStart(): void {
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

  /** Bomb hit — forfeit the round value. Balance is set externally. */
  onBomb(): void {
    this.roundValue = 0n;
    this.cardCount  = 0;
  }

  // ── Kept for backward compat (Simulation.ts / tests) ──────────────────────

  /**
   * Deduct `bet` from balance at round start.
   * @deprecated Use onRoundStart() in Runner flow — balance comes from runner.
   */
  startRound(bet: bigint): void {
    this.balance -= bet;
    this.roundValue = 0n;
    this.cardCount  = 0;
  }

  /**
   * Credit the backend-authoritative win amount to balance.
   * @deprecated In Runner flow, set economy.balance directly from runner response.
   */
  applyCashoutFromBackend(accCents: bigint): bigint {
    this.balance   += accCents;
    this.roundValue = 0n;
    this.cardCount  = 0;
    return accCents;
  }
}
