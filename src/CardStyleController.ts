/**
 * CardStyleController — deterministically derives gradient colors, emoji,
 * and animation type from a card's id string.
 *
 * The same id always produces the same visual output (no hidden randomness).
 * Results are cached so textures are not reallocated per frame.
 */
import type { CardDef, CardAnimType } from './Card';
import type { SafeCardConfig } from './config/safeCards';
import { SAFE_VIDEO_URLS } from './config/videoCdnUrls';

// ── FNV-1a 32-bit hash ───────────────────────────────────────────────────────

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h = (h ^ s.charCodeAt(i)) >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

// ── HSL → #rrggbb ────────────────────────────────────────────────────────────

function hslToHex(h: number, s: number, l: number): string {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number): string => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

// ── Pools ─────────────────────────────────────────────────────────────────────

/** Animation types available for procedural safe cards (excludes special-purpose ones). */
const SAFE_ANIM_TYPES: CardAnimType[] = [
  'bounce', 'wobble', 'float', 'tilt', 'shimmer',
  'pulse', 'scanlines', 'sticker_pop', 'ring', 'sweep',
];

// ── Controller ────────────────────────────────────────────────────────────────

export class CardStyleController {
  private readonly cache = new Map<string, CardDef>();

  /** Build (or retrieve cached) CardDef from a SafeCardConfig. Deterministic. */
  buildCardDef(config: SafeCardConfig): CardDef {
    const cached = this.cache.get(config.id);
    if (cached) return cached;

    const h = hashString(config.id);

    // Colors — two different hues, dark TikTok-style palette
    const hue1 = (h & 0x1FF) % 360;
    const hue2 = (hue1 + 35 + ((h >> 9) & 0x3F)) % 360;
    const sat1  = 55 + ((h >> 15) & 0x1F);   // 55–86
    const sat2  = 45 + ((h >> 20) & 0x1F);   // 45–76
    const lit1  =  8 + ((h >> 25) & 0x07);   //  8–15
    const lit2  = 18 + ((h >> 28) & 0x07);   // 18–25

    const animType = SAFE_ANIM_TYPES[(h >> 12) % SAFE_ANIM_TYPES.length];
    const emoji    = config.icon?.trim() || '🛡️';
    // Round-robin across the 4 safe video URLs, keyed by card id hash
    const videoUrl = SAFE_VIDEO_URLS[h % SAFE_VIDEO_URLS.length];

    const def: CardDef = {
      id:       config.id,
      type:     'safe',
      emoji,
      headline: config.title.toUpperCase(),
      subline:  config.subtitle,
      colors:   [hslToHex(hue1, sat1, lit1), hslToHex(hue2, sat2, lit2)],
      animType,
      videoUrl,
    };

    this.cache.set(config.id, def);
    return def;
  }

  /** Clear the style cache (call on session reset if needed). */
  clearCache(): void {
    this.cache.clear();
  }
}
