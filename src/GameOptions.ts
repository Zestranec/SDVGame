/**
 * GameOptions — centralises all runner/server-supplied configuration.
 *
 * In production the runner injects a `window.__GAME_OPTIONS__` object
 * before the game bundle loads. In dev/demo mode the defaults below
 * are used (matching backend/config.yml demo-token).
 *
 * All monetary values are bigint in the currency's minimal subunit.
 */

import type { CurrencyOptions } from './moneyFormat';

// ── Type ──────────────────────────────────────────────────────────────────────

export interface RunnerOptions {
  /** Available bet values in minimal subunits, ascending. */
  availableBets: bigint[];
  /** Currency descriptor (subunits, exponent, code). */
  currency: CurrencyOptions;
  /** Starting wallet balance in minimal subunits. */
  initialBalance: bigint;
}

// ── Injection hook (production runner) ───────────────────────────────────────

declare global {
  interface Window {
    /**
     * The runner sets this before the game bundle executes.
     * Fields mirror RunnerOptions but with plain numbers (JSON-serialisable):
     *   available_bets: number[]
     *   currency: { subunits: number; exponent: number; code?: string; symbol?: string }
     *   balance: number   (in subunits)
     */
    __GAME_OPTIONS__?: {
      available_bets: number[];
      currency: { subunits: number; exponent: number; code?: string; symbol?: string };
      balance: number;
    };
  }
}

// ── Defaults (dev / demo-token) ───────────────────────────────────────────────

/**
 * Matches backend/config.yml demo-token:
 *   balance: 1000 FUN → 100000 subunits (subunits=100)
 *   bet_limits: [10, 20, 50, 100, 200] FUN → [1000, 2000, 5000, 10000, 20000] subunits
 */
export const DEFAULT_OPTIONS: RunnerOptions = {
  availableBets:  [1000n, 2000n, 5000n, 10000n, 20000n],
  currency: {
    subunits: 100,
    exponent: 2,
    code:     'FUN',
    symbol:   '',
  },
  initialBalance: 100000n,
};

// ── Resolver ──────────────────────────────────────────────────────────────────

/**
 * Returns the active RunnerOptions.
 * Reads from `window.__GAME_OPTIONS__` if present; otherwise returns DEFAULT_OPTIONS.
 */
export function resolveRunnerOptions(): RunnerOptions {
  const raw = window.__GAME_OPTIONS__;
  if (!raw) return DEFAULT_OPTIONS;

  return {
    availableBets:  raw.available_bets.map(v => BigInt(v)),
    currency: {
      subunits: raw.currency.subunits,
      exponent: raw.currency.exponent,
      code:     raw.currency.code,
      symbol:   raw.currency.symbol,
    },
    initialBalance: BigInt(raw.balance),
  };
}
