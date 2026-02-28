import { Rng, makeSeed } from './Rng';
import { Economy, STARTING_BALANCE } from './Economy';
import { OutcomeController } from './OutcomeController';
import { ReelEngine } from './ReelEngine';
import { Renderer } from './Renderer';
import { Ui } from './Ui';
import { INTRO_CARD } from './Card';

export type GameState = 'idle' | 'intro' | 'running' | 'transitioning' | 'win' | 'lose';

/**
 * Pointer / wheel swipe input handler.
 * Fires onSwipeUp() exactly once per discrete gesture.
 * A new gesture can only start after pointerup.
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

    // Mouse wheel / trackpad  (deltaY > 0 = scroll down = "swipe up" in feed)
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
  private state: GameState = 'idle';
  private rng!: Rng;
  private economy: Economy;
  private outCtrl!: OutcomeController;
  private reel!: ReelEngine;
  private renderer: Renderer;
  private ui: Ui;
  private swipe: SwipeInput;
  private muted = false;

  constructor(canvas: HTMLCanvasElement) {
    this.economy  = new Economy();
    this.renderer = new Renderer(canvas);
    this.ui       = new Ui();

    this.ui.onCashout(     () => this.handleCashout());
    this.ui.onPopupButton( () => this.handlePopupButton());
    this.ui.soundBtn.addEventListener('click', () => {
      this.muted = !this.muted;
      this.ui.soundBtn.textContent = this.muted ? '🔇' : '🔊';
    });
    this.ui.seedInput.addEventListener('change', () => this.resetRng());

    this.swipe = new SwipeInput(document.body, () => this.handleSwipeUp());

    // Initial state
    this.resetRng();
    this.ui.setBalance(this.economy.balance);
    this.ui.clearRoundHud();
    this.ui.showBottomBar({ roundValue: false, cashout: false, swipeHint: false });
    this.ui.showPopupIntro();
    this.setState('idle');
  }

  // ── State ──────────────────────────────────────────────────────────────────

  private setState(next: GameState): void {
    this.state = next;

    switch (next) {
      case 'idle':
        this.swipe.setLocked(true);
        break;

      case 'intro':
        this.swipe.setLocked(false);
        this.ui.hidePopup();
        this.renderer.showCard(INTRO_CARD);
        this.ui.showBottomBar({
          roundValue: false, cashout: false, swipeHint: true,
          hintText: 'Swipe up to begin (−10 FUN)',
        });
        break;

      case 'running':
        this.swipe.setLocked(false);
        this.ui.setRoundValue(this.economy.roundValue, this.economy.multiplier);
        this.ui.setBalance(this.economy.balance);
        this.ui.showBottomBar({
          roundValue: true, cashout: true, swipeHint: true,
          hintText: 'Swipe up to continue',
        });
        break;

      case 'transitioning':
        this.swipe.setLocked(true);
        this.ui.showBottomBar({ roundValue: false, cashout: false, swipeHint: false });
        break;

      case 'win':
      case 'lose':
        this.swipe.setLocked(true);
        break;
    }
  }

  // ── Swipe ──────────────────────────────────────────────────────────────────

  /**
   * Auto-swipe bug fix: a `busy` flag ensures only one async swipe
   * handler runs at a time, regardless of how quickly pointer/wheel
   * events fire.  The SwipeInput lock still handles the UI side;
   * `busy` is the logical guard at the Game level.
   */
  private busy = false;

  private async handleSwipeUp(): Promise<void> {
    if (this.busy) return;
    if (this.state === 'intro') {
      this.busy = true;
      try { await this.beginRound(); } finally { this.busy = false; }
    } else if (this.state === 'running') {
      this.busy = true;
      try { await this.advanceCard(); } finally { this.busy = false; }
    }
  }

  // ── Round start ────────────────────────────────────────────────────────────

  private async beginRound(): Promise<void> {
    if (!this.economy.canStartRound) {
      this.economy.balance = STARTING_BALANCE;
      this.ui.setBalance(this.economy.balance);
    }

    this.economy.startRound();
    this.reel.startRound();
    this.setState('transitioning');

    const firstCard = this.reel.nextCard();
    await this.renderer.transitionTo(firstCard);

    if (firstCard.type === 'bomb') {
      await this.triggerBomb();
    } else {
      // Safe or viral_boost — apply multiplier (viral_boost uses its own override)
      this.economy.onSafeCard(firstCard.multiplierOverride);
      this.setState('running');
    }
  }

  // ── Next card ──────────────────────────────────────────────────────────────

  private async advanceCard(): Promise<void> {
    if (this.state !== 'running') return;
    this.setState('transitioning');

    const card = this.reel.nextCard();
    await this.renderer.transitionTo(card);

    if (card.type === 'bomb') {
      await this.triggerBomb();
    } else {
      // Safe or viral_boost — pass the override multiplier if present
      this.economy.onSafeCard(card.multiplierOverride);
      this.setState('running');
    }
  }

  // ── Cashout ────────────────────────────────────────────────────────────────

  private handleCashout(): void {
    if (this.state !== 'running') return;

    const gross = this.economy.cashout(); // total FUN added to balance
    this.setState('win');

    this.renderer.celebrateCashout();
    this.ui.setBalance(this.economy.balance);
    this.ui.clearRoundHud();
    this.ui.showBottomBar({ roundValue: false, cashout: false, swipeHint: false });

    setTimeout(() => {
      this.ui.showPopupWin(gross, this.economy.balance);
    }, 650);
  }

  // ── Bomb ───────────────────────────────────────────────────────────────────

  private async triggerBomb(): Promise<void> {
    this.setState('lose');

    this.renderer.shake(22, 32);
    this.renderer.glitchLines(7, 40);
    this.ui.flashRed(550);
    this.ui.glitchEffect(650);

    this.economy.onBomb();
    this.ui.setBalance(this.economy.balance);
    this.ui.clearRoundHud();
    this.ui.showBottomBar({ roundValue: false, cashout: false, swipeHint: false });

    await delay(950);
    this.ui.showPopupLose(this.economy.balance);
  }

  // ── Popup button ───────────────────────────────────────────────────────────

  private handlePopupButton(): void {
    if (this.economy.balance < 10) {
      this.economy.balance = STARTING_BALANCE;
      this.ui.setBalance(this.economy.balance);
    }
    // Clear seed so each Play Again generates a fresh random seed
    // (user must retype a seed to reuse it deliberately)
    this.ui.seedInput.value = '';
    this.resetRng();
    this.setState('intro');
  }

  // ── RNG reset ──────────────────────────────────────────────────────────────

  private resetRng(): void {
    const raw  = parseInt(this.ui.seedInput.value.trim(), 10);
    const seed = (this.ui.seedInput.value.trim() === '' || isNaN(raw) || raw <= 0)
      ? Math.floor(Math.random() * 1_000_000_000)
      : raw;

    this.ui.seedInput.value = String(seed);
    console.log('Round seed:', seed);

    this.rng     = new Rng(seed);
    this.outCtrl = new OutcomeController(this.rng);
    this.reel    = new ReelEngine(this.rng, this.outCtrl);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
