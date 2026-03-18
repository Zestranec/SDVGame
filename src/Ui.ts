/**
 * Ui — manages all HTML overlay elements.
 * Pure DOM manipulation; no game logic here.
 *
 * All monetary parameters are bigint subunits.
 * Formatting is delegated to moneyFormat.ts.
 */

import {
  type CurrencyOptions,
  formatAmount,
  countRequiredDecimals,
  devAssertNoRounding,
} from './moneyFormat';

export class Ui {
  private balanceEl    = document.getElementById('balance-display')!;
  private betEl        = document.getElementById('bet-display')!;
  private roundValHud  = document.getElementById('round-val-hud')!;
  private roundValBig  = document.getElementById('round-value-display')! as HTMLElement;
  private multiplierEl = document.getElementById('multiplier-display')! as HTMLElement;
  private cashoutBtn   = document.getElementById('btn-cashout')! as HTMLButtonElement;
  private swipeHint    = document.getElementById('swipe-hint')! as HTMLElement;
  private swipeText    = document.getElementById('swipe-hint-text')! as HTMLElement;
  private flashEl      = document.getElementById('flash-overlay')! as HTMLElement;
  private glitchEl     = document.getElementById('glitch-overlay')! as HTMLElement;

  private popup         = document.getElementById('popup')! as HTMLElement;
  private popupTitle    = document.getElementById('popup-title')!;
  private popupAmount   = document.getElementById('popup-amount')! as HTMLElement;
  private popupSubtitle = document.getElementById('popup-subtitle')!;
  private popupBalance  = document.getElementById('popup-balance')!;
  private popupBtn      = document.getElementById('popup-btn')! as HTMLButtonElement;

  readonly seedInput = document.getElementById('seed-input')! as HTMLInputElement;
  readonly soundBtn  = document.getElementById('btn-sound')! as HTMLElement;

  // Currency config — set once at game init via setCurrencyConfig().
  // Defaults are neutral placeholders; overwritten before any display call.
  private currency: CurrencyOptions = { subunits: 100, exponent: 2, code: '' };
  private feDecimals  = 2;

  // ── Currency config ───────────────────────────────────────────────────────

  /** Called once at game init with server-provided currency options. */
  setCurrencyConfig(currency: CurrencyOptions, feDecimals: number): void {
    this.currency   = currency;
    this.feDecimals = feDecimals;
  }

  /** Returns #game-frame (or body as fallback) — parent for dynamically injected overlays. */
  private get _frame(): HTMLElement {
    return document.getElementById('game-frame') ?? document.body;
  }

  // ── Internal helpers ──────────────────────────────────────────────────────

  /** Format an amount for bet display (no trailing-zero trimming). */
  private fmtBet(valueInt: bigint): string {
    return formatAmount(valueInt, this.currency, this.feDecimals, false);
  }

  /** Format a win/round-value amount (trim trailing zeros, min feDecimals). */
  private fmtWin(valueInt: bigint): string {
    const s = formatAmount(valueInt, this.currency, this.feDecimals, true);
    devAssertNoRounding('win', valueInt, this.currency, s);
    return s;
  }

  /** Format a balance (expand decimals if wallet requires more for exact display). */
  private fmtBalance(valueInt: bigint): string {
    const required = countRequiredDecimals(valueInt, BigInt(this.currency.subunits));
    const decimals  = Math.max(this.feDecimals, required);
    const s = formatAmount(valueInt, this.currency, decimals, true);
    devAssertNoRounding('balance', valueInt, this.currency, s);
    return s;
  }

  private ccy(str: string): string {
    return this.currency.code ? `${str} ${this.currency.code}` : str;
  }

  // ── Balance ──────────────────────────────────────────────────────────────

  setBalance(balanceInt: bigint): void {
    this.balanceEl.textContent = this.ccy(this.fmtBalance(balanceInt));
  }

  /** Update the Bet HUD item with the currently selected bet. */
  setCurrentBet(betInt: bigint): void {
    this.betEl.textContent = this.ccy(this.fmtBet(betInt));
  }

  // ── Round HUD ────────────────────────────────────────────────────────────

