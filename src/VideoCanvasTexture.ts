/**
 * VideoCanvasTexture — renders an <video> frame-by-frame into an offscreen
 * <canvas>, then exposes a PIXI.Texture backed by that canvas.
 * Zero PIXI VideoResource involvement — no canplay/play event loops possible.
 *
 * Extracted from Renderer.ts so VideoCache.ts can import it directly.
 */

import * as PIXI from 'pixi.js';

export class VideoCanvasTexture {
  readonly video:   HTMLVideoElement;
  readonly texture: PIXI.Texture;
  readonly sprite:  PIXI.Sprite;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx:    CanvasRenderingContext2D;
  private _destroyed    = false;
  private _playPromise: Promise<void> | null = null;

  constructor(url: string, cardW: number, cardH: number) {
    // Offscreen canvas sized to match the card's aspect ratio at ~360p.
    const cw = 360;
    const ch = Math.round(cw * (cardH / cardW));
    this.canvas = document.createElement('canvas');
    this.canvas.width  = cw;
    this.canvas.height = ch;
    this.ctx = this.canvas.getContext('2d')!;
    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(0, 0, cw, ch); // black until first frame

    // PIXI texture backed by the canvas — no VideoResource involved
    this.texture = PIXI.Texture.from(this.canvas);

    // Sprite fills the full card without distortion (canvas already matches AR)
    this.sprite        = new PIXI.Sprite(this.texture);
    this.sprite.width  = cardW;
    this.sprite.height = cardH;
    this.sprite.anchor.set(0.5);
    this.sprite.x = cardW / 2;
    this.sprite.y = cardH / 2;

    // Video element — never added to DOM
    this.video = document.createElement('video');
    this.video.crossOrigin = 'anonymous'; // required for canvas drawImage from CDN
    this.video.muted       = true;
    this.video.loop        = true;
    this.video.playsInline = true;
    this.video.autoplay    = true;
    this.video.preload     = 'auto';
    this.video.setAttribute('playsinline', '');
    this.video.setAttribute('muted',       '');
    this.video.setAttribute('autoplay',    '');
    this.video.src = url;
    this.video.load();
  }

  /**
   * Attempt autoplay. Idempotent — returns the in-flight promise if a play()
   * call is already pending, resolves immediately if already playing.
   * Rejects if the browser blocks autoplay (caller shows tap-to-play).
   */
  tryPlay(): Promise<void> {
    if (this._destroyed)          return Promise.resolve();
    if (!this.video.paused)       return Promise.resolve();
    if (this._playPromise)        return this._playPromise;
    this._playPromise = this.video.play().catch(err => {
      this._playPromise = null; // allow retry after user gesture
      throw err;
    });
    return this._playPromise;
  }

  /**
   * Draw the current video frame into the canvas and mark the texture dirty.
   * Must be called every render frame from the PIXI ticker — this is the ONLY
   * place that calls texture.baseTexture.update(), so no event re-entrancy.
   */
  tick(): void {
    if (this._destroyed) return;
    const v = this.video;
    if (v.readyState < 2 || v.paused || v.ended) return;
    try {
      const vw = v.videoWidth  || this.canvas.width;
      const vh = v.videoHeight || this.canvas.height;
      const cw = this.canvas.width;
      const ch = this.canvas.height;
      // Cover-crop: center-crop video into canvas
      const scale = Math.max(cw / vw, ch / vh);
      const sw    = cw / scale;
      const sh    = ch / scale;
      const sx    = (vw - sw) / 2;
      const sy    = (vh - sh) / 2;
      this.ctx.drawImage(v, sx, sy, sw, sh, 0, 0, cw, ch);
      this.texture.baseTexture.update();
    } catch {
      // CORS taint or decode error — silently skip frame
    }
  }

  /** Stop video and free PIXI + canvas resources. */
  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    this.video.pause();
    this.video.removeAttribute('src');
    this.video.load(); // abort pending network
    if (!this.texture.destroyed) this.texture.destroy(true); // also destroys baseTexture
  }

  get destroyed(): boolean { return this._destroyed; }
}
