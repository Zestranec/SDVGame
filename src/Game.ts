import { Rng } from './Rng';
import { Economy, STARTING_BALANCE, BET_MIN, BET_MAX, BET_STEP } from './Economy';
import { sampleFailAtLike, calcPayout, MAX_LEVEL, CASHOUT_MULTIPLIERS } from './SpinTokController';
import { Renderer, BetSelectorOpts } from './Renderer';
import { Ui } from './Ui';
import { INTRO_CARD } from './Card';
import type { CardDef } from './Card';
import { SAFE_VIDEO_URLS } from './config/videoCdnUrls';
import { LoadingScene, LOADING_MIN_MS } from './LoadingScene';

export type GameState = 'loading' | 'intro' | 'running' | 'win' | 'lose';

/**
 * Pointer / wheel swipe input handler.
 * Used only for the intro → begin-round gesture.
 * Fires onSwipeUp() exactly once per discrete gesture.
 */
class SwipeInput {
  private startY = 0;
  private startX = 0;
  private dragging = false;
  private consumed = false;
  private locked = false;
  private lastWheelTime = 0;

  constructor(el: HTMLElement, onSwipeUp: () => void) {
    el.addEventListener('pointerdown', (e) => {
      this.startY = e.clientY;
      this.startX = e.clientX;
      this.dragging = true;
      this.consumed = false;
    }, { passive: true });

    el.addEventListener('pointermove', (e) => {
      if (!this.dragging || this.consumed || this.locked) return;
      const dy = this.startY - e.clientY;
      const dx = Math.abs(e.clientX - this.startX);
      if (dy > 70 && dx < dy * 0.75) {
        this.consumed = true;
        onSwipeUp();
      }
    }, { passive: true });

    el.addEventListener('pointerup',     () => { this.dragging = false; }, { passive: true });
    el.addEventListener('pointercancel', () => { this.dragging = false; }, { passive: true });

    // Mouse wheel / trackpad (deltaY > 0 = scroll down = "swipe up" in feed)
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (this.locked) return;
      const now = Date.now();
      if (e.deltaY > 40 && now - this.lastWheelTime > 650) {
        this.lastWheelTime = now;
        onSwipeUp();
      }
    }, { passive: false });
  }

  setLocked(v: boolean): void { this.locked = v; }
}

// ── Game ─────────────────────────────────────────────────────────────────────

export class Game {
  private state: GameState = 'loading';
  private rng!: Rng;
  private economy: Economy;
  private renderer: Renderer;
  private ui: Ui;
  private swipe: SwipeInput;
  private muted = false;
  private busy = false;

  // ── Round state (pre-sampled per round; failAtLike NEVER exposed) ───────────
  private failAtLike = Infinity;
  private level = 0;
  private videoUrls: string[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.economy  = new Economy();
    this.renderer = new Renderer(canvas);
    this.ui       = new Ui();

    this.ui.onLike(       () => { void this.handleLike(); });
    this.ui.onDislike(    () => { void this.handleDislike(); });
    this.ui.onCollect(    () => { void this.handleDislike(); }); // collect = dislike at MAX_LEVEL
    this.ui.onPopupButton(() => this.handlePopupButton());

    this.ui.soundBtn.addEventListener('click', () => {
      this.muted = !this.muted;
      this.ui.soundBtn.textContent = this.muted ? '🔇' : '🔊';
    });
    this.ui.seedInput.addEventListener('change', () => this.resetRng());

    this.swipe = new SwipeInput(document.body, () => { void this.handleSwipeUp(); });

    this.resetRng();
    this.ui.setBalance(this.economy.balance);
    this.ui.hideActions();
    this.ui.hideLevelHud();

    this.setState('loading');
    void this.boot();
  }

  // ── Boot (loading screen) ─────────────────────────────────────────────────

  private async boot(): Promise<void> {
    const startTime = performance.now();
    const scene     = new LoadingScene(this.renderer.app);

    const SIM_MS = 1000;
    const ticker = setInterval(() => {
      const t = Math.min((performance.now() - startTime) / SIM_MS, 1);
      scene.setProgress(t * 0.9);
    }, 16);

    await Promise.all([scene.loadAssets(), delay(LOADING_MIN_MS)]);

    clearInterval(ticker);
    scene.setProgress(1.0);
    await delay(120);

    scene.destroy();
    this.setState('intro');
  }

  // ── State ──────────────────────────────────────────────────────────────────

