import * as PIXI from 'pixi.js';
import type { CardDef, CardAnimType } from './Card';

// ── Helpers ──────────────────────────────────────────────────────────────────

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - Math.min(t, 1), 3);
}

function drawStar(g: PIXI.Graphics, cx: number, cy: number, spikes: number, outerR: number, innerR: number): void {
  const pts: number[] = [];
  const step = Math.PI / spikes;
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const a = i * step - Math.PI / 2;
    pts.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  g.drawPolygon(pts);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// ── Card builder ─────────────────────────────────────────────────────────────

interface CardObjects {
  container: PIXI.Container;
  bg: PIXI.Sprite;
  emoji: PIXI.Text;
  headline: PIXI.Text;
  subline: PIXI.Text;
  animLayer: PIXI.Container;
  /** Present on video cards — drives canvas texture updates and cleanup. */
  vcTex?: VideoCanvasTexture;
}

function makeGradientTexture(w: number, h: number, colors: [string, string]): PIXI.Texture {
  const cv = document.createElement('canvas');
  cv.width = Math.max(2, Math.ceil(w));
  cv.height = Math.max(2, Math.ceil(h));
  const ctx = cv.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, 0, cv.height);
  grad.addColorStop(0, colors[0]);
  grad.addColorStop(1, colors[1]);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, cv.width, cv.height);
  return PIXI.Texture.from(cv);
}

const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",system-ui,sans-serif';
const TEXT_FONT  = '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif';

// ── Text card (original layout: gradient + emoji + headline + subline) ─────────

function buildTextCard(w: number, h: number, def: CardDef): CardObjects {
  const container = new PIXI.Container();

  // Background
  const texture = makeGradientTexture(w, h, def.colors);
  const bg = new PIXI.Sprite(texture);
  bg.width = w;
  bg.height = h;
  container.addChild(bg);

  // Subtle noise / particle dot overlay
  const dots = new PIXI.Graphics();
  for (let i = 0; i < 40; i++) {
    const alpha = 0.04 + Math.random() * 0.06;
    dots.beginFill(0xffffff, alpha);
    dots.drawCircle(Math.random() * w, Math.random() * h, 1 + Math.random() * 2);
    dots.endFill();
  }
  container.addChild(dots);

  // Emoji (large, centered upper portion)
  const emojiFontSize = Math.round(Math.min(w, h) * 0.18);
  const emoji = new PIXI.Text(def.emoji, {
    fontFamily: EMOJI_FONT,
    fontSize: emojiFontSize,
  });
  emoji.anchor.set(0.5);
  emoji.x = w / 2;
  emoji.y = h * 0.30;
  container.addChild(emoji);

  // Headline
  const headlineFontSize = Math.round(Math.min(w * 0.068, 26));
  const headline = new PIXI.Text(def.headline, new PIXI.TextStyle({
    fontFamily: TEXT_FONT,
    fontWeight: '900',
    fontSize: headlineFontSize,
    fill: 0xffffff,
    align: 'center',
    wordWrap: true,
    wordWrapWidth: w * 0.82,
    dropShadow: true,
    dropShadowColor: 0x000000,
    dropShadowBlur: 6,
    dropShadowDistance: 2,
    leading: 4,
  }));
  headline.anchor.set(0.5);
  headline.x = w / 2;
  headline.y = h * 0.54;
  container.addChild(headline);

  // Subline
  const sublineFontSize = Math.round(Math.min(w * 0.042, 16));
  const subline = new PIXI.Text(def.subline, new PIXI.TextStyle({
    fontFamily: TEXT_FONT,
    fontSize: sublineFontSize,
    fill: 0xbbbbbb,
    align: 'center',
    wordWrap: true,
    wordWrapWidth: w * 0.76,
    leading: 3,
  }));
  subline.anchor.set(0.5);
  subline.x = w / 2;
  subline.y = h * 0.655;
  container.addChild(subline);

  // Animation layer (on top)
  const animLayer = new PIXI.Container();
  container.addChild(animLayer);

  return { container, bg, emoji, headline, subline, animLayer };
}

