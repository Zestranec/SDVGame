/**
 * Card type definitions and special (non-procedural) card instances.
 *
 * Normal safe cards are NOT defined here — they are generated procedurally
 * by CardStyleController from SAFE_CARDS_CONFIG in src/config/safeCards.ts.
 */
import { BOMB_VIDEO_URL, SAFE_VIDEO_URLS } from './config/videoCdnUrls';

export type CardAnimType =
  // Original animations
  | 'bounce'
  | 'wobble'
  | 'stamp'
  | 'steam'
  | 'chart'
  | 'ring'
  | 'sweep'
  | 'fire'
  | 'speech'
  | 'zoom'
  // Procedural safe-card animations
  | 'float'
  | 'tilt'
  | 'shimmer'
  | 'pulse'
  | 'scanlines'
  | 'sticker_pop'
  // Special-card animations
  | 'unknown_call'
  | 'viral_boost_anim'
  | 'intro';

export interface CardDef {
  id: string;
  /** 'safe' | 'viral_boost' → safe round; 'bomb' → loss; 'intro' → intro screen */
  type: 'safe' | 'bomb' | 'intro' | 'viral_boost';
  emoji: string;
  headline: string;
  subline: string;
  /** [topColor, bottomColor] gradient stops (CSS color strings). */
  colors: [string, string];
  animType: CardAnimType;
  /**
   * When set, overrides the standard MULT_PER_SWIPE economy multiplier.
   * Used by viral_boost (2.0×).
   */
  multiplierOverride?: number;
  /**
   * When present the card renders as a full-screen looping muted video
   * instead of the emoji/headline/subline text layout.
   */
  videoUrl?: string;
}

// ── UNKNOWN CALL — replaces the old bomb card ─────────────────────────────────

export const UNKNOWN_CALL_CARD: CardDef = {
  id:       'unknown_call',
  type:     'bomb',
  emoji:    '📱',
  headline: 'UNKNOWN NUMBER\nCALLING…',
  subline:  'Answer? Ignore? Regret forever.',
  colors:   ['#0d0005', '#1a000a'],
  animType: 'unknown_call',
  videoUrl: BOMB_VIDEO_URL,
};

// ── VIRAL BOOST — rare ultra-safe card with 2× multiplier ────────────────────

export const VIRAL_BOOST_CARD: CardDef = {
  id:                'viral_boost',
  type:              'viral_boost',
  emoji:             '⚡',
  headline:          'VIRAL BOOST!\n×2 MULTIPLIER',
  subline:           "You went viral! Everyone's watching.",
  colors:            ['#1a1100', '#2e1f00'],
  animType:          'viral_boost_anim',
  multiplierOverride: 2.0,
  videoUrl:          SAFE_VIDEO_URLS[0],
};

// ── Intro card ────────────────────────────────────────────────────────────────

export const INTRO_CARD: CardDef = {
  id:       'intro',
  type:     'intro',
  emoji:    '📲',
  headline: 'SWIPE TO BEGIN',
  subline:  'Swipe cost: 10 FUN\nDon\'t answer the unknown call!',
  colors:   ['#0d0d2b', '#1a1a4a'],
  animType: 'intro',
};