  private setState(next: GameState): void {
    this.state = next;

    switch (next) {
      case 'loading':
        this.swipe.setLocked(true);
        break;

      case 'intro': {
        this.swipe.setLocked(false);
        this.ui.hidePopup();
        this.ui.hideActions();
        this.ui.hideLevelHud();
        const betOpts: BetSelectorOpts = {
          value:    this.economy.bet,
          onChange: (v) => { this.economy.bet = v; },
          min:      BET_MIN,
          max:      BET_MAX,
          step:     BET_STEP,
        };
        this.renderer.showCard(INTRO_CARD, { betOpts });
        break;
      }

      case 'running': {
        this.swipe.setLocked(true); // buttons handle interaction during a round
        this.ui.setBalance(this.economy.balance);
        const mult   = CASHOUT_MULTIPLIERS[this.level];
        const payout = this.economy.bet * mult;
        this.ui.setLevelHud(this.level, `×${mult} = ${payout.toFixed(2)} FUN`);
        this.ui.showLikeDislike(this.level === MAX_LEVEL);
        break;
      }

      case 'win':
      case 'lose':
        this.swipe.setLocked(true);
        this.ui.hideActions();
        this.ui.hideLevelHud();
        break;
    }
  }

  // ── Swipe (intro only) ────────────────────────────────────────────────────

  private async handleSwipeUp(): Promise<void> {
    if (this.busy) return;
    if (this.state === 'intro') {
      this.busy = true;
      try { await this.beginRound(); } finally { this.busy = false; }
    }
  }

  // ── Round start ────────────────────────────────────────────────────────────

  private async beginRound(): Promise<void> {
    if (!this.economy.canStartRound) {
      this.economy.balance = STARTING_BALANCE;
      this.ui.setBalance(this.economy.balance);
    }

    this.economy.startRound();
    this.resetRng(); // fresh RNG per round

    // Pre-sample outcome — failAtLike is NEVER surfaced to the player
    this.failAtLike = sampleFailAtLike(this.rng);

    // Pre-sample a unique video URL for every possible level
    this.videoUrls = new Array(MAX_LEVEL + 1);
    for (let i = 1; i <= MAX_LEVEL; i++) {
      this.videoUrls[i] = this.rng.pick(SAFE_VIDEO_URLS as readonly string[]);
    }

    this.level = 1;
    await this.renderer.transitionTo(this.makeVideoCard(1));
    this.setState('running');
  }

  // ── LIKE ──────────────────────────────────────────────────────────────────

  private async handleLike(): Promise<void> {
    if (this.busy || this.state !== 'running') return;
    this.busy = true;
    try {
      this.ui.hideActions();
      this.ui.hideLevelHud();

      if (this.level === this.failAtLike) {
        await this.triggerLose();
      } else {
        this.level++;
        await this.renderer.transitionTo(this.makeVideoCard(this.level));
        this.setState('running');
      }
    } finally {
      this.busy = false;
    }
  }

  // ── DISLIKE / COLLECT ─────────────────────────────────────────────────────

  private async handleDislike(): Promise<void> {
    if (this.busy || this.state !== 'running') return;
    this.busy = true;
    try {
      const payout = calcPayout(this.economy.bet, this.level);
      this.economy.addWinnings(payout);
      this.setState('win');
      this.ui.setBalance(this.economy.balance);
      setTimeout(() => {
        this.ui.showPopupWin(payout, this.economy.balance);
      }, 200);
    } finally {
      this.busy = false;
    }
  }

  // ── Lose (LIKE failed) ────────────────────────────────────────────────────

  private async triggerLose(): Promise<void> {
    this.setState('lose');

    this.renderer.shake(22, 32);
    this.renderer.glitchLines(7, 40);
    this.ui.flashRed(550);
    this.ui.glitchEffect(650);

    this.ui.setBalance(this.economy.balance);

    await delay(950);
    this.ui.showPopupLose(this.economy.balance, this.economy.bet);
  }

  // ── Popup button ───────────────────────────────────────────────────────────

  private handlePopupButton(): void {
    if (this.economy.balance < this.economy.bet) {
      this.economy.balance = STARTING_BALANCE;
      this.ui.setBalance(this.economy.balance);
    }
    this.ui.seedInput.value = '';
    this.resetRng();
    this.setState('intro');
  }

  // ── RNG ───────────────────────────────────────────────────────────────────

  private resetRng(): void {
    const raw  = parseInt(this.ui.seedInput.value.trim(), 10);
    const seed = (this.ui.seedInput.value.trim() === '' || isNaN(raw) || raw <= 0)
      ? Math.floor(Math.random() * 1_000_000_000)
      : raw;

    this.ui.seedInput.value = String(seed);
    console.log('Round seed:', seed);
    this.rng = new Rng(seed);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private makeVideoCard(level: number): CardDef {
    return {
      id:       `spintok_level_${level}`,
      type:     'safe',
      emoji:    '',
      headline: '',
      subline:  '',
      colors:   ['#000', '#000'],
      animType: 'float',
      videoUrl: this.videoUrls[level],
    };
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