// ── VideoCanvasTexture ─────────────────────────────────────────────────────────
// Renders an <video> frame-by-frame into an offscreen <canvas>, then exposes a
// PIXI.Texture backed by that canvas.  Zero PIXI VideoResource involvement —
// no canplay/play event loops possible.

class VideoCanvasTexture {
  readonly video:   HTMLVideoElement;
  readonly texture: PIXI.Texture;
  readonly sprite:  PIXI.Sprite;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx:    CanvasRenderingContext2D;
  private _destroyed     = false;
  private _playAttempted = false;

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
    this.video.setAttribute('playsinline', '');
    this.video.preload     = 'auto';
    this.video.src         = url;
    this.video.load();
  }

  /**
   * Attempt autoplay (once). Returns a Promise that rejects if blocked,
   * so callers can show a tap-to-play affordance.
   */
  tryPlay(): Promise<void> {
    if (this._playAttempted || this._destroyed) return Promise.resolve();
    this._playAttempted = true;
    return this.video.play();
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
      const sw = cw / scale;
      const sh = ch / scale;
      const sx = (vw - sw) / 2;
      const sy = (vh - sh) / 2;
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
}

// ── Video card (full-screen looping video via canvas texture) ──────────────────

function buildVideoCard(w: number, h: number, def: CardDef): CardObjects {
  const container = new PIXI.Container();

  // Clip mask — prevents sprite overflow during slide transition
  const clipMask = new PIXI.Graphics();
  clipMask.beginFill(0xffffff);
  clipMask.drawRect(0, 0, w, h);
  clipMask.endFill();
  container.addChild(clipMask);
  container.mask = clipMask;

  // Canvas-backed video texture (no PIXI VideoResource)
  const vcTex = new VideoCanvasTexture(def.videoUrl!, w, h);
  container.addChild(vcTex.sprite);

  // Attempt autoplay; show tap hint if blocked
  vcTex.tryPlay().catch(() => {
    if (container.destroyed) return;
    const tap = new PIXI.Text('▶  Tap to play', new PIXI.TextStyle({
      fontFamily: TEXT_FONT, fontSize: 18, fontWeight: '700',
      fill: 0xffffff, dropShadow: true, dropShadowBlur: 10,
      dropShadowColor: 0x000000, dropShadowDistance: 0,
    }));
    tap.anchor.set(0.5);
    tap.x = w / 2;
    tap.y = h / 2;
    container.addChild(tap);
    document.addEventListener('pointerdown', () => {
      vcTex.video.play().catch(() => {});
      if (!tap.destroyed) tap.destroy();
    }, { once: true });
  });

  // Animation overlay layer (rings/stars/badges for bomb & viral_boost)
  const animLayer = new PIXI.Container();
  container.addChild(animLayer);

  // Invisible dummy Text satisfies CardObjects interface and gives animation
  // functions (viral_boost_anim) a valid position anchor.
  const dummy = new PIXI.Text('', { fontSize: 1 });
  dummy.visible = false;
  dummy.x = w / 2;
  dummy.y = h * 0.35;
  container.addChild(dummy);

  return { container, bg: vcTex.sprite, emoji: dummy, headline: dummy, subline: dummy, animLayer, vcTex };
}

// ── Dispatcher: text or video based on def.videoUrl ───────────────────────────

function buildCard(w: number, h: number, def: CardDef): CardObjects {
  return def.videoUrl ? buildVideoCard(w, h, def) : buildTextCard(w, h, def);
}

// ── Cleanup helper (pauses video before PIXI destroy) ─────────────────────────

function destroyCard(objs: CardObjects): void {
  objs.vcTex?.destroy();
  objs.container.destroy({ children: true });
}

// ── Animation setups ──────────────────────────────────────────────────────────

type AnimFn = (delta: number) => void;
type Cleanup = () => void;