  setRoundValue(valueInt: bigint, multiplier: number): void {
    const str = this.fmtWin(valueInt);
    this.roundValHud.textContent  = str;
    this.roundValBig.textContent  = str;
    this.multiplierEl.textContent = `×${multiplier.toFixed(2)}`;
    this.cashoutBtn.textContent   = `💰 Take Profit (+${str})`;
  }

  clearRoundHud(): void {
    this.roundValHud.textContent = '—';
  }

  // ── Bottom bar visibility ─────────────────────────────────────────────────

  showBottomBar(opts: { roundValue: boolean; cashout: boolean; swipeHint: boolean; hintText?: string }): void {
    this.roundValBig.style.display  = opts.roundValue ? 'block' : 'none';
    this.multiplierEl.style.display = opts.roundValue ? 'block' : 'none';
    this.cashoutBtn.style.display   = opts.cashout    ? 'block' : 'none';
    this.swipeHint.style.display    = opts.swipeHint  ? 'flex'  : 'none';
    if (opts.hintText) this.swipeText.textContent = opts.hintText;
  }

  // ── Cashout button ────────────────────────────────────────────────────────

  onCashout(handler: () => void): void {
    this.cashoutBtn.addEventListener('click', handler);
  }

  // ── Popup ────────────────────────────────────────────────────────────────

  showPopupWin(cashoutInt: bigint, balanceInt: bigint): void {
    const win = this.fmtWin(cashoutInt);
    const bal = this.fmtBalance(balanceInt);
    devAssertNoRounding('popup-win', cashoutInt, this.currency,
      formatAmount(cashoutInt, this.currency, this.feDecimals, true));

    this.popupTitle.textContent    = 'NICE!';
    this.popupAmount.textContent   = `+${this.ccy(win)}`;
    this.popupAmount.className     = 'win';
    this.popupAmount.style.display = 'block';
    this.popupSubtitle.textContent = 'Safe feed. Keep scrolling!';
    this.popupBalance.textContent  = `Balance: ${this.ccy(bal)}`;
    this.popupBtn.textContent      = 'COLLECT';
    this.popupBtn.className        = 'popup-btn success';
    this._showPopup();
  }

  showPopupMaxWin(cashoutInt: bigint, balanceInt: bigint): void {
    const win = this.fmtWin(cashoutInt);
    const bal = this.fmtBalance(balanceInt);

    this.popupTitle.textContent    = 'MAX WIN!';
    this.popupAmount.textContent   = `+${this.ccy(win)}`;
    this.popupAmount.className     = 'win';
    this.popupAmount.style.display = 'block';
    this.popupSubtitle.textContent = 'You hit the ×500 cap. Collect your winnings!';
    this.popupBalance.textContent  = `Balance: ${this.ccy(bal)}`;
    this.popupBtn.textContent      = 'COLLECT MAX WIN';
    this.popupBtn.className        = 'popup-btn success';
    this._showPopup();
  }

  showPopupLose(balanceInt: bigint, betInt: bigint): void {
    const bet = this.fmtBet(betInt);
    const bal = this.fmtBalance(balanceInt);

    this.popupTitle.textContent    = 'BUSTED';
    this.popupAmount.textContent   = `-${this.ccy(bet)}`;
    this.popupAmount.className     = 'lose';
    this.popupAmount.style.display = 'block';
    this.popupSubtitle.textContent = 'An agent caught you. Be careful next time.';
    this.popupBalance.textContent  = `Balance: ${this.ccy(bal)}`;
    this.popupBtn.textContent      = balanceInt >= betInt ? 'TRY AGAIN' : 'REFILL & PLAY';
    this.popupBtn.className        = 'popup-btn danger';
    this._showPopup();
  }

  showPopupBroke(): void {
    this.popupTitle.textContent    = 'BROKE!';
    this.popupAmount.style.display = 'none';
    this.popupSubtitle.textContent = 'You ran out of credit. Refilling to starting balance.';
    this.popupBalance.textContent  = '';
    this.popupBtn.textContent      = 'REFILL & PLAY';
    this.popupBtn.className        = 'popup-btn primary';
    this._showPopup();
  }

