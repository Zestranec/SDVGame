/**
 * moneyFormat — exact integer-based currency formatting.
 *
 * All monetary values are represented as bigint subunits
 * (e.g. 1050 with subunits=100 → "10.50").
 * No floating-point arithmetic is used for monetary amounts;
 * conversion to float happens only when producing a display string.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CurrencyOptions {
  /** Number of subunits per whole unit, e.g. 100 for USD (cents), 100000 for mBTC. */
  subunits: number;
  /**
   * Minimum decimal places to always display.
   * Matches the currency's exponent, e.g. 2 for USD, 4 for mBTC index.
   */
  exponent: number;
  /** ISO currency code shown in UI, e.g. "USD", "FUN", "mBTC". */
  code?: string;
  /** Currency symbol shown in UI, e.g. "$", "m₿". */
  symbol?: string;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/** Returns floor(log10(subunits)) = number of decimal places subunits represents. */
function maxDecimalsFor(subunits: number): number {
  // subunits must be a power of 10 per spec (100, 1000, 100000…)
  return Math.round(Math.log10(subunits));
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns the minimum number of decimal places needed to represent
 * `valueInt / subunits` exactly (up to the precision implied by `subunits`).
 *
 * Examples (subunits = 100000):
 *   countRequiredDecimals(1200n, 100000n)  → 3  (0.012)
 *   countRequiredDecimals(12345n, 100000n) → 5  (0.12345)
 *   countRequiredDecimals(100000000n, 100000n) → 0 (integer value)
 */
export function countRequiredDecimals(valueInt: bigint, subunits: bigint): number {
  const maxD = Math.round(Math.log10(Number(subunits)));
  if (valueInt === 0n) return 0;

  let rem = valueInt % subunits;
  if (rem < 0n) rem = -rem;
  if (rem === 0n) return 0;

  // Count trailing decimal zeros by repeatedly dividing rem by 10
  let needed = maxD;
  while (needed > 0 && rem % 10n === 0n) {
    rem /= 10n;
    needed--;
  }
  return needed;
}

/**
 * Format `valueInt / currency.subunits` as a decimal string.
 *
 * - Never rounds: uses integer division only.
 * - Always shows at least `minDecimals` places (padded with zeros).
 * - If `trimTrailingZeros = true`: uses max(minDecimals, countRequiredDecimals(value))
 *   so trailing zeros beyond the exact representation are removed —
 *   but minDecimals is still the floor.
 * - Never shows more decimals than log10(subunits).
 *
 * Examples (subunits=100000, exponent=4):
 *   formatAmount(1000n, cur, 4, false)  → "0.0100"   (bet display, no trim)
 *   formatAmount(1000n, cur, 5, false)  → "0.01000"
 *   formatAmount(1200n, cur, 4, true)   → "0.0120"   (win, trim respects feDecimals=4)
 *   formatAmount(12345n, cur, 4, true)  → "0.12345"  (exact requires 5 > feDecimals)
 *   formatAmount(12345n, cur, 6, true)  → "0.123450" (feDecimals=6 pads beyond exact)
 */
export function formatAmount(
  valueInt: bigint,
  currency: CurrencyOptions,
  minDecimals: number,
  trimTrailingZeros: boolean,
): string {
  const sub     = BigInt(currency.subunits);
  const maxD    = maxDecimalsFor(currency.subunits);
  const isNeg   = valueInt < 0n;
  const absVal  = isNeg ? -valueInt : valueInt;

  const intPart  = absVal / sub;
  const fracPart = absVal % sub;

  // Full fractional string, zero-padded to maxD digits (exact subunit precision)
  const fullFrac = fracPart.toString().padStart(maxD, '0');

  // Determine how many decimal places to show.
  // trimTrailingZeros=false: exactly minDecimals (pad with zeros if needed).
  // trimTrailingZeros=true:  max(minDecimals, countRequired) — expands for exact
  //   representation but never shrinks below minDecimals (feDecimals floor).
  // targetD may legally exceed maxD when feDecimals > subunit precision; the
  // extra places are zero-padded (consistent column widths across bets/wins).
  let targetD = minDecimals;

  if (trimTrailingZeros) {
    const required = countRequiredDecimals(absVal, sub);
    targetD = Math.max(targetD, required);
  }

  // Build fractional string — pad with trailing zeros if targetD > maxD
  let fracStr: string;
  if (targetD <= 0) {
    fracStr = '';
  } else if (targetD <= maxD) {
    fracStr = fullFrac.slice(0, targetD);
  } else {
    fracStr = fullFrac + '0'.repeat(targetD - maxD);
  }

  let result = intPart.toString();
  if (targetD > 0) {
    result += '.' + fracStr;
  }

  return (isNeg ? '-' : '') + result;
}

/**
 * Compute the FE_CALC_DECIMALS used for consistent bet/win display.
 *
 * Finds the maximum decimal precision required across all available bets
 * and all possible win amounts (from paytable or max-win computation).
 * The result is clamped to at least `currency.exponent`.
 *
 * Pass an empty `possibleWins` array when no paytable is available.
 */
export function computeFeDecimals(
  availableBets: bigint[],
  possibleWins: bigint[],
  currency: CurrencyOptions,
): number {
  const sub = BigInt(currency.subunits);
  let maxReq = 0;

  for (const b of availableBets) {
    maxReq = Math.max(maxReq, countRequiredDecimals(b, sub));
  }
  for (const w of possibleWins) {
    maxReq = Math.max(maxReq, countRequiredDecimals(w, sub));
  }

  return Math.max(currency.exponent, maxReq);
}

// ── DEV self-check ────────────────────────────────────────────────────────────

/**
 * In DEV mode, verify that formatting a value and parsing it back
 * gives exactly the original integer. Logs an error if rounding occurred.
 */
export function devAssertNoRounding(
  label: string,
  valueInt: bigint,
  currency: CurrencyOptions,
  formatted: string,
): void {
  if (!import.meta.env.DEV) return;

  const maxD = maxDecimalsFor(currency.subunits);
  const sub  = BigInt(currency.subunits);

  const isNeg  = formatted.startsWith('-');
  const clean  = isNeg ? formatted.slice(1) : formatted;
  const [intStr = '0', fracStr = ''] = clean.split('.');

  const paddedFrac  = fracStr.padEnd(maxD, '0').slice(0, maxD);
  const intPart     = BigInt(intStr);
  const fracInt     = BigInt(paddedFrac);
  const reconstructed = intPart * sub + fracInt;
  const expected    = valueInt < 0n ? -valueInt : valueInt;

  if (reconstructed !== expected) {
    console.error(
      `[moneyFormat] ROUNDING DETECTED — ${label}: ` +
      `${valueInt} formatted as "${formatted}" reconstructs to ${isNeg ? '-' : ''}${reconstructed}`,
    );
  }
}