function setupAnim(type: CardAnimType, objs: CardObjects, w: number, h: number): AnimFn {
  const { emoji, headline, animLayer } = objs;
  let t = 0;

  switch (type) {
    // ── 1. Bounce (Productivity Guru) ────────────────────────────────────────
    case 'bounce': {
      const baseY = emoji.y;
      return (dt) => {
        t += dt * 0.05;
        emoji.y = baseY + Math.sin(t * 3) * 14;
        emoji.rotation = Math.sin(t * 2.5) * 0.06;
      };
    }

    // ── 2. Wobble + droplets (Hydration) ─────────────────────────────────────
    case 'wobble': {
      const baseY = emoji.y;
      type Drop = { g: PIXI.Graphics; x: number; y: number; speed: number };
      const drops: Drop[] = [];
      for (let i = 0; i < 7; i++) {
        const g = new PIXI.Graphics();
        g.beginFill(0x40c8ff); g.drawEllipse(0, 0, 4, 7); g.endFill();
        const x = w * 0.5 + (Math.random() - 0.5) * 70;
        g.x = x; g.y = baseY + 50 + Math.random() * 30;
        animLayer.addChild(g);
        drops.push({ g, x, y: g.y, speed: 1 + Math.random() * 1.5 });
      }
      return (dt) => {
        t += dt * 0.04;
        emoji.rotation = Math.sin(t * 4) * 0.13;
        emoji.y = baseY + Math.sin(t * 2) * 9;
        drops.forEach(d => {
          d.y += d.speed * dt * 0.4;
          d.g.y = d.y;
          d.g.x = d.x + Math.sin(t * 2 + d.x * 0.05) * 4;
          const rel = (d.y - (baseY + 50)) / 70;
          d.g.alpha = Math.max(0, 1 - rel);
          if (d.y > baseY + 120) { d.y = baseY + 50; d.g.alpha = 0; }
        });
      };
    }

    // ── 3. Stamp (Cat CEO) ───────────────────────────────────────────────────
    case 'stamp': {
      const stamp = new PIXI.Text('APPROVED', new PIXI.TextStyle({
        fontFamily: TEXT_FONT, fontWeight: '900', fontSize: 32,
        fill: 0x22cc55, stroke: 0x005522, strokeThickness: 3,
      }));
      stamp.anchor.set(0.5);
      stamp.x = w / 2 + 10; stamp.y = h * 0.46;
      stamp.rotation = -0.2; stamp.alpha = 0;
      animLayer.addChild(stamp);

      let timer = 0; let phase: 'idle' | 'slam' | 'hold' | 'fade' = 'idle';
      let phaseT = 0;
      return (dt) => {
        t += dt * 0.016;
        timer += dt * 0.016;
        if (phase === 'idle' && timer > 1.5) { phase = 'slam'; phaseT = 0; timer = 0; }
        if (phase === 'slam') {
          phaseT += dt * 0.12;
          stamp.alpha = 1;
          stamp.scale.set(lerp(2.0, 1.0, easeOutCubic(phaseT)));
          if (phaseT >= 1) { phase = 'hold'; phaseT = 0; }
        } else if (phase === 'hold') {
          phaseT += dt * 0.016;
          if (phaseT > 0.6) { phase = 'fade'; phaseT = 0; }
        } else if (phase === 'fade') {
          phaseT += dt * 0.04;
          stamp.alpha = Math.max(0, 1 - phaseT);
          if (stamp.alpha <= 0) { phase = 'idle'; timer = 0; }
        }
      };
    }

    // ── 4. Steam (Ramen) ─────────────────────────────────────────────────────
    case 'steam': {
      type Puff = { g: PIXI.Graphics; x: number; y: number; life: number; r: number; drift: number };
      const puffs: Puff[] = [];
      const baseY = emoji.y + emoji.height * 0.35;
      return (dt) => {
        t += dt * 0.016;
        // Spawn
        if (puffs.length < 12 && Math.random() < 0.25) {
          const g = new PIXI.Graphics();
          const px = w * 0.5 + (Math.random() - 0.5) * 50;
          g.x = px; g.y = baseY;
          animLayer.addChild(g);
          puffs.push({ g, x: px, y: baseY, life: 1, r: 8 + Math.random() * 8, drift: (Math.random() - 0.5) * 0.4 });
        }
        for (let i = puffs.length - 1; i >= 0; i--) {
          const p = puffs[i];
          p.life -= dt * 0.018;
          p.y -= dt * 0.5;
          p.x += p.drift;
          p.g.x = p.x; p.g.y = p.y;
          p.g.clear();
          p.g.beginFill(0xffffff, p.life * 0.25);
          p.g.drawCircle(0, 0, p.r * (2 - p.life));
          p.g.endFill();
          if (p.life <= 0) { p.g.destroy(); puffs.splice(i, 1); }
        }
      };
    }

    // ── 5. Chart + rocket (Crypto Bro) ───────────────────────────────────────
    case 'chart': {
      const cx = w * 0.15, cy = h * 0.73, cw = w * 0.7, step = cw / 9;
      const pts: [number, number][] = [];
      for (let i = 0; i <= 9; i++) {
        pts.push([cx + i * step, cy - (Math.random() * 30 + i * 4 - 20)]);
      }
      const chartG = new PIXI.Graphics();
      animLayer.addChild(chartG);

      const rocket = new PIXI.Text('🚀', { fontFamily: EMOJI_FONT, fontSize: 22 });
      rocket.anchor.set(0.5);
      animLayer.addChild(rocket);

      let progress = 0;
      return (dt) => {
        t += dt * 0.04;
        progress += dt * 0.015;
        if (progress > 1) progress = 0;
        const endIdx = Math.floor(progress * pts.length);
        chartG.clear();
        if (endIdx > 0) {
          chartG.lineStyle(2.5, 0x00ff88);
          chartG.moveTo(pts[0][0], pts[0][1]);
          for (let i = 1; i <= Math.min(endIdx, pts.length - 1); i++) {
            chartG.lineTo(pts[i][0], pts[i][1]);
          }
        }
        rocket.x = w * 0.5 + 50;
        rocket.y = emoji.y + 10 + Math.sin(t * 3) * 9;
        rocket.rotation = Math.sin(t * 3) * 0.12;
      };
    }

    // ── 6. Ring (Mindfulness) ────────────────────────────────────────────────
    case 'ring': {
      const ringG = new PIXI.Graphics();
      animLayer.addChild(ringG);
      const cx = w / 2, cy = emoji.y;
      return (dt) => {
        t += dt * 0.016;
        ringG.clear();
        for (let r = 0; r < 3; r++) {
          const phase = t * 1.8 + r * (Math.PI * 2 / 3);
          const scale = 0.6 + Math.sin(phase) * 0.4;
          const alpha = 0.15 + Math.abs(Math.sin(phase)) * 0.25;
          const radius = (50 + r * 30) * scale;
          ringG.lineStyle(2, 0xcc88ff, alpha);
          ringG.drawCircle(cx, cy, radius);
        }
      };
    }

    // ── 7. Sweep (Cleaning Hack) ─────────────────────────────────────────────
    case 'sweep': {
      type Spark = { g: PIXI.Graphics; vx: number; vy: number; life: number };
      const sparks: Spark[] = [];
      let sweepX = -60;
      return (dt) => {
        t += dt * 0.016;
        sweepX += dt * 4;
        if (sweepX > w + 60) sweepX = -60;

        if (sparks.length < 24 && Math.random() < 0.35) {
          const g = new PIXI.Graphics();
          g.beginFill(0xffffff);
          drawStar(g, 0, 0, 4, 5, 2);
          g.endFill();
          g.x = sweepX + (Math.random() - 0.5) * 18;
          g.y = h * 0.42 + (Math.random() - 0.5) * 50;
          animLayer.addChild(g);
          sparks.push({ g, vx: (Math.random() - 0.5) * 2, vy: -1 - Math.random() * 1.5, life: 1 });
        }
        for (let i = sparks.length - 1; i >= 0; i--) {
          const s = sparks[i];
          s.life -= dt * 0.04;
          s.g.x += s.vx; s.g.y += s.vy;
          s.g.alpha = s.life;
          s.g.rotation += 0.1;
          if (s.life <= 0) { s.g.destroy(); sparks.splice(i, 1); }
        }
      };
    }

    // ── 8. Fire particles (Pizza) ─────────────────────────────────────────────
    case 'fire': {
      type Flame = { g: PIXI.Graphics; x: number; y: number; vx: number; vy: number; life: number; sz: number };
      const flames: Flame[] = [];
      const baseY = h * 0.71;
      return (dt) => {
        t += dt * 0.016;
        if (flames.length < 20) {
          const g = new PIXI.Graphics();
          const x = w * 0.5 + (Math.random() - 0.5) * 80;
          g.x = x; g.y = baseY;
          animLayer.addChild(g);
          flames.push({ g, x, y: baseY, vx: (Math.random() - 0.5) * 1.2, vy: -(1.5 + Math.random() * 2), life: 1, sz: 5 + Math.random() * 8 });
        }
        for (let i = flames.length - 1; i >= 0; i--) {
          const f = flames[i];
          f.life -= dt * 0.022;
          f.x += f.vx; f.y += f.vy;
          f.g.x = f.x; f.g.y = f.y;
          f.g.clear();
          const col = Math.random() < 0.5 ? 0xff6600 : 0xff3300;
          f.g.beginFill(col, f.life * 0.75);
          f.g.drawCircle(0, 0, f.sz * f.life);
          f.g.endFill();
          if (f.life <= 0) { f.g.destroy(); flames.splice(i, 1); }
        }
      };
    }

    // ── 9. Speech bubbles (Dog Translator) ───────────────────────────────────
    case 'speech': {
      const msgs = ["snack?", "snack!", "walk?", "treat?", "ball?"];
      type Bubble = { c: PIXI.Container; life: number; vy: number };
      const bubbles: Bubble[] = [];
      let spawnT = 0;
      return (dt) => {
        t += dt * 0.016;
        spawnT += dt * 0.016;
        if (spawnT > 1.3 && bubbles.length < 4) {
          spawnT = 0;
          const c = new PIXI.Container();
          const bg = new PIXI.Graphics();
          bg.beginFill(0xffffff, 0.92);
          bg.drawRoundedRect(0, 0, 82, 30, 8);
          bg.endFill();
          // tail
          bg.beginFill(0xffffff, 0.92);
          bg.drawPolygon([8, 30, 18, 30, 13, 41]);
          bg.endFill();
          const txt = new PIXI.Text(msgs[Math.floor(Math.random() * msgs.length)], {
            fontFamily: TEXT_FONT, fontSize: 13, fontWeight: '700', fill: 0x222222,
          });
          txt.x = 8; txt.y = 7;
          c.addChild(bg); c.addChild(txt);
          c.x = w * 0.5 + (Math.random() - 0.5) * 90 - 41;
          c.y = emoji.y + 50; c.alpha = 0;
          animLayer.addChild(c);
          bubbles.push({ c, life: 1, vy: -0.4 });
        }
        for (let i = bubbles.length - 1; i >= 0; i--) {
          const b = bubbles[i];
          b.life -= dt * 0.013;
          b.c.y += b.vy;
          b.c.alpha = Math.min(1, b.life < 0.25 ? b.life * 4 : b.life < 0.5 ? 1 : (1 - b.life) * 2 + b.life);
          b.c.alpha = b.life > 0.8 ? (1 - b.life) * 5 : b.life < 0.25 ? b.life * 4 : 1;
          if (b.life <= 0) { b.c.destroy({ children: true }); bubbles.splice(i, 1); }
        }
      };
    }

    // ── 10. Zoom pulse (Drama Clip) ───────────────────────────────────────────
    case 'zoom': {
      const baseEmojiY = emoji.y; // capture once — avoids drift
      return (dt) => {
        t += dt * 0.016;
        const z = 1 + Math.sin(t * 2.8) * 0.045;
        emoji.scale.set(z * 1.15);
        emoji.y = baseEmojiY + Math.sin(t * 2.8) * 4;
        headline.scale.set(1 + Math.sin(t * 2.8 + 0.5) * 0.02);
      };
    }

    // ── 11. Float (gentle vertical bob) ──────────────────────────────────────
    case 'float': {
      const baseY = emoji.y;
      return (dt) => {
        t += dt * 0.016;
        emoji.y = baseY + Math.sin(t * 1.2) * 8;
        emoji.rotation = Math.sin(t * 0.8) * 0.03;
      };
    }

    // ── 12. Tilt (rotation oscillation) ──────────────────────────────────────
    case 'tilt': {
      return (dt) => {
        t += dt * 0.016;
        emoji.rotation = Math.sin(t * 1.5) * 0.18;
        headline.rotation = Math.sin(t * 1.5 + 0.4) * 0.02;
      };
    }

    // ── 13. Shimmer (diagonal light sweep) ────────────────────────────────────
    case 'shimmer': {
      const shimG = new PIXI.Graphics();
      animLayer.addChild(shimG);
      return (dt) => {
        t += dt * 0.016;
        const x = ((t * 0.22) % 1) * (w + 80) - 40;
        shimG.clear();
        shimG.beginFill(0xffffff, 0.09);
        shimG.drawPolygon([
          Math.max(0, x - 25), 0,
          Math.min(w, x + 45),  0,
          Math.min(w, x + 25),  h,
          Math.max(0, x - 45),  h,
        ]);
        shimG.endFill();
        emoji.alpha = 0.88 + Math.sin(t * 2) * 0.12;
      };
    }

    // ── 14. Pulse (scale pulsing) ─────────────────────────────────────────────
    case 'pulse': {
      const baseY = emoji.y;
      return (dt) => {
        t += dt * 0.016;
        const s = 1 + Math.sin(t * 2.4) * 0.12;
        emoji.scale.set(s);
        emoji.y = baseY + Math.sin(t * 2.4) * 5;
      };
    }

    // ── 15. Scanlines (horizontal scan-line sweep) ────────────────────────────
    case 'scanlines': {
      const scanG = new PIXI.Graphics();
      animLayer.addChild(scanG);
      return (dt) => {
        t += dt * 0.016;
        scanG.clear();
        const scanY = (t * 55) % (h + 16);
        for (let y = scanY - h; y < h; y += 10) {
          scanG.beginFill(0xffffff, 0.055);
          scanG.drawRect(0, y, w, 2);
          scanG.endFill();
        }
        emoji.scale.set(1 + Math.sin(t * 1.1) * 0.04);
      };
    }

    // ── 16. Sticker pop (emoji bursts in, then loops) ─────────────────────────
    case 'sticker_pop': {
      emoji.scale.set(0);
      let waitT = 0;
      let popT  = 0;
      let phase: 'wait' | 'expand' | 'settle' | 'idle' | 'reset' = 'wait';
      return (dt) => {
        t += dt * 0.016;
        if (phase === 'wait') {
          waitT += dt * 0.016;
          if (waitT > 0.4) { phase = 'expand'; popT = 0; }
        } else if (phase === 'expand') {
          popT += dt * 0.10;
          emoji.scale.set(easeOutCubic(Math.min(popT, 1)) * 1.25);
          if (popT >= 1) { phase = 'settle'; popT = 0; }
        } else if (phase === 'settle') {
          popT += dt * 0.12;
          emoji.scale.set(1.25 - 0.25 * easeOutCubic(Math.min(popT, 1)));
          if (popT >= 1) { phase = 'idle'; waitT = 0; }
        } else if (phase === 'idle') {
          emoji.scale.set(1 + Math.sin(t * 1.5) * 0.05);
          waitT += dt * 0.016;
          if (waitT > 4.5) { phase = 'reset'; popT = 0; }
        } else { // reset: shrink to 0, then wait again
          popT += dt * 0.10;
          emoji.scale.set(Math.max(0, 1 - easeOutCubic(Math.min(popT, 1))));
          if (popT >= 1) { phase = 'wait'; waitT = 0; popT = 0; }
        }
      };
    }

    // ── Viral Boost (rare golden card) ────────────────────────────────────────
    case 'viral_boost_anim': {
      const cx    = w / 2;
      const emojiCy = emoji ? emoji.y : h * 0.35;
      type GoldStar = { g: PIXI.Graphics; x: number; y: number; vy: number; vx: number; rot: number };
      const stars: GoldStar[] = [];
      const glowG = new PIXI.Graphics();
      animLayer.addChild(glowG);

      return (dt) => {
        t += dt * 0.016;

        // Spawn golden stars raining down
        if (stars.length < 30 && Math.random() < 0.45) {
          const g = new PIXI.Graphics();
          const sz = 4 + Math.random() * 6;
          g.beginFill(Math.random() < 0.5 ? 0xffd700 : 0xffaa00);
          drawStar(g, 0, 0, 5, sz, sz * 0.4);
          g.endFill();
          g.x = Math.random() * w; g.y = -12;
          animLayer.addChild(g);
          stars.push({ g, x: g.x, y: g.y, vy: 1.5 + Math.random() * 2.5, vx: (Math.random() - 0.5) * 1.2, rot: 0 });
        }
        for (let i = stars.length - 1; i >= 0; i--) {
          const s = stars[i];
          s.y += s.vy; s.x += s.vx; s.rot += 0.06;
          s.g.x = s.x; s.g.y = s.y; s.g.rotation = s.rot;
          if (s.y > h + 16) { s.g.destroy(); stars.splice(i, 1); }
        }

        // Pulsing golden glow ring
        glowG.clear();
        const glowAlpha = 0.18 + Math.sin(t * 3.5) * 0.12;
        glowG.lineStyle(7, 0xffd700, glowAlpha);
        glowG.drawCircle(cx, emojiCy, 48 + Math.sin(t * 3.5) * 9);

        // Emoji pulse
        emoji.scale.set(1.08 + Math.sin(t * 2.2) * 0.10);
        emoji.rotation = Math.sin(t * 1.4) * 0.06;
      };
    }

    // ── Intro ─────────────────────────────────────────────────────────────────
    case 'intro': {
      return (dt) => {
        t += dt * 0.016;
        emoji.scale.set(1 + Math.sin(t * 1.5) * 0.07);
        emoji.rotation = Math.sin(t * 0.9) * 0.04;
      };
    }

    default:
      return () => {};
  }
}

