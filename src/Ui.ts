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
        position:      'fixed',
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
        maxWidth:      '80vw',
        boxShadow:     '0 2px 12px rgba(0,0,0,0.5)',
      });
      document.body.appendChild(toast);
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

  /** Transient notification popup — auto-closes after 5 s, click to close. */
  private _showNotificationPopup(message: string): void {
    let el = document.getElementById('notif-popup') as HTMLElement | null;
    if (!el) {
      el = document.createElement('div');
      el.id = 'notif-popup';
      Object.assign(el.style, {
        position:       'fixed',
        top:            '50%',
        left:           '50%',
        transform:      'translate(-50%, -50%)',
        background:     '#0d0020',
        border:         '2px solid rgba(160,80,255,0.55)',
        borderRadius:   '14px',
        padding:        '28px 36px',
        maxWidth:       '80vw',
        textAlign:      'center',
        color:          '#fff',
        fontSize:       '16px',
        fontWeight:     '700',
        lineHeight:     '1.6',
        zIndex:         '99999',
        boxShadow:      '0 8px 32px rgba(0,0,0,0.85)',
        cursor:         'pointer',
        whiteSpace:     'pre-line',
      });
      el.addEventListener('click', () => { if (el) el.style.display = 'none'; });
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.style.display = 'block';
    clearTimeout((el as HTMLElement & { _t?: ReturnType<typeof setTimeout> })._t);
    (el as HTMLElement & { _t?: ReturnType<typeof setTimeout> })._t =
      setTimeout(() => { if (el) el.style.display = 'none'; }, 5000);
  }

  showPopupFreebetsAwarded(count: number): void {
    this._showNotificationPopup(`You have been rewarded with ${count} free plays`);
  }

  showPopupFreebetsFinished(count: number, totalWin: bigint): void {
    const winStr = this.ccy(this.fmtWin(totalWin));
    this._showNotificationPopup(
      `You played ${count} free plays and won ${winStr}.\nNext swipes will be performed from your account balance.`,
    );
  }

  // ── Freebets counter label ────────────────────────────────────────────────

  private _fbCounterEl: HTMLElement | null = null;

  showFreebetsCounter(remaining: number, total: number): void {
    if (!this._fbCounterEl) {
      const el = document.createElement('div');
      el.id = 'fb-counter';
      Object.assign(el.style, {
        position:      'fixed',
        top:           '12px',
        left:          '50%',
        transform:     'translateX(-50%)',
        background:    'rgba(10,0,30,0.82)',
        color:         '#d8b4fe',
        padding:       '5px 18px',
        borderRadius:  '20px',
        fontSize:      '13px',
        fontWeight:    '700',
        zIndex:        '8888',
        pointerEvents: 'none',
        textAlign:     'center',
        whiteSpace:    'nowrap',
        border:        '1px solid rgba(160,80,255,0.35)',
        letterSpacing: '0.03em',
      });
      document.body.appendChild(el);
      this._fbCounterEl = el;
    }
    this._fbCounterEl.textContent = `Free Plays  ${remaining} / ${total}`;
    this._fbCounterEl.style.display = 'block';
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
}
