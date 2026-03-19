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
  showPopupFreebetsFinished(_count: number, totalWin: bigint): void {
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

  // ── Insufficient funds overlay ───────────────────────────────────────────

  private _insuffEl:         HTMLElement | null = null;
  private _insuffBalanceEl:  HTMLElement | null = null;
  private _insuffBetEl:      HTMLElement | null = null;
  private _insuffDepositBtn: HTMLButtonElement | null = null;
  private _insuffCancelBtn:  HTMLButtonElement | null = null;

  showPopupInsufficientFunds(opts: {
    balanceInt: bigint;
    betInt: bigint;
    onDeposit: () => void;
    onCancel: () => void;
  }): void {
    if (!this._insuffEl) {
      // ── Dim backdrop (same as #popup) ───────────────────────────────────
      const overlay = document.createElement('div');
      Object.assign(overlay.style, {
        position:        'absolute',
        inset:           '0',
        display:         'flex',
        alignItems:      'flex-end',
        justifyContent:  'center',
        background:      'rgba(0,0,0,0.45)',
        zIndex:          '9700',
      });

      // ── Bottom sheet (mirrors #popup-sheet) ─────────────────────────────
      const sheet = document.createElement('div');
      Object.assign(sheet.style, {
        width:           'min(640px, 92vw)',
        padding:         '12px 24px',
        paddingBottom:   'max(28px, env(safe-area-inset-bottom))',
        background:      'rgba(16,16,16,0.88)',
        borderRadius:    '28px 28px 0 0',
        backdropFilter:  'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        boxShadow:       '0 -4px 48px rgba(0,0,0,0.7)',
        display:         'flex',
        flexDirection:   'column',
        alignItems:      'center',
      });

      // handle
      const handle = document.createElement('div');
      Object.assign(handle.style, {
        width: '36px', height: '4px',
        background: 'rgba(255,255,255,0.25)',
        borderRadius: '2px', marginBottom: '22px',
      });

      // title
      const titleEl = document.createElement('div');
      Object.assign(titleEl.style, {
        fontSize: '24px', fontWeight: '900',
        color: '#fff', letterSpacing: '0.5px',
        textAlign: 'center', marginBottom: '8px',
      });
      titleEl.textContent = 'INSUFFICIENT FUNDS';

      // subtitle
      const subtitleEl = document.createElement('div');
      Object.assign(subtitleEl.style, {
        fontSize: '14px', color: 'rgba(255,255,255,0.62)',
        textAlign: 'center', lineHeight: '1.55', marginBottom: '4px',
      });
      subtitleEl.textContent = 'Your balance is too low for this bet.';

      // balance + bet info
      const infoEl = document.createElement('div');
      Object.assign(infoEl.style, {
        fontSize: '13px', color: 'rgba(255,255,255,0.35)',
        textAlign: 'center', marginBottom: '22px', lineHeight: '1.7',
      });

      const balanceLine = document.createElement('div');
      const betLine     = document.createElement('div');
      infoEl.appendChild(balanceLine);
      infoEl.appendChild(betLine);

      // TOP UP button
      const depositBtn = document.createElement('button');
      Object.assign(depositBtn.style, {
        width: '100%', height: '56px',
        borderRadius: '14px', border: 'none',
        background: 'linear-gradient(135deg, #4d7aff, #2d55d4)',
        color: '#fff', fontSize: '16px', fontWeight: '800',
        letterSpacing: '0.5px', cursor: 'pointer',
        marginBottom: '10px',
      });
      depositBtn.textContent = 'TOP UP';

      // CANCEL button
      const cancelBtn = document.createElement('button');
      Object.assign(cancelBtn.style, {
        width: '100%', height: '48px',
        borderRadius: '14px',
        border: '1px solid rgba(255,255,255,0.18)',
        background: 'rgba(255,255,255,0.06)',
        color: 'rgba(255,255,255,0.70)', fontSize: '14px',
        fontWeight: '700', letterSpacing: '0.5px', cursor: 'pointer',
      });
      cancelBtn.textContent = 'CANCEL';

      sheet.appendChild(handle);
      sheet.appendChild(titleEl);
      sheet.appendChild(subtitleEl);
      sheet.appendChild(infoEl);
      sheet.appendChild(depositBtn);
      sheet.appendChild(cancelBtn);
      overlay.appendChild(sheet);
      this._frame.appendChild(overlay);

      this._insuffEl         = overlay;
      this._insuffBalanceEl  = balanceLine;
      this._insuffBetEl      = betLine;
      this._insuffDepositBtn = depositBtn;
      this._insuffCancelBtn  = cancelBtn;
    }

    // Update dynamic text
    if (this._insuffBalanceEl) {
      this._insuffBalanceEl.textContent = `Balance: ${this.ccy(this.fmtBalance(opts.balanceInt))}`;
    }
    if (this._insuffBetEl) {
      this._insuffBetEl.textContent = `Bet: ${this.ccy(this.fmtBet(opts.betInt))}`;
    }

    // Wire callbacks via onclick — replaces on every call, no accumulation
    if (this._insuffDepositBtn) this._insuffDepositBtn.onclick = opts.onDeposit;
    if (this._insuffCancelBtn)  this._insuffCancelBtn.onclick  = opts.onCancel;

    this._insuffEl.style.display = 'flex';
  }

  hidePopupInsufficientFunds(): void {
    if (this._insuffEl) this._insuffEl.style.display = 'none';
  }

  // ── Rules overlay ────────────────────────────────────────────────────────

  private _rulesEl: HTMLElement | null = null;

  /**
   * Show the full-screen rules overlay.
   * The rules text is split into sections at double newlines; the first line
   * of each section is rendered as a bold header.
   * onClose is called when the user taps X or CLOSE.
   */
  showRules(text: string, onClose: () => void): void {
    if (this._rulesEl) {
      this._rulesEl.style.display = 'flex';
      return;
    }

    // ── Dim backdrop ──────────────────────────────────────────────────────
    const overlay = document.createElement('div');
    Object.assign(overlay.style, {
      position:        'absolute',
      inset:           '0',
      display:         'flex',
      alignItems:      'flex-start',
      justifyContent:  'center',
      paddingTop:      'max(32px, env(safe-area-inset-top))',
      paddingBottom:   'max(24px, env(safe-area-inset-bottom))',
      background:      'rgba(0,0,0,0.72)',
      zIndex:          '9800',
      boxSizing:       'border-box',
    });

    // ── Glass panel ───────────────────────────────────────────────────────
    const panel = document.createElement('div');
    Object.assign(panel.style, {
      display:          'flex',
      flexDirection:    'column',
      width:            'min(420px, 92%)',
      maxHeight:        '85%',
      background:       'rgba(8,0,20,0.82)',
      backdropFilter:   'blur(14px)',
      WebkitBackdropFilter: 'blur(14px)',
      border:           '1px solid rgba(255,255,255,0.12)',
      borderRadius:     '20px',
      overflow:         'hidden',
      boxShadow:        '0 8px 48px rgba(0,0,0,0.85)',
    });

    // ── Header ────────────────────────────────────────────────────────────
    const header = document.createElement('div');
    Object.assign(header.style, {
      display:        'flex',
      alignItems:     'center',
      justifyContent: 'space-between',
      padding:        '16px 20px 14px',
      borderBottom:   '1px solid rgba(255,255,255,0.08)',
      flexShrink:     '0',
    });

    const title = document.createElement('span');
    Object.assign(title.style, {
      fontSize:      '13px',
      fontWeight:    '800',
      letterSpacing: '2px',
      textTransform: 'uppercase',
      color:         'rgba(255,255,255,0.90)',
    });
    title.textContent = 'GAME RULES';

    const closeX = document.createElement('button');
    Object.assign(closeX.style, {
      background:   'rgba(255,255,255,0.08)',
      border:       '1px solid rgba(255,255,255,0.15)',
      borderRadius: '50%',
      width:        '30px',
      height:       '30px',
      color:        'rgba(255,255,255,0.75)',
      fontSize:     '16px',
      cursor:       'pointer',
      lineHeight:   '1',
      padding:      '0',
      flexShrink:   '0',
    });
    closeX.textContent = '✕';
    closeX.addEventListener('click', onClose);

    header.appendChild(title);
    header.appendChild(closeX);

    // ── Scrollable body ───────────────────────────────────────────────────
    const body = document.createElement('div');
    Object.assign(body.style, {
      flex:        '1',
      overflowY:   'auto',
      padding:     '18px 20px',
      color:       'rgba(255,255,255,0.80)',
      fontSize:    '13px',
      lineHeight:  '1.65',
    });

    // Render sections: double-newline separates sections; first line = header
    const sections = text.split('\n\n');
    for (const section of sections) {
      const lines = section.split('\n');
      const sectionEl = document.createElement('div');
      Object.assign(sectionEl.style, { marginBottom: '18px' });

      const sectionHeader = document.createElement('div');
      Object.assign(sectionHeader.style, {
        fontSize:      '11px',
        fontWeight:    '800',
        letterSpacing: '1.4px',
        textTransform: 'uppercase',
        color:         'rgba(160,120,255,0.95)',
        marginBottom:  '6px',
      });
      sectionHeader.textContent = lines[0];

      const sectionBody = document.createElement('div');
      Object.assign(sectionBody.style, { whiteSpace: 'pre-wrap' });
      sectionBody.textContent = lines.slice(1).join('\n');

      sectionEl.appendChild(sectionHeader);
      sectionEl.appendChild(sectionBody);
      body.appendChild(sectionEl);
    }

    // ── Footer close button ───────────────────────────────────────────────
    const footer = document.createElement('div');
    Object.assign(footer.style, {
      padding:      '12px 20px 16px',
      borderTop:    '1px solid rgba(255,255,255,0.07)',
      flexShrink:   '0',
    });

    const closeBtn = document.createElement('button');
    Object.assign(closeBtn.style, {
      display:       'block',
      width:         '100%',
      padding:       '12px',
      background:    'rgba(255,255,255,0.08)',
      border:        '1px solid rgba(255,255,255,0.18)',
      borderRadius:  '12px',
      color:         '#fff',
      fontSize:      '13px',
      fontWeight:    '800',
      letterSpacing: '1.5px',
      cursor:        'pointer',
    });
    closeBtn.textContent = 'CLOSE';
    closeBtn.addEventListener('click', onClose);

    footer.appendChild(closeBtn);

    panel.appendChild(header);
    panel.appendChild(body);
    panel.appendChild(footer);
    overlay.appendChild(panel);
    this._frame.appendChild(overlay);
    this._rulesEl = overlay;
  }

  hideRules(): void {
    if (this._rulesEl) this._rulesEl.style.display = 'none';
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