// ── Renderer class ────────────────────────────────────────────────────────────

export class Renderer {
  readonly app: PIXI.Application;
  private cardLayer: PIXI.Container;
  private effectLayer: PIXI.Container;
  private currentObjs: CardObjects | null = null;
  private currentAnimFn: AnimFn | null = null;
  private isTransitioning = false;
  /** All live VideoCanvasTexture instances — ticked every frame. */
  private readonly activeVcTextures = new Set<VideoCanvasTexture>();

  constructor(canvas: HTMLCanvasElement) {
    this.app = new PIXI.Application({
      view: canvas,
      resizeTo: window,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
      backgroundColor: 0x000000,
      antialias: true,
    });

    this.cardLayer = new PIXI.Container();
    this.effectLayer = new PIXI.Container();
    this.app.stage.addChild(this.cardLayer);
    this.app.stage.addChild(this.effectLayer);

    this.app.ticker.add((dt) => {
      if (this.currentAnimFn) this.currentAnimFn(dt);
      // Pump all live video canvas textures (the ONLY place update() is called)
      for (const vct of this.activeVcTextures) vct.tick();
    });
  }

  get width(): number { return this.app.screen.width; }
  get height(): number { return this.app.screen.height; }

  /** Register a card's vcTex into the active set so the ticker drives it. */
  private registerCard(objs: CardObjects): void {
    if (objs.vcTex) this.activeVcTextures.add(objs.vcTex);
  }

