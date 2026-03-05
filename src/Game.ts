import { Rng } from './Rng';
import { Economy, STARTING_BALANCE, BET_MIN, BET_MAX, BET_STEP } from './Economy';
import { Renderer, BetSelectorOpts } from './Renderer';
import { Ui } from './Ui';
import { INTRO_CARD, BOMB_CARD, VIRAL_BOOST_CARD, type CardDef } from './Card';
import { LoadingScene, LOADING_MIN_MS } from './LoadingScene';
import { CardStyleController } from './CardStyleController';
import { SAFE_CARDS_CONFIG } from './config/safeCards';
import { backendPlay, type BackendResp, type BackendPlayResult } from './backendApi';
import { contentUrl } from './contentPool';

export type GameState = 'loading' | 'intro' | 'running' | 'transitioning' | 'win' | 'lose';

/**
 * Pointer / wheel swipe input handler.
 * Fires onSwipeUp() exactly once per discrete gesture.
 * A new gesture can only start after pointerup.
 */
class SwipeInput {
  private startY = 0;
  private startX = 0;
  private dragging = false;
  /** Threshold reached in pointermove; actual callback fires on pointerup (valid iOS activation). */
  private swipePending = false;
  private locked = false;
  private lastWheelTime = 0;

  constructor(el: HTMLElement, onSwipeUp: () => void) {
    el.addEventListener('pointerdown', (e) => {
      this.startY = e.clientY;
      this.startX = e.clientX;
      this.dragging = true;
      this.swipePending = false;
    }, { passive: true });

    // pointermove: detect threshold only — do NOT call onSwipeUp here.
    // pointermove is not a valid user-activation event on iOS Safari, so video.play()
    // called from this handler will be rejected, causing "Tap to play" to appear.
    el.addEventListener('pointermove', (e) => {
      if (!this.dragging || this.swipePending || this.locked) return;
      const dy = this.startY - e.clientY;
      const dx = Math.abs(e.clientX - this.startX);
      if (dy > 70 && dx < dy * 0.75) {
        this.swipePending = true; // latch; fired on pointerup below
      }
    }, { passive: true });

    // pointerup: valid user-activation event — iOS Safari allows video.play() here.
    el.addEventListener('pointerup', () => {
      const pending = this.swipePending;
      this.dragging = false;
      this.swipePending = false;
      if (pending && !this.locked) onSwipeUp();
    }, { passive: true });

    el.addEventListener('pointercancel', () => {
      this.dragging = false;
      this.swipePending = false;
    }, { passive: true });

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
  private state: GameState = 'loading';
  private economy: Economy;
  private renderer: Renderer;
  private ui: Ui;
  private swipe: SwipeInput;
  private muted = false;

  // Visual-only RNG (safe card template selection — NOT outcome generation).
  private visualRng: Rng = new Rng(Math.floor(Math.random() * 1_000_000_000));
  private styleCtrl = new CardStyleController();

  // Backend state — persisted across swipes within a round.
  private backendGameState: unknown = {};
  private backendRoundState: unknown = null;

  constructor(canvas: HTMLCanvasElement) {
    this.economy  = new Economy();
    this.renderer = new Renderer(canvas);
    this.ui       = new Ui();

    this.ui.onCashout(     () => void this.handleCashout());
    this.ui.onPopupButton( () => this.handlePopupButton());
    this.ui.soundBtn.addEventListener('click', () => {
      this.muted = !this.muted;
      this.ui.soundBtn.textContent = this.muted ? '🔇' : '🔊';
    });

    this.swipe = new SwipeInput(document.body, () => this.handleSwipeUp());

    this.ui.setBalance(this.economy.balance);
    this.ui.clearRoundHud();
    this.ui.showBottomBar({ roundValue: false, cashout: false, swipeHint: false });

    this.setState('loading');
    void this.boot();
  }

  // ── Boot (loading screen) ─────────────────────────────────────────────────

  private async boot(): Promise<void> {
    const startTime = performance.now();
    const scene     = new LoadingScene(this.renderer.app);

    const SIM_MS  = 1000;
    const ticker  = setInterval(() => {
      const t = Math.min((performance.now() - startTime) / SIM_MS, 1);
      scene.setProgress(t * 0.9);
    }, 16);

    await Promise.all([
      scene.loadAssets(),
      delay(LOADING_MIN_MS),
    ]);

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
        const betOpts: BetSelectorOpts = {
          value:    this.economy.bet,
          onChange: (v) => { this.economy.bet = v; },
          min:      BET_MIN,
          max:      BET_MAX,
          step:     BET_STEP,
        };
        this.renderer.showCard(INTRO_CARD, { betOpts });
        this.ui.showBottomBar({ roundValue: false, cashout: false, swipeHint: false });
        break;
      }

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

  private handleSwipeUp(): void {
    if (this.busy) return;
    // Unlock autoplay NOW, synchronously inside the gesture handler,
    // before any await — keeps iOS video.play() in gesture context.
    this.renderer.unlockAutoplay();

    if (this.state === 'intro') {
      this.busy = true;
      void this.beginRound().finally(() => { this.busy = false; });
    } else if (this.state === 'running') {
      this.busy = true;
      void this.advanceCard().finally(() => { this.busy = false; });
    }
  }

  // ── Card factory ───────────────────────────────────────────────────────────

  /**
   * Build a CardDef from a backend response:
   * - outcome type (bomb / viral_boost / safe) comes from the backend
   * - videoUrl comes from the backend's content_id (via contentPool)
   * - safe card visual template is picked client-side (cosmetic only, not an outcome)
   */
  private buildCardFromResp(resp: BackendResp): CardDef {
    const videoUrl = contentUrl(resp.content_id);

    if (resp.outcome === 'bomb') {
      return { ...BOMB_CARD, videoUrl };
    }

    if (resp.outcome === 'viral_boost') {
      return { ...VIRAL_BOOST_CARD, videoUrl };
    }

    // Safe card: pick a random visual template (cosmetic, no outcome significance)
    const config = SAFE_CARDS_CONFIG[this.visualRng.nextInt(SAFE_CARDS_CONFIG.length)];
    const def    = this.styleCtrl.buildCardDef(config);
    return { ...def, videoUrl };
  }

  // ── Round start ────────────────────────────────────────────────────────────

  private async beginRound(): Promise<void> {
    // Reseed visual RNG for variety each round (not used for outcomes)
    this.visualRng = new Rng(Math.floor(Math.random() * 1_000_000_000));

    if (!this.economy.canStartRound) {
      this.economy.balance = STARTING_BALANCE;
      this.ui.setBalance(this.economy.balance);
    }

    this.economy.startRound();
    this.setState('transitioning');

    // ── Backend: start action ────────────────────────────────────────────────
    let res: BackendPlayResult;
    try {
      res = await backendPlay({
        game:     this.backendGameState,
        round:    null,
        req:      { action: 'start', bet: this.economy.bet, bet_type: 'bet' },
        config:   {},
        god_data: null,
      });
    } catch (err) {
      console.error('[Game] Backend error on start:', err);
      this.ui.showError('Connection error — backend unreachable');
      // Roll back economy deduction and return to intro
      this.economy.onBomb();
      this.economy.balance += this.economy.bet;
      this.setState('intro');
      return;
    }

    this.backendGameState  = res.game;
    this.backendRoundState = res.round;

    const firstCard = this.buildCardFromResp(res.resp);
    // primeCard: in gesture context (unlockAutoplay was called before the await)
    this.renderer.primeCard(firstCard);
    await this.renderer.transitionTo(firstCard);

    if (res.resp.outcome === 'bomb') {
      await this.triggerBomb();
    } else {
      this.economy.setRoundValueFromBackend(res.resp.acc, res.resp.step);
      if (res.resp.max_reached || res.resp.ended_by === 'maxwin') {
        this.triggerMaxWin(res.resp.acc);
      } else {
        this.setState('running');
      }
    }
  }

  // ── Next card ──────────────────────────────────────────────────────────────

  private async advanceCard(): Promise<void> {
    if (this.state !== 'running') return;
    this.setState('transitioning');

    // ── Backend: swipe action ────────────────────────────────────────────────
    let res: BackendPlayResult;
    try {
      res = await backendPlay({
        game:     this.backendGameState,
        round:    this.backendRoundState,
        req:      { action: 'swipe' },
        config:   {},
        god_data: null,
      });
    } catch (err) {
      console.error('[Game] Backend error on swipe:', err);
      this.ui.showError('Connection error — backend unreachable');
      this.setState('running');
      return;
    }

    this.backendGameState  = res.game;
    this.backendRoundState = res.round;

    const card = this.buildCardFromResp(res.resp);
    this.renderer.primeCard(card);
    await this.renderer.transitionTo(card);

    if (res.resp.outcome === 'bomb') {
      await this.triggerBomb();
    } else {
      this.economy.setRoundValueFromBackend(res.resp.acc, res.resp.step);
      if (res.resp.max_reached || res.resp.ended_by === 'maxwin') {
        this.triggerMaxWin(res.resp.acc);
      } else {
        this.setState('running');
      }
    }
  }

  // ── Cashout ────────────────────────────────────────────────────────────────

  private async handleCashout(): Promise<void> {
    if (this.state !== 'running') return;
    if (this.busy) return;
    this.busy = true;

    try {
      // ── Backend: cashout action ──────────────────────────────────────────
      let res: BackendPlayResult;
      try {
        res = await backendPlay({
          game:     this.backendGameState,
          round:    this.backendRoundState,
          req:      { action: 'cashout' },
          config:   {},
          god_data: null,
        });
      } catch (err) {
        console.error('[Game] Backend error on cashout:', err);
        this.ui.showError('Connection error — cashout failed, please retry');
        return;
      }

      this.backendGameState  = res.game;
      this.backendRoundState = null;

      const gross = res.resp.acc;
      this.economy.applyCashoutFromBackend(gross);
      this.setState('win');

      this.renderer.celebrateCashout();
      this.ui.setBalance(this.economy.balance);
      this.ui.clearRoundHud();
      this.ui.showBottomBar({ roundValue: false, cashout: false, swipeHint: false });

      setTimeout(() => {
        this.ui.showPopupWin(gross, this.economy.balance);
      }, 650);
    } finally {
      this.busy = false;
    }
  }

  // ── Max win (forced cashout at ×500 cap) ───────────────────────────────────

  private triggerMaxWin(acc: number): void {
    this.economy.applyCashoutFromBackend(acc);
    this.setState('win');

    this.renderer.celebrateCashout();
    this.ui.setBalance(this.economy.balance);
    this.ui.clearRoundHud();
    this.ui.showBottomBar({ roundValue: false, cashout: false, swipeHint: false });

    setTimeout(() => {
      this.ui.showPopupMaxWin(acc, this.economy.balance);
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

    this.backendRoundState = null;

    await delay(950);
    this.ui.showPopupLose(this.economy.balance, this.economy.bet);
  }

  // ── Popup button ───────────────────────────────────────────────────────────

  private handlePopupButton(): void {
    if (this.economy.balance < this.economy.bet) {
      this.economy.balance = STARTING_BALANCE;
      this.ui.setBalance(this.economy.balance);
    }
    this.setState('intro');
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
