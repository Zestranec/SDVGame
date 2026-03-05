/**
 * Maps backend content_id strings → CDN video URLs.
 * Backend is the authoritative source of which content_id to play;
 * this file is the single place that translates IDs to actual URLs.
 *
 * Naming convention:
 *   safe_1..safe_16  — safe card clips
 *   bomb_1..bomb_5   — bomb_1 falls back to bomb.mp4 (generic); rest are numbered
 *   buff_1..buff_4   — buff_1 falls back to buff.mp4 (generic); rest are numbered
 */

const CDN = 'https://pub-4a4885e8e4e64fb483dce40965673cff.r2.dev/';

const CONTENT_MAP: Record<string, string> = {
  // Safe clips (safe_9 intentionally omitted from CDN; map to safe_1 as fallback)
  safe_1:  'safe_1.mp4',
  safe_2:  'safe_2.mp4',
  safe_3:  'safe_3.mp4',
  safe_4:  'safe_4.mp4',
  safe_5:  'safe_5.mp4',
  safe_6:  'safe_6.mp4',
  safe_7:  'safe_7.mp4',
  safe_8:  'safe_8.mp4',
  safe_9:  'safe_1.mp4',   // safe_9 not on CDN → fallback
  safe_10: 'safe_10.mp4',
  safe_11: 'safe_11.mp4',
  safe_12: 'safe_12.mp4',
  safe_13: 'safe_13.mp4',
  safe_14: 'safe_14.mp4',
  safe_15: 'safe_15.mp4',
  safe_16: 'safe_16.mp4',

  // Bomb clips (bomb_1 → generic bomb.mp4)
  bomb_1: 'bomb.mp4',
  bomb_2: 'bomb_2.mp4',
  bomb_3: 'bomb_3.mp4',
  bomb_4: 'bomb_4.mp4',
  bomb_5: 'bomb_5.mp4',

  // Buff / viral-boost clips (buff_1 → generic buff.mp4)
  buff_1: 'buff.mp4',
  buff_2: 'buff_2.mp4',
  buff_3: 'buff_3.mp4',
  buff_4: 'buff_4.mp4',
};

/**
 * Resolve a backend content_id to a full CDN URL.
 * Falls back to safe_1.mp4 and logs a warning for unknown IDs.
 */
export function contentUrl(contentId: string): string {
  const file = CONTENT_MAP[contentId];
  if (!file) {
    console.warn(`[contentPool] Unknown content_id "${contentId}" — falling back to safe_1.mp4`);
    return CDN + 'safe_1.mp4';
  }
  return CDN + file;
}

/**
 * Returns all unique safe-clip CDN URLs (safe_1..safe_16, deduplicated by URL).
 * Used by the video preloader to pick random safe videos to warm up.
 * Bomb / buff URLs are intentionally excluded so preloads never reveal
 * the next outcome.
 */
export function allSafeUrls(): string[] {
  const seen = new Set<string>();
  for (let i = 1; i <= 16; i++) {
    seen.add(contentUrl(`safe_${i}`));
  }
  return [...seen];
}