  /** Remove from active set and destroy. */
  private unregisterAndDestroy(objs: CardObjects): void {
    if (objs.vcTex) this.activeVcTextures.delete(objs.vcTex);
    destroyCard(objs);
  }

  /** Instantly replace the current card (no transition). */
  showCard(def: CardDef): void {
    this.clearCard();
    const objs = buildCard(this.width, this.height, def);
    this.cardLayer.addChild(objs.container);
    this.currentObjs = objs;
    this.currentAnimFn = setupAnim(def.animType, objs, this.width, this.height);
    this.registerCard(objs);
  }

  /** Slide current card up, slide new card in from bottom. Returns Promise. */
  async transitionTo(def: CardDef): Promise<void> {
    if (this.isTransitioning) return;
    this.isTransitioning = true;

    const w = this.width, h = this.height;
    const outgoing = this.currentObjs;
    this.currentAnimFn = null; // pause idle anim during transition

    const incoming = buildCard(w, h, def);
    this.registerCard(incoming); // start ticking the new card immediately
    incoming.container.y = h;
    incoming.container.scale.set(1.03);
    this.cardLayer.addChild(incoming.container);

    await new Promise<void>((resolve) => {
      let t = 0;
      const DURATION = 22; // frames at 60fps ≈ 0.37s

      const tick: AnimFn = (dt) => {
        t += dt;
        const prog = easeOutCubic(Math.min(t / DURATION, 1));

        if (outgoing) outgoing.container.y = -h * prog;
        incoming.container.y = h * (1 - prog);
        incoming.container.scale.set(lerp(1.03, 1.0, prog));

        if (t >= DURATION) {
          this.app.ticker.remove(tick);
          if (outgoing) this.unregisterAndDestroy(outgoing);
          this.currentObjs = incoming;
          this.currentAnimFn = setupAnim(def.animType, incoming, w, h);
          this.isTransitioning = false;
          resolve();
        }
      };

      this.app.ticker.add(tick);
    });
  }

