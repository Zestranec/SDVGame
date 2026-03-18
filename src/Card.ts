/**
 * Card type definitions and special card instances.
 *
 * Gameplay cards (safe / bomb / viral_boost) are always video-based.
 * SAFE_CARD_BASE provides the minimal non-video fields required by CardDef
 * so gameplay code can build a safe CardDef without any text-card logic.
 * The intro card retains its full text/image fields for the title screen.
 */

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
  /**
   * When present, renders a PIXI.Sprite image in place of the emoji text.
   * Path is relative to the Vite base URL (e.g. 'assets/loading/Cat_rules.png').
   * The image must be pre-loaded by LoadingScene before buildTextCard runs.
   */
  imagePath?: string;
}

// ── Safe gameplay card base (video-only) ──────────────────────────────────────

/**
 * Minimal CardDef template for safe gameplay cards.
 * All safe cards are video-based; the legacy text fields are empty placeholders
 * that are never rendered (Renderer routes videoUrl cards to buildVideoCard).
 * Spread this and add { id, videoUrl } to build a safe card.
 */
export const SAFE_CARD_BASE: Omit<CardDef, 'videoUrl'> = {
  id:       'safe',
  type:     'safe',
  emoji:    '',
  headline: '',
  subline:  '',
  colors:   ['#0d0005', '#1a000a'],
  animType: 'float',
};

// ── BOMB CARD ─────────────────────────────────────────────────────────────────

export const BOMB_CARD: CardDef = {
  id:       'bomb',
  type:     'bomb',
  emoji:    '💥',
  headline: 'BUSTED!',
  subline:  'The bomb dropped. Round over.',
  colors:   ['#0d0005', '#1a000a'],
  animType: 'float', // no-op for video card; video content carries the drama
  // videoUrl injected per-draw by ReelEngine
};

// ── VIRAL BOOST — rare ultra-safe card with 2× multiplier ────────────────────

export const VIRAL_BOOST_CARD: CardDef = {
  id:                'viral_boost',
  type:              'viral_boost',
  emoji:             '⚡',
  headline:          'VIRAL BOOST!\n×10 MULTIPLIER',
  subline:           "You went viral! Everyone's watching.",
  colors:            ['#1a1100', '#2e1f00'],
  animType:          'viral_boost_anim',
  multiplierOverride: 10.0, // must match VIRAL_BOOST_MULT in Economy.ts
  // videoUrl injected per-draw by ReelEngine
};

// ── Intro card ────────────────────────────────────────────────────────────────

export const INTRO_CARD: CardDef = {
  id:        'intro',
  type:      'intro',
  emoji:     '',
  headline:  'POSITIVE DOOMSCROLLING',
  subline:   "Cute critters = safe.\nAgent in the feed = busted.\nScroll responsibly.",
  colors:    ['#0d0d2b', '#1a1a4a'],
  animType:  'intro',
  imagePath: 'assets/loading/Cat_rules.png',
};
