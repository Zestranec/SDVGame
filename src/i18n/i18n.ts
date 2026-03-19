/**
 * i18n — lightweight locale system backed by Vite's import.meta.glob.
 *
 * Usage:
 *   import { t, setLocale, getLocale, getRulesText } from './i18n/i18n';
 *
 *   await setLocale(runnerLocale)             // once at boot, before first render
 *   t('popupWinTitle')                        → 'NICE!'
 *   t('cashoutBtn', { amount: '10.00' })      → '💰 Take Profit (+10.00)'
 *   getLocale().dogMessages                   → ['snack?', ...]
 *   getRulesText()                            → locale-specific rules string
 *
 * Adding a new locale (no code changes outside this directory):
 *   1. Create src/i18n/<code>.ts  satisfying `Locale`, with `export default`.
 *   2. Create src/i18n/rules/<code>.ts  with translated rules text, with `export default`.
 *   Vite's glob picks them up automatically at the next build.
 */

import { EN } from './en';
import { RULES_EN } from './rules/en';

// ── Locale type ───────────────────────────────────────────────────────────────

/** Shape every locale object must satisfy. */
export type Locale = {
  [K in keyof typeof EN]: typeof EN[K] extends readonly string[] ? readonly string[] : string;
};

/** Keys whose value is a plain string (excludes array fields like dogMessages). */
export type LocaleStringKey = {
  [K in keyof Locale]: Locale[K] extends string ? K : never;
}[keyof Locale];

// ── Glob maps — resolved by Vite at build time ────────────────────────────────
// i18n.ts itself is excluded; only peer locale files (e.g. en.ts, es.ts) remain.

const localeModules = import.meta.glob<{ default: Locale }>(['./*.ts', '!./i18n.ts']);
const rulesModules  = import.meta.glob<{ default: string }>('./rules/*.ts');

// ── Active locale state ───────────────────────────────────────────────────────

let _code    = 'en';
let _strings: Locale = EN;
let _rules   = RULES_EN;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Load and activate a locale by its BCP-47 code.
 *
 * - Normalises: lower-case, strip region tag ('es-ES' → 'es').
 * - If the locale file exists, loads it and switches strings + rules text.
 * - If the file is missing OR loading fails, silently keeps English.
 * - Safe to call with null / undefined (keeps English).
 */
export async function setLocale(code: string | null | undefined): Promise<void> {
  if (!code) return;

  const base = code.toLowerCase().split('-')[0]; // 'es-ES' → 'es'
  if (base === _code) return; // already active

  if (base === 'en') {
    _strings = EN;
    _rules   = RULES_EN;
    _code    = 'en';
    return;
  }

  // ── Load locale strings ───────────────────────────────────────────────────
  const localeLoader = localeModules[`./${base}.ts`];
  if (localeLoader) {
    try {
      const mod = await localeLoader();
      if (mod.default && typeof mod.default === 'object') {
        _strings = mod.default;
        _code    = base;
      }
    } catch {
      // Loading failed — stay on current locale (English at boot).
      if (import.meta.env.DEV) {
        console.debug(`[i18n] locale "${base}" failed to load — using EN`);
      }
      return;
    }
  }
  // If no loader is registered the locale file simply doesn't exist; keep EN.

  // ── Load rules text (independent — keep EN rules if this fails) ───────────
  const rulesLoader = rulesModules[`./rules/${base}.ts`];
  if (rulesLoader) {
    try {
      const mod = await rulesLoader();
      if (typeof mod.default === 'string') _rules = mod.default;
    } catch {
      // keep English rules text
    }
  }
}

/** Returns the full current locale object (needed for array fields). */
export function getLocale(): Locale {
  return _strings;
}

/**
 * Translate a string key with optional placeholder substitution.
 * Placeholders are written as {name} in the locale string.
 *
 * @example t('cashoutBtn', { amount: '10.00' }) → '💰 Take Profit (+10.00)'
 */
export function t(key: LocaleStringKey, vars?: Record<string, string | number>): string {
  const str = _strings[key] as string;
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
}

/** Returns the rules page text for the current locale, falling back to English. */
export function getRulesText(): string {
  return _rules;
}