  // ── Effects ───────────────────────────────────────────────────────────────

  /** Screen-shake effect (bomb). */
  shake(intensity = 18, durationFrames = 28): void {
    const stage = this.app.stage;
    let t = 0;
    const tick: AnimFn = (dt) => {
      t += dt;
      const dec = 1 - Math.min(t / durationFrames, 1);
      stage.x = (Math.random() - 0.5) * intensity * dec;
      stage.y = (Math.random() - 0.5) * intensity * dec;
      if (t >= durationFrames) {
        this.app.ticker.remove(tick);
        stage.x = 0; stage.y = 0;
      }
    };
    this.app.ticker.add(tick);
  }

  /** Glitch line effect (bomb). */
  glitchLines(count = 6, durationFrames = 35): void {
    const lines: PIXI.Graphics[] = [];
    for (let i = 0; i < count; i++) {
      const g = new PIXI.Graphics();
      g.beginFill(0xff0000, 0.6 + Math.random() * 0.3);
      g.drawRect(0, Math.random() * this.height, this.width, 2 + Math.random() * 4);
      g.endFill();
      this.effectLayer.addChild(g);
      lines.push(g);
    }
    let t = 0;
    const tick: AnimFn = (dt) => {
      t += dt;
      const dec = 1 - Math.min(t / durationFrames, 1);
      lines.forEach(l => { l.alpha = dec; l.x = (Math.random() - 0.5) * 12; });
      if (t >= durationFrames) {
        this.app.ticker.remove(tick);
        lines.forEach(l => l.destroy());
      }
    };
    this.app.ticker.add(tick);
  }

