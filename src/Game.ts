import { Rng } from './Rng';
import { Economy } from './Economy';
import { Renderer } from './Renderer';
import { Ui } from './Ui';
import { INTRO_CARD, BOMB_CARD, VIRAL_BOOST_CARD, type CardDef } from './Card';
import { LoadingScene, LOADING_MIN_MS } from './LoadingScene';
import { CardStyleController } from './CardStyleController';
import { SAFE_CARDS_CONFIG } from './config/safeCards';
import { contentUrl, allSafeUrls } from './contentPool';
import { gameOptions } from './GameOptions';
import { formatAmount } from './moneyFormat';
import {
  RunnerClient,
  type GameResp,
  type RunnerFreebets,
  type RunnerPlayReq,
  type ReplayStep,
  type RunnerReplayResult,
  toBigInt,
  parseTokenFromUrl,
  parseRoundIdFromUrl,
  showFatalError,
} from './runnerClient';

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

  /** Token from URL ?token=... */
  private readonly token: string;

  /** Runner JSON-RPC client — single source of truth for session state. */
  private runner!: RunnerClient;

  private economy: Economy;
  private renderer: Renderer;
  private ui: Ui;
  private swipe: SwipeInput;
  private muted = false;

  // Visual-only RNG (safe card template selection — NOT outcome generation).
  private visualRng: Rng = new Rng(Math.floor(Math.random() * 1_000_000_000));
  private styleCtrl = new CardStyleController();

  /** Info polling handle — refreshes balance/freebets from runner every ~8 s. */
  private infoTimer: ReturnType<typeof setInterval> | null = null;

  constructor(canvas: HTMLCanvasElement) {
    const roundId = parseRoundIdFromUrl();
    const token   = parseTokenFromUrl();

    if (roundId) {
      // ── Replay mode — no token needed ─────────────────────────────────────
      this.token      = '';
      this.replayMode = true;
      this.economy    = new Economy(0n);
      this.renderer   = new Renderer(canvas);
      this.ui         = new Ui();
      // Swipe input is a no-op in replay (navigation via dedicated controls)
      this.swipe      = new SwipeInput(document.getElementById('game-frame') ?? document.body, () => {});
      // Dummy runner — only runner.replay() will be called, which needs no token
      this.runner     = new RunnerClient('');
      this.setState('loading');
      void this.bootReplay(roundId);
      return;
    }

    if (!token) {
      showFatalError('Missing token in URL (?token=…).\nRunner init cannot start.');
      this.token    = '';
      this.economy  = new Economy(0n);
      this.renderer = new Renderer(canvas);
      this.ui       = new Ui();
      this.swipe    = new SwipeInput(document.body, () => {});
      return;
    }

    this.token    = token;
    this.runner   = new RunnerClient(token);
    this.economy  = new Economy(0n);   // overwritten after runner init
    this.renderer = new Renderer(canvas);
    this.ui       = new Ui();

    this.ui.onCashout(     () => void this.handleCashout());
    this.ui.onPopupButton( () => this.handlePopupButton());
    this.ui.soundBtn.addEventListener('click', () => {
      this.muted = !this.muted;
      this.ui.soundBtn.textContent = this.muted ? '🔇' : '🔊';
    });

    this.swipe = new SwipeInput(document.getElementById('game-frame') ?? document.body, () => this.handleSwipeUp());

    this.ui.setBalance(0n);
    this.ui.clearRoundHud();
    this.ui.showBottomBar({ roundValue: false, cashout: false, swipeHint: false });

    this.setState('loading');
    void this.boot();
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** Currently selected bet in subunits. */
  private get currentBet(): bigint {
    return gameOptions.selectedBet;
  }

  /** Compute the display multiplier from backend acc relative to bet×houseEdge. */
  private computeMultiplier(): number {
    const bet = this.currentBet;
    if (bet === 0n) return 1;
    const seed = (bet * 9500n) / 10000n;
    if (seed === 0n) return 1;
    return Number(this.economy.roundValue) / Number(seed);
  }

  /** Format a bet value for display in the bet selector (no trailing-zero trim). */
  private formatBet(betInt: bigint): string {
    return formatAmount(betInt, gameOptions.currency, gameOptions.feDecimals, false);
  }

  /**
   * Preload `count` randomly chosen safe videos that are not already cached.
   * Only safe URLs are picked — never bomb/buff — so the preload set reveals
   * nothing about the next outcome (Phase 1 anti-spoiler policy).
   * No-op when VITE_VIDEO_PRELOAD is not set.
   */
  private preloadRandomSafe(count: number): void {
    if (!this.renderer.videoCacheEnabled) return;
    const pool  = allSafeUrls();
    const picks = Math.min(count, pool.length);
    for (let i = 0; i < picks; i++) {
      const j = i + Math.floor(Math.random() * (pool.length - i));
      [pool[i], pool[j]] = [pool[j], pool[i]];
      this.renderer.preloadUrl(pool[i]);
    }
  }

  // ── Info polling ──────────────────────────────────────────────────────────

  private startInfoPolling(): void {
    if (this.infoTimer) return;
    this.infoTimer = setInterval(() => void this.pollInfo(), 8000);
  }

  private async pollInfo(): Promise<void> {
    try {
      const res     = await this.runner.info();
      const prevFb  = gameOptions.freebets;
      const changes = gameOptions.mergeFromInfo(res);
      this._checkFreebetsEvents(prevFb, gameOptions.freebets);
      if (changes.balanceChanged) {
        this.economy.balance = gameOptions.balance;
        this.ui.setBalance(this.economy.balance);
      }
      if (import.meta.env.DEV && (changes.balanceChanged || changes.currencyChanged || changes.betsChanged)) {
        console.debug('[Runner] info poll changes:', changes);
      }
    } catch (err) {
      if (import.meta.env.DEV) console.warn('[Runner] info poll failed:', err);
    }
  }

  /** Detect new freebet grants and completed freebet sequences, show popups. */
  private _checkFreebetsEvents(prev: RunnerFreebets | null, curr: RunnerFreebets | null): void {
    if (!curr) return;

    // New grant: issued count increased since last seen
    if (curr.issued > this._lastSeenFreebetsIssued) {
      this._lastSeenFreebetsIssued = curr.issued;
      if (this.state === 'running' || this.state === 'transitioning') {
        this._pendingFreebetsAwardedCount = curr.issued;
      } else {
        this.ui.showPopupFreebetsAwarded(curr.issued);
      }
    }

    // All freebets finished — show full collect popup
    if (curr.issued > 0 && curr.done === curr.issued) {
      if (!prev || prev.done < prev.issued) {
        if (this.state === 'intro') {
          // Detected via poll while at intro: show immediately
          this.swipe.setLocked(true);
          this.ui.showPopupFreebetsOver(BigInt(curr.total_win), curr.issued, this.economy.balance);
        } else if (!this._pendingFreebetsOver) {
          // Mid/end of round: defer until the current popup is dismissed
          this._pendingFreebetsOver = true;
        }
      }
    }
  }

  /** Update gameOptions.freebets from a play response and check for events. */
  private _applyFreebetsFromPlay(freebets: RunnerFreebets | null | undefined): void {
    if (freebets === undefined) return;
    const prev = gameOptions.freebets;
    gameOptions.freebets = freebets ?? null;
    this._checkFreebetsEvents(prev, gameOptions.freebets);
  }

  // ── Replay boot + playback ─────────────────────────────────────────────────

  private async bootReplay(roundId: string): Promise<void> {
    const scene = new LoadingScene(this.renderer.app);
    let result: RunnerReplayResult;
    try {
      [result] = await Promise.all([
        this.runner.replay(roundId),
        scene.loadAssets(),
        delay(LOADING_MIN_MS),
      ]);
      this.replaySteps = result.steps;
      this.replayIndex = 0;
      gameOptions.populateFromReplay(result);
      this.economy = new Economy(toBigInt(result.balance));
      this.ui.setCurrencyConfig(gameOptions.currency, gameOptions.feDecimals);
    } catch (err) {
      scene.destroy();
      showFatalError(`Replay load failed:\n${String(err)}`);
      return;
    }

    scene.destroy();
    this.ui.setBalance(this.economy.balance);
    this.showReplayControls();
    void this.playReplayStep();
  }

  private showReplayControls(): void {
    this.ui.showReplayControls(
      () => void this.replayBack(),
      () => void this.replayNext(),
    );
  }

  private async playReplayStep(): Promise<void> {
    if (this.replayIndex >= this.replaySteps.length) return;
    const step = this.replaySteps[this.replayIndex];
    const card = this.buildCardFromResp(step.resp);
    this.renderer.primeCard(card);
    await this.renderer.transitionTo(card);
    const accCents = BigInt(step.resp.acc_cents);
    this.economy.setRoundValueFromBackend(accCents, step.resp.step);
    this.ui.setBalance(toBigInt(step.balance));
    this.ui.setRoundValue(this.economy.roundValue, this.computeMultiplier());
    this.ui.updateReplayControls(this.replayIndex, this.replaySteps.length);
  }

  private async replayNext(): Promise<void> {
    if (this.replayIndex < this.replaySteps.length - 1) {
      this.replayIndex++;
      await this.playReplayStep();
    }
  }

  private async replayBack(): Promise<void> {
    if (this.replayIndex > 0) {
      this.replayIndex--;
      await this.playReplayStep();
    }
  }

  // ── Boot (loading screen + Runner init) ───────────────────────────────────

  private async boot(): Promise<void> {
    const startTime = performance.now();
    const scene     = new LoadingScene(this.renderer.app);

    const SIM_MS = 1000;
    const ticker  = setInterval(() => {
      const t = Math.min((performance.now() - startTime) / SIM_MS, 1);
      scene.setProgress(t * 0.9);
    }, 16);

    try {
      const [initResult] = await Promise.all([
        this.runner.init(),
        scene.loadAssets(),
        delay(LOADING_MIN_MS),
      ]);

      gameOptions.populateFromInit(initResult);
      this._lastSeenFreebetsIssued = gameOptions.freebets?.issued ?? 0;
      this.economy = new Economy(gameOptions.balance);
      this.ui.setCurrencyConfig(gameOptions.currency, gameOptions.feDecimals);

    } catch (err) {
      clearInterval(ticker);
      scene.destroy();
      showFatalError(`Runner init failed:\n${String(err)}`);
      return;
    }

    clearInterval(ticker);
    scene.setProgress(1.0);
    await delay(120);

    scene.destroy();
    this.ui.setBalance(this.economy.balance);
    this.ui.setCurrentBet(gameOptions.selectedBet);
    this.startInfoPolling();
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
        this.renderer.showCard(INTRO_CARD, {
          betOpts: {
            bets:        gameOptions.availableBets,
            betIndex:    gameOptions.selectedBetIndex,
            onBetChange: (i) => {
              gameOptions.selectedBetIndex = i;
              this.ui.setCurrentBet(gameOptions.selectedBet);
            },
            formatBet:   (v) => this.formatBet(v),
          },
        });
        this.ui.showBottomBar({ roundValue: false, cashout: false, swipeHint: false });
        // Show freebets HUD if there are active freebets
        const fbIntro = gameOptions.freebets;
        if (fbIntro && fbIntro.issued > 0 && fbIntro.done < fbIntro.issued) {
          this.ui.showFreebetsCounter(fbIntro.done, fbIntro.issued, BigInt(fbIntro.total_win));
        } else {
          this.ui.hideFreebetsCounter();
        }
        // Show deferred freebets-awarded popup now that we're back in idle state
        if (this._pendingFreebetsAwardedCount !== null) {
          const count = this._pendingFreebetsAwardedCount;
          this._pendingFreebetsAwardedCount = null;
          setTimeout(() => this.ui.showPopupFreebetsAwarded(count), 300);
        }
        break;
      }

      case 'running':
        this.swipe.setLocked(false);
        this.ui.setRoundValue(this.economy.roundValue, this.computeMultiplier());
        this.ui.setBalance(this.economy.balance);
        this.ui.showBottomBar({
          roundValue: true, cashout: true, swipeHint: true,
          hintText: 'Swipe up to continue',
        });
        if (this._currentBetType === 'freebet') {
          const fb = gameOptions.freebets;
          if (fb && fb.done < fb.issued) {
            this.ui.showFreebetsCounter(fb.done, fb.issued, BigInt(fb.total_win));
          }
        }
        break;

      case 'transitioning':
        this.swipe.setLocked(true);
        this.ui.showBottomBar({ roundValue: false, cashout: false, swipeHint: false });
        break;

      case 'win':
      case 'lose':
        this.swipe.setLocked(true);
        this.ui.hideFreebetsCounter();
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

  // ── Replay mode ────────────────────────────────────────────────────────────
  private replayMode  = false;
  private replaySteps: ReplayStep[] = [];
  private replayIndex = 0;

  // ── Freebet tracking ───────────────────────────────────────────────────────
  /** Whether the current round is the last freebet in the sequence. */
  private _freebetsLast = false;
  /** bet_type used for the currently active round. */
  private _currentBetType: 'bet' | 'freebet' = 'bet';
  /** Last observed freebets.issued — used to detect new grants. */
  private _lastSeenFreebetsIssued = 0;
  /** Deferred "freebets awarded" count to show once the current round ends. */
  private _pendingFreebetsAwardedCount: number | null = null;
  /** Pending "freebets over" popup — show at next handlePopupButton call. */
  private _pendingFreebetsOver = false;

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
  private buildCardFromResp(resp: GameResp): CardDef {
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

    const bet      = this.currentBet;
    const betType  = gameOptions.shouldUseFreebet() ? 'freebet' : 'bet';
    const betValue = betType === 'freebet' ? gameOptions.getFreebetBet() : bet;

    if (!this.economy.canAfford(bet)) {
      this.ui.showError('Insufficient balance. Please top up.');
      return;
    }

    this._currentBetType = betType;
    const fb = gameOptions.freebets;
    this._freebetsLast = betType === 'freebet' && fb != null && (fb.done + 1 === fb.issued);

    this.economy.onRoundStart();
    this.setState('transitioning');

    // ── Runner: start action ─────────────────────────────────────────────────
    let res;
    try {
      const req: RunnerPlayReq = { action: 'start', bet: Number(betValue), bet_type: betType };
      if (this._freebetsLast) req.freebets_last = true;
      res = await this.runner.play(req);
    } catch (err) {
      console.error('[Game] Runner error on start:', err);
      this.ui.showError(`Connection error — ${String(err)}`);
      this.economy.onRoundStart(); // reset partial state
      this.setState('intro');
      return;
    }

    // Runner is authoritative for balance after each play
    this.economy.balance = toBigInt(res.balance);
    this._applyFreebetsFromPlay(res.freebets);

    if (!res.resp) {
      this.ui.showError('Invalid runner response (missing resp).');
      this.setState('intro');
      return;
    }

    const firstCard = this.buildCardFromResp(res.resp);
    this.renderer.primeCard(firstCard);
    await this.renderer.transitionTo(firstCard);

    const accCents = BigInt(res.resp.acc_cents);

    if (res.resp.outcome === 'bomb') {
      await this.triggerBomb(toBigInt(res.balance));
    } else {
      // Preload 2 random safe videos now that the network is free.
      // Only safe URLs are chosen — never bomb/buff — so this leaks nothing.
      this.preloadRandomSafe(2);
      this.economy.setRoundValueFromBackend(accCents, res.resp.step);
      if (res.resp.max_reached || res.resp.ended_by === 'maxwin') {
        this.triggerMaxWin(accCents, toBigInt(res.balance));
      } else {
        this.setState('running');
      }
    }
  }

  // ── Next card ──────────────────────────────────────────────────────────────

  private async advanceCard(): Promise<void> {
    if (this.state !== 'running') return;
    this.setState('transitioning');

    // ── Runner: swipe action ─────────────────────────────────────────────────
    let res;
    try {
      const req: RunnerPlayReq = { action: 'swipe' };
      if (this._freebetsLast) req.freebets_last = true;
      res = await this.runner.play(req);
    } catch (err) {
      console.error('[Game] Runner error on swipe:', err);
      this.ui.showError(`Connection error — ${String(err)}`);
      this.setState('running');
      return;
    }

    this.economy.balance = toBigInt(res.balance);
    this._applyFreebetsFromPlay(res.freebets);

    if (!res.resp) {
      this.ui.showError('Invalid runner response (missing resp).');
      this.setState('running');
      return;
    }

    const card = this.buildCardFromResp(res.resp);
    this.renderer.primeCard(card);
    await this.renderer.transitionTo(card);

    const accCents = BigInt(res.resp.acc_cents);

    if (res.resp.outcome === 'bomb') {
      await this.triggerBomb(toBigInt(res.balance));
    } else {
      // Preload 2 random safe videos while the user reads the current card.
      this.preloadRandomSafe(2);
      this.economy.setRoundValueFromBackend(accCents, res.resp.step);
      if (res.resp.max_reached || res.resp.ended_by === 'maxwin') {
        this.triggerMaxWin(accCents, toBigInt(res.balance));
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
      // ── Runner: cashout action ────────────────────────────────────────────
      let res;
      try {
        const req: RunnerPlayReq = { action: 'cashout' };
        if (this._freebetsLast) req.freebets_last = true;
        res = await this.runner.play(req);
      } catch (err) {
        console.error('[Game] Runner error on cashout:', err);
        this.ui.showError('Cashout failed — please retry');
        return;
      }

      if (!res.resp) {
        this.ui.showError('Invalid runner response on cashout.');
        return;
      }

      const gross      = BigInt(res.resp.acc_cents);
      const newBalance = toBigInt(res.balance);
      this._applyFreebetsFromPlay(res.freebets);

      this.economy.balance    = newBalance;
      this.economy.roundValue = 0n;
      this.economy.cardCount  = 0;

      this.setState('win');
      this.renderer.celebrateCashout();
      this.ui.setBalance(newBalance);
      this.ui.clearRoundHud();
      this.ui.showBottomBar({ roundValue: false, cashout: false, swipeHint: false });

      setTimeout(() => {
        this.ui.showPopupWin(gross, newBalance);
      }, 650);

      // Refresh balance authoritatively from info after round end
      void this.pollInfo();

    } finally {
      this.busy = false;
    }
  }

  // ── Max win (forced cashout at ×500 cap) ───────────────────────────────────

  private triggerMaxWin(accCents: bigint, newBalance: bigint): void {
    this.economy.balance    = newBalance;
    this.economy.roundValue = 0n;
    this.economy.cardCount  = 0;

    this.setState('win');
    this.renderer.celebrateCashout();
    this.ui.setBalance(newBalance);
    this.ui.clearRoundHud();
    this.ui.showBottomBar({ roundValue: false, cashout: false, swipeHint: false });

    setTimeout(() => {
      this.ui.showPopupMaxWin(accCents, newBalance);
    }, 650);

    void this.pollInfo();
  }

  // ── Bomb ───────────────────────────────────────────────────────────────────

  private async triggerBomb(newBalance: bigint): Promise<void> {
    this.setState('lose');

    this.renderer.shake(22, 32);
    this.renderer.glitchLines(7, 40);
    this.ui.flashRed(550);
    this.ui.glitchEffect(650);

    this.economy.balance = newBalance;
    this.economy.onBomb();
    this.ui.setBalance(newBalance);
    this.ui.clearRoundHud();
    this.ui.showBottomBar({ roundValue: false, cashout: false, swipeHint: false });

    await delay(950);
    this.ui.showPopupLose(this.economy.balance, this.currentBet);

    void this.pollInfo();
  }

  // ── Popup button ───────────────────────────────────────────────────────────

  private handlePopupButton(): void {
    if (this._pendingFreebetsOver) {
      this._pendingFreebetsOver = false;
      const fb = gameOptions.freebets;
      this.ui.showPopupFreebetsOver(
        BigInt(fb?.total_win ?? 0),
        fb?.issued ?? 0,
        this.economy.balance,
      );
      return; // swipe stays locked; next click will setState('intro')
    }
    this.setState('intro');
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