  onPopupButton(handler: () => void): void {
    this.popupBtn.addEventListener('click', handler);
  }

  hidePopup(): void {
    this.popup.classList.add('hidden');
  }

  private _showPopup(): void {
    this.popup.classList.remove('hidden');
  }

  // ── Error toast ──────────────────────────────────────────────────────────

  showError(message: string): void {
    let toast = document.getElementById('error-toast') as HTMLElement | null;
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'error-toast';
      Object.assign(toast.style, {
        position:      'absolute',
        top:           '70px',
        left:          '50%',
        transform:     'translateX(-50%)',
        background:    'rgba(180,20,20,0.92)',
        color:         '#fff',
        padding:       '10px 20px',
        borderRadius:  '8px',
        fontSize:      '13px',
        fontWeight:    '700',
        zIndex:        '9999',
        pointerEvents: 'none',
        textAlign:     'center',
        maxWidth:      '80%',
        boxShadow:     '0 2px 12px rgba(0,0,0,0.5)',
      });
      this._frame.appendChild(toast);
    }
    toast.textContent = message;
    toast.style.display = 'block';
    toast.style.opacity = '1';
    clearTimeout((toast as HTMLElement & { _timer?: ReturnType<typeof setTimeout> })._timer);
    (toast as HTMLElement & { _timer?: ReturnType<typeof setTimeout> })._timer = setTimeout(() => {
      if (toast) toast.style.display = 'none';
    }, 3000);
  }

  // ── Freebet notifications ────────────────────────────────────────────────

  /** Small glass toast below the HUD — auto-closes after 5 s, tap to close. */
  showPopupFreebetsAwarded(count: number): void {
    this._showToast(
      'top',
      `🎁  You've been awarded ${count} free play${count !== 1 ? 's' : ''}`,
      5000,
    );
  }

  /** Small bottom snackbar — auto-closes after 2.5 s, tap to close. */
  showPopupFreebetsFinished(count: number, totalWin: bigint): void {
    const winStr = this.ccy(this.fmtWin(totalWin));
    this._showToast(
      'bottom',
      `FREE PLAYS OVER\nWon +${winStr}. Switching to balance.`,
      2500,
    );
  }

  /**
   * Generic glass toast.
   * pos='top'    → below the top HUD, horizontally centered
   * pos='bottom' → above the bottom bar, horizontally centered
   * The first line of message is rendered bold; subsequent lines are muted.
   */
  private _showToast(pos: 'top' | 'bottom', message: string, duration: number): void {
    const id = pos === 'top' ? 'fb-toast-top' : 'fb-toast-bottom';
    let el = document.getElementById(id) as HTMLElement | null;
    if (!el) {
      el = document.createElement('div');
      el.id = id;
      Object.assign(el.style, {
        position:          'absolute',
        left:              '50%',
        transform:         'translateX(-50%)',
        background:        'rgba(14,14,14,0.90)',
        border:            '1px solid rgba(255,255,255,0.13)',
        borderRadius:      '18px',
        padding:           '12px 20px',
        maxWidth:          '80%',
        textAlign:         'center',
        color:             '#fff',
        fontSize:          '13px',
        fontWeight:        '700',
        lineHeight:        '1.55',
        zIndex:            '9900',
        cursor:            'pointer',
        whiteSpace:        'pre-line',
        backdropFilter:    'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        boxShadow:         '0 4px 24px rgba(0,0,0,0.7)',
        letterSpacing:     '0.02em',
        pointerEvents:     'all',
      });
      if (pos === 'top') {
        el.style.top = 'max(72px, calc(env(safe-area-inset-top) + 62px))';
      } else {
        el.style.bottom = 'max(90px, calc(env(safe-area-inset-bottom) + 82px))';
      }
      el.addEventListener('click', () => { if (el) el.style.display = 'none'; });
      this._frame.appendChild(el);
    }

    // First line bold, rest muted — render inline without extra DOM nodes
    const lines = message.split('\n');
    if (lines.length > 1) {
      el.innerHTML =
        `<span style="font-size:14px;font-weight:800">${lines[0]}</span>` +
        `\n<span style="font-weight:500;color:rgba(255,255,255,0.62)">${lines.slice(1).join('\n')}</span>`;
    } else {
      el.textContent = message;
    }

    el.style.display = 'block';
    clearTimeout((el as HTMLElement & { _t?: ReturnType<typeof setTimeout> })._t);
    (el as HTMLElement & { _t?: ReturnType<typeof setTimeout> })._t =
      setTimeout(() => { if (el) el.style.display = 'none'; }, duration);
  }

  // ── Freebets counter label ────────────────────────────────────────────────

  private _fbCounterEl: HTMLElement | null = null;

  showFreebetsCounter(done: number, issued: number, totalWin: bigint): void {
    if (!this._fbCounterEl) {
      const el = document.createElement('div');
      el.id = 'fb-counter';
      Object.assign(el.style, {
        position:          'absolute',
        top:               'max(10px, env(safe-area-inset-top))',
        right:             '16px',
        display:           'flex',
        flexDirection:     'column',
        alignItems:        'center',
        gap:               '1px',
        background:        'rgba(255,255,255,0.10)',
        border:            '1px solid rgba(255,255,255,0.18)',
        borderRadius:      '10px',
        padding:           '6px 10px',
        backdropFilter:    'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        zIndex:            '8888',
        pointerEvents:     'none',
        minWidth:          '72px',
      });

      const label = document.createElement('span');
      Object.assign(label.style, {
        fontSize:      '9px',
        textTransform: 'uppercase',
        letterSpacing: '1.2px',
        color:         'rgba(255,255,255,0.55)',
        fontWeight:    '600',
      });
      label.textContent = '🎁 FREE PLAYS';

      const progress = document.createElement('span');
      Object.assign(progress.style, {
        fontSize:   '15px',
        fontWeight: '700',
        color:      '#fff',
        textShadow: '0 1px 6px rgba(0,0,0,0.9)',
        lineHeight: '1.2',
      });
      progress.id = 'fb-counter-progress';

      const winLabel = document.createElement('span');
      Object.assign(winLabel.style, {
        fontSize:      '8px',
        textTransform: 'uppercase',
        letterSpacing: '1px',
        color:         'rgba(255,255,255,0.40)',
        fontWeight:    '600',
        marginTop:     '3px',
      });
      winLabel.textContent = 'TOTAL WIN';

      const winValue = document.createElement('span');
      Object.assign(winValue.style, {
        fontSize:   '11px',
        fontWeight: '700',
        color:      '#4ade80',
        textShadow: '0 1px 4px rgba(0,0,0,0.8)',
        lineHeight: '1.2',
      });
      winValue.id = 'fb-counter-win';

      el.appendChild(label);
      el.appendChild(progress);
      el.appendChild(winLabel);
      el.appendChild(winValue);
      this._frame.appendChild(el);
      this._fbCounterEl = el;
    }

    const progressEl = document.getElementById('fb-counter-progress');
    const winEl      = document.getElementById('fb-counter-win');
    if (progressEl) progressEl.textContent = `${done} / ${issued}`;
    if (winEl)      winEl.textContent      = this.ccy(this.fmtWin(totalWin));
    this._fbCounterEl.style.display = 'flex';
  }

  showPopupFreebetsOver(totalWin: bigint, rounds: number, balance: bigint): void {
    const win = this.fmtWin(totalWin);
    const bal = this.fmtBalance(balance);

    this.popupTitle.textContent    = 'FREE PLAYS OVER';
    this.popupAmount.textContent   = `+${this.ccy(win)}`;
    this.popupAmount.className     = 'win';
    this.popupAmount.style.display = 'block';
    this.popupSubtitle.textContent = 'Next swipes will be from your account funds.';
    this.popupBalance.textContent  =
      `Won +${this.ccy(win)} in ${rounds} round${rounds !== 1 ? 's' : ''} · Balance: ${this.ccy(bal)}`;
    this.popupBtn.textContent      = 'COLLECT';
    this.popupBtn.className        = 'popup-btn success';
    this._showPopup();
  }

  hideFreebetsCounter(): void {
    if (this._fbCounterEl) this._fbCounterEl.style.display = 'none';
  }

  // ── Flash (bomb) ──────────────────────────────────────────────────────────

  flashRed(durationMs = 500): void {
    this.flashEl.style.transition = 'none';
    this.flashEl.style.opacity = '0.65';
    setTimeout(() => {
      this.flashEl.style.transition = `opacity ${durationMs}ms ease-out`;
      this.flashEl.style.opacity = '0';
    }, 60);
  }

  glitchEffect(durationMs = 600): void {
    this.glitchEl.style.display = 'block';
    const lines = this.glitchEl.querySelectorAll('.glitch-line') as NodeListOf<HTMLElement>;
    lines.forEach(l => l.remove());
    for (let i = 0; i < 8; i++) {
      const l = document.createElement('div');
      l.className = 'glitch-line';
      l.style.top = `${Math.random() * 100}%`;
      l.style.opacity = String(0.4 + Math.random() * 0.5);
      this.glitchEl.appendChild(l);
    }
    setTimeout(() => {
      this.glitchEl.style.display = 'none';
    }, durationMs);
  }

  // ── Replay controls ───────────────────────────────────────────────────────

  private _replayEl:     HTMLElement | null = null;
  private _replayBack:   HTMLButtonElement | null = null;
  private _replayNext:   HTMLButtonElement | null = null;
  private _replayLabel:  HTMLElement | null = null;

  showReplayControls(onBack: () => void, onNext: () => void): void {
    if (this._replayEl) return; // already created

    const wrap = document.createElement('div');
    Object.assign(wrap.style, {
      position:       'absolute',
      bottom:         '32px',
      left:           '50%',
      transform:      'translateX(-50%)',
      display:        'flex',
      alignItems:     'center',
      gap:            '14px',
      background:     'rgba(10,0,30,0.88)',
      border:         '1px solid rgba(160,80,255,0.4)',
      borderRadius:   '40px',
      padding:        '10px 22px',
      zIndex:         '9000',
      userSelect:     'none',
    });

    const mkBtn = (label: string): HTMLButtonElement => {
      const b = document.createElement('button');
      b.textContent = label;
      Object.assign(b.style, {
        background:   'rgba(255,255,255,0.08)',
        border:       '1px solid rgba(255,255,255,0.2)',
        borderRadius: '20px',
        color:        '#fff',
        fontSize:     '15px',
        fontWeight:   '700',
        padding:      '6px 20px',
        cursor:       'pointer',
      });
      return b;
    };

    const backBtn  = mkBtn('◀ Back');
    const nextBtn  = mkBtn('Next ▶');
    const labelEl  = document.createElement('span');
    Object.assign(labelEl.style, {
      color:      '#d8b4fe',
      fontSize:   '13px',
      fontWeight: '700',
      minWidth:   '80px',
      textAlign:  'center',
    });

    backBtn.addEventListener('click', onBack);
    nextBtn.addEventListener('click', onNext);

    wrap.appendChild(backBtn);
    wrap.appendChild(labelEl);
    wrap.appendChild(nextBtn);
    this._frame.appendChild(wrap);

    this._replayEl    = wrap;
    this._replayBack  = backBtn;
    this._replayNext  = nextBtn;
    this._replayLabel = labelEl;

    // Hide normal game chrome during replay
    this.showBottomBar({ roundValue: false, cashout: false, swipeHint: false });
  }

  updateReplayControls(currentIndex: number, total: number): void {
    if (!this._replayEl) return;
    if (this._replayLabel) {
      this._replayLabel.textContent = `Step ${currentIndex + 1} / ${total}`;
    }
    if (this._replayBack) {
      this._replayBack.disabled = currentIndex === 0;
      this._replayBack.style.opacity = currentIndex === 0 ? '0.35' : '1';
    }
    if (this._replayNext) {
      this._replayNext.disabled = currentIndex >= total - 1;
      this._replayNext.style.opacity = currentIndex >= total - 1 ? '0.35' : '1';
    }
  }
}
