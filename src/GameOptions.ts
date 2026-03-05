/**
 * GameOptions — single mutable runtime store for all runner-supplied config.
 *
 * Populated once by `gameOptions.populateFromInit(initResult)` inside Game.boot().
 * Updated incrementally by `gameOptions.mergeFromInfo(infoResult)` on each poll.
 *
 * All monetary values (balance, bets) are bigint in the currency's minimal subunit.
 * No "FUN" is hardcoded here — currency comes entirely from the runner.
 */

/// <reference types="vite/client" />

import { computeFeDecimals, type CurrencyOptions } from './moneyFormat';
import type {
  RunnerInitResult,
  RunnerInfoResult,
  RunnerFreebets,
  RunnerUrls,
} from './runnerClient';
import { toBigInt } from './runnerClient';

// ── Store class ───────────────────────────────────────────────────────────────

class GameOptionsStore {
  // ── Identity ────────────────────────────────────────────────────────────
  token = '';

  // ── Currency ─────────────────────────────────────────────────────────────
  currency: CurrencyOptions = { subunits: 100, exponent: 2, code: '' };
  /** Pre-computed FE display decimals (used by moneyFormat throughout). */
  feDecimals = 2;

  // ── Bet list ──────────────────────────────────────────────────────────────
  availableBets: bigint[] = [];
  defaultBet: bigint = 0n;
  /** Index into availableBets — mutated directly by the bet selector. */
  selectedBetIndex = 0;

  /** raw freebets_limits from init.config (array or keyed object). */
  freebetsLimits: unknown = null;

  // ── Session state ─────────────────────────────────────────────────────────
  balance: bigint = 0n;
  freebets: RunnerFreebets | null = null;

  // ── Locale / navigation ───────────────────────────────────────────────────
  locale?: string;
  urls?: RunnerUrls;

  /** True once populateFromInit has been called successfully. */
  ready = false;

  // ── Computed getters ──────────────────────────────────────────────────────

  get selectedBet(): bigint {
    return this.availableBets[this.selectedBetIndex] ?? this.defaultBet;
  }

  // ── Populate from Runner init ─────────────────────────────────────────────

  populateFromInit(result: RunnerInitResult): void {
    const ca = result.currency_attributes;
    this.currency = {
      subunits: ca.subunits,
      exponent: ca.exponent,
      code:     ca.code,
      symbol:   ca.symbol,
    };

    const rawBets   = result.config.bet_limits ?? [];
    this.availableBets = rawBets.map(v => BigInt(v));

    const rawDefault    = result.config.default_bet;
    this.defaultBet     = rawDefault != null ? BigInt(rawDefault) : (this.availableBets[0] ?? 0n);

    // Start on the default bet
    const defIdx = this.availableBets.findIndex(b => b === this.defaultBet);
    this.selectedBetIndex = defIdx >= 0 ? defIdx : 0;

    this.freebetsLimits = result.config.freebets_limits ?? null;
    this.balance        = toBigInt(result.balance);
    this.freebets       = result.freebets ?? null;
    this.locale         = result.locale;
    this.urls           = result.urls;

    this._recomputeDecimals();
    this.ready = true;
  }

  // ── Merge from Runner info ────────────────────────────────────────────────

  /**
   * Merge an info response into the store.
   * Never overrides selectedBetIndex unless the bet list itself changes.
   * Returns a summary of what changed (for DEV logging).
   */
  mergeFromInfo(result: RunnerInfoResult): { balanceChanged: boolean; currencyChanged: boolean; betsChanged: boolean } {
    let balanceChanged  = false;
    let currencyChanged = false;
    let betsChanged     = false;

    // Balance (always present)
    const newBalance = toBigInt(result.balance);
    if (newBalance !== this.balance) {
      this.balance   = newBalance;
      balanceChanged = true;
    }

    // Freebets (optional)
    if ('freebets' in result) {
      this.freebets = result.freebets ?? null;
    }

    // State lock handled by RunnerClient automatically

    // Currency (optional, handle index changes)
    if (result.currency_attributes) {
      const ca = result.currency_attributes;
      if (ca.code !== this.currency.code || ca.subunits !== this.currency.subunits) {
        this.currency = { subunits: ca.subunits, exponent: ca.exponent, code: ca.code, symbol: ca.symbol };
        this._recomputeDecimals();
        currencyChanged = true;
      }
    }

    // Bet limits (optional — rebuild only if the list actually changed)
    if (result.config?.bet_limits) {
      const newBets  = result.config.bet_limits.map(v => BigInt(v));
      const changed  = newBets.length !== this.availableBets.length ||
                       newBets.some((b, i) => b !== this.availableBets[i]);
      if (changed) {
        const prev    = this.selectedBet;
        this.availableBets = newBets;
        // Keep the same bet value if it still exists; else fall back to default
        const newIdx  = newBets.findIndex(b => b === prev);
        const defIdx  = newBets.findIndex(b => b === this.defaultBet);
        this.selectedBetIndex = newIdx >= 0 ? newIdx : defIdx >= 0 ? defIdx : 0;
        if (result.config.freebets_limits !== undefined) {
          this.freebetsLimits = result.config.freebets_limits ?? null;
        }
        this._recomputeDecimals();
        betsChanged = true;
      }
    }

    // Locale / URLs
    if (result.locale) this.locale = result.locale;
    if (result.urls)   this.urls   = { ...this.urls, ...result.urls };

    return { balanceChanged, currencyChanged, betsChanged };
  }

  // ── Freebet helpers ───────────────────────────────────────────────────────

  /** True when the player has at least one freebet remaining. */
  shouldUseFreebet(): boolean {
    const fb = this.freebets;
    return fb != null && (fb.issued - fb.done) > 0;
  }

  /**
   * Returns the bet amount for the current freebet level.
   * Falls back to selectedBet if no limits are defined.
   */
  getFreebetBet(): bigint {
    const fb     = this.freebets;
    const limits = this.freebetsLimits;
    if (!fb || !limits) return this.selectedBet;

    const level = fb.bet_level;
    let raw: number | undefined;

    if (Array.isArray(limits)) {
      raw = (limits as number[])[level];
    } else if (typeof limits === 'object' && limits !== null) {
      raw = (limits as Record<number, number>)[level];
    }

    return raw != null ? BigInt(raw) : this.selectedBet;
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private _recomputeDecimals(): void {
    const maxWins = this.availableBets.map(b => b * 500n);
    this.feDecimals = computeFeDecimals(this.availableBets, maxWins, this.currency);
  }
}

// ── Singleton export ──────────────────────────────────────────────────────────

export const gameOptions = new GameOptionsStore();

// ── Backward-compat types (keep for anything still importing RunnerOptions) ───

export type { CurrencyOptions };
/** @deprecated Use gameOptions singleton instead. */
export interface RunnerOptions {
  availableBets:  bigint[];
  currency:       CurrencyOptions;
  initialBalance: bigint;
}
