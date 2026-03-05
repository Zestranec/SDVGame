/**
 * VideoCache — LRU cache of VideoCanvasTexture instances keyed by CDN URL.
 *
 * Phase 1 strategy: preload SAFE videos only (never bomb/buff) so
 * the preload set gives no information about the next outcome.
 *
 * Lifecycle of a cached entry:
 *   1. preload(url) → creates vcTex, starts network fetch + silent play.
 *   2. take(url)    → caller (Renderer.primeCard) removes entry and takes ownership.
 *   3. Eviction     → when cache is full, LRU entry is destroyed.
 *   4. clear()      → on game destroy; all entries destroyed.
 *
 * Enabled only when import.meta.env.VITE_VIDEO_PRELOAD === '1'.
 * Set that in .env.development to enable during development/QA.
 *
 * Phase 2 note (NOT implemented):
 *   To fully anti-spoof outcomes, preload 1 safe + 1 bomb + 1 buff at round
 *   start regardless of outcome so the preload set is always the same cardinality
 *   and mix. Implement by exposing a `preloadFullMix()` method here and calling
 *   it from Game.beginRound().
 */

import { VideoCanvasTexture } from './VideoCanvasTexture';

/** Default maximum number of simultaneously cached vcTex instances. */
const DEFAULT_MAX_SIZE = 6;

interface CacheEntry {
  readonly vcTex: VideoCanvasTexture;
  lastAccess: number; // ms since epoch, updated on take()
}

export class VideoCache {
  private readonly entries = new Map<string, CacheEntry>();
  private readonly maxSize: number;
  private autoplayUnlocked = false;

  /** Whether video pre-loading is enabled (controlled by VITE_VIDEO_PRELOAD env). */
  readonly enabled: boolean;

  constructor(maxSize = DEFAULT_MAX_SIZE) {
    this.maxSize = maxSize;
    this.enabled = import.meta.env.VITE_VIDEO_PRELOAD === '1';
  }

  // ── Autoplay state ─────────────────────────────────────────────────────────

  /**
   * Called synchronously inside a user-gesture handler (before any await).
   * After this, new preload() calls will invoke tryPlay() on the vcTex so
   * the video starts buffering immediately without waiting for a gesture.
   * Existing cached entries are also told to start playing.
   */
  setAutoplayUnlocked(): void {
    if (this.autoplayUnlocked) return;
    this.autoplayUnlocked = true;
    // Kick off play on anything already in cache
    for (const { vcTex } of this.entries.values()) {
      vcTex.tryPlay().catch(() => {});
    }
  }

  // ── Core API ───────────────────────────────────────────────────────────────

  /**
   * Start preloading a URL in the background.
   * No-op if: feature disabled, URL empty, already cached.
   * If the cache is full, evicts the LRU entry first.
   * Does NOT add the vcTex to the PIXI stage or activeVcTextures — it only
   * prepares the underlying video element and canvas buffer.
   */
  preload(url: string): void {
    if (!this.enabled || !url || this.entries.has(url)) return;

    if (this.entries.size >= this.maxSize) {
      this.evictLRU();
    }

    const w    = window.innerWidth;
    const h    = window.innerHeight;
    const vcTex = new VideoCanvasTexture(url, w, h);

    if (this.autoplayUnlocked) {
      // Start silent play so the browser buffers aggressively.
      vcTex.tryPlay().catch(() => {});
    }

    this.entries.set(url, { vcTex, lastAccess: Date.now() });

    if (import.meta.env.DEV) {
      console.debug(`[VideoCache] preload +${this.entries.size}/${this.maxSize}`, url.split('/').pop());
    }
  }

  /**
   * Take a vcTex from the cache (cache gives up ownership; caller is responsible
   * for eventual destroy()).  Updates lastAccess and removes the entry.
   * Returns null on cache miss.
   */
  take(url: string): VideoCanvasTexture | null {
    const entry = this.entries.get(url);
    if (!entry) return null;

    this.entries.delete(url);

    if (import.meta.env.DEV) {
      console.debug(`[VideoCache] HIT  (${this.entries.size}/${this.maxSize})`, url.split('/').pop());
    }

    return entry.vcTex;
  }

  /** Number of entries currently in cache. */
  get size(): number { return this.entries.size; }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  /**
   * Destroy all cached entries and clear the map.
   * Call on game teardown to ensure no orphaned video elements / event listeners.
   */
  clear(): void {
    for (const { vcTex } of this.entries.values()) {
      vcTex.destroy();
    }
    this.entries.clear();

    if (import.meta.env.DEV) {
      console.debug('[VideoCache] cleared');
    }
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  /** Evict the entry with the oldest lastAccess timestamp. */
  private evictLRU(): void {
    let oldestKey  = '';
    let oldestTime = Infinity;

    for (const [key, entry] of this.entries) {
      if (entry.lastAccess < oldestTime) {
        oldestTime = entry.lastAccess;
        oldestKey  = key;
      }
    }

    if (!oldestKey) return;

    const evicted = this.entries.get(oldestKey)!;
    evicted.vcTex.destroy();
    this.entries.delete(oldestKey);

    if (import.meta.env.DEV) {
      console.debug('[VideoCache] evict LRU', oldestKey.split('/').pop());
    }
  }
}