  /** Coin burst (cashout win). */
  celebrateCashout(): void {
    const COINS = 28;
    type Coin = { g: PIXI.Graphics; vx: number; vy: number; life: number };
    const coins: Coin[] = [];
    const cx = this.width / 2, cy = this.height * 0.45;

    for (let i = 0; i < COINS; i++) {
      const g = new PIXI.Graphics();
      g.beginFill(0xffd700);
      g.drawCircle(0, 0, 5 + Math.random() * 3);
      g.endFill();
      g.x = cx; g.y = cy;
      this.effectLayer.addChild(g);
      const angle = Math.random() * Math.PI * 2;
      const speed = 4 + Math.random() * 7;
      coins.push({ g, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 6, life: 1 });
    }

    const tick: AnimFn = (dt) => {
      let alive = false;
      coins.forEach(c => {
        if (c.life <= 0) return;
        c.life -= dt * 0.022;
        c.vx *= 0.98;
        c.vy += 0.35; // gravity
        c.g.x += c.vx;
        c.g.y += c.vy;
        c.g.alpha = Math.max(0, c.life);
        if (c.life > 0) alive = true;
      });
      if (!alive) {
        this.app.ticker.remove(tick);
        coins.forEach(c => c.g.destroy());
      }
    };
    this.app.ticker.add(tick);
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private clearCard(): void {
    this.currentAnimFn = null;
    if (this.currentObjs) {
      this.unregisterAndDestroy(this.currentObjs);
      this.currentObjs = null;
    }
    this.cardLayer.removeChildren();
  }

  destroy(): void {
    this.app.destroy(false);
  }
}
