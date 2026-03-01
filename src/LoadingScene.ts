/// <reference types="vite/client" />
import * as PIXI from 'pixi.js';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Minimum time the loading screen stays visible (ms). */
export const LOADING_MIN_MS = 1500;

const BAR_MAX_W = 280;
const BAR_H     = 6;

// Resolves to an absolute URL that works on both dev server and GitHub Pages subpaths.
const LOGO_URL = new URL(
  `${import.meta.env.BASE_URL}assets/loading/z_logo.png`,
  window.location.href,
).toString();

/** Exported so Renderer can pre-warm PIXI.Texture.from() with the same URL key. */
export const CAT_RULES_URL = new URL(
  `${import.meta.env.BASE_URL}assets/loading/Cat_rules.png`,
  window.location.href,
).toString();

// ── LoadingScene ──────────────────────────────────────────────────────────────

/**
 * Full-screen loading overlay rendered by PixiJS.
 *
 * Usage:
 *   const scene = new LoadingScene(renderer.app);
 *   await scene.loadAssets();          // loads logo (resolves even on failure)
 *   scene.setProgress(0 … 1);          // drive bar from outside
 *   scene.destroy();                   // removes container + listeners
 */
export class LoadingScene {
  readonly container: PIXI.Container;

  private readonly bg:       PIXI.Graphics;
  private readonly barTrack: PIXI.Graphics;
  private readonly barFill:  PIXI.Graphics;
  private logo:              PIXI.Sprite | null = null;
  private progress           = 0;
  private readonly onResize: () => void;

  constructor(private readonly app: PIXI.Application) {
    this.container = new PIXI.Container();
    this.bg        = new PIXI.Graphics();
    this.barTrack  = new PIXI.Graphics();
    this.barFill   = new PIXI.Graphics();

    // Render order: bg → (logo inserted here after load) → bar track → bar fill
    this.container.addChild(this.bg);
    this.container.addChild(this.barTrack);
    this.container.addChild(this.barFill);

    // Add on top of all existing stage children (cardLayer, effectLayer, etc.)
    app.stage.addChild(this.container);

    this.onResize = () => this._layout();
    window.addEventListener('resize', this.onResize);

    this._layout();
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Load the logo texture and pre-cache the intro card image.
   * Always resolves — loading screen continues without logo on failure.
   */
  async loadAssets(): Promise<void> {
    const [logoResult] = await Promise.allSettled([
      PIXI.Assets.load<PIXI.Texture>(LOGO_URL),
      // Pre-cache Cat_rules so buildTextCard can use PIXI.Texture.from() synchronously
      PIXI.Assets.load<PIXI.Texture>(CAT_RULES_URL),
    ]);

    if (logoResult.status === 'fulfilled') {
      const sprite = new PIXI.Sprite(logoResult.value);
      sprite.anchor.set(0.5);
      this.logo = sprite;
      // Insert at index 1 → above bg, below bar elements
      this.container.addChildAt(sprite, 1);
      this._layout();
    }
  }

  /** Update the progress bar. p ∈ [0, 1]. */
  setProgress(p: number): void {
    this.progress = Math.max(0, Math.min(1, p));
    this._drawBar();
  }

  /** Remove from stage and free all display objects. */
  destroy(): void {
    window.removeEventListener('resize', this.onResize);
    this.app.stage.removeChild(this.container);
    this.container.destroy({ children: true });
  }

  // ── Layout ─────────────────────────────────────────────────────────────────

  private _layout(): void {
    const { width: W, height: H } = this.app.screen;

    // Solid black background
    this.bg.clear();
    this.bg.beginFill(0x000000);
    this.bg.drawRect(0, 0, W, H);
    this.bg.endFill();

    // Logo — centred slightly above mid-screen
    if (this.logo) {
      const maxW  = Math.min(W * 0.55, 320);
      const scale = maxW / this.logo.texture.width;
      this.logo.scale.set(scale);
      this.logo.x = W / 2;
      this.logo.y = H * 0.44;
    }

    this._drawBar();
  }

  /** Y position for the top of the progress bar. */
  private _barY(): number {
    if (this.logo) {
      // 24 px gap below logo bottom edge
      return this.logo.y + this.logo.height / 2 + 24;
    }
    return this.app.screen.height * 0.56;
  }

  private _drawBar(): void {
    const W    = this.app.screen.width;
    const barW = Math.min(W * 0.5, BAR_MAX_W);
    const x    = (W - barW) / 2;
    const y    = this._barY();

    // Track (dim grey rounded rect)
    this.barTrack.clear();
    this.barTrack.beginFill(0x2a2a2a);
    this.barTrack.drawRoundedRect(x, y, barW, BAR_H, BAR_H / 2);
    this.barTrack.endFill();

    // Fill (white)
    this.barFill.clear();
    if (this.progress > 0) {
      this.barFill.beginFill(0xffffff, 0.9);
      this.barFill.drawRoundedRect(
        x, y,
        Math.max(BAR_H, barW * this.progress),  // never narrower than pill radius
        BAR_H,
        BAR_H / 2,
      );
      this.barFill.endFill();
    }
  }
}
