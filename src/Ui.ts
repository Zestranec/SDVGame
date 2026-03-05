/**
 * Ui — manages all HTML overlay elements.
 * Pure DOM manipulation; no game logic here.
 */
export class Ui {
  private balanceEl    = document.getElementById('balance-display')!;
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

  readonly seedInput   = document.getElementById('seed-input')! as HTMLInputElement;
  readonly soundBtn    = document.getElementById('btn-sound')! as HTMLElement;

  // ── Balance ──────────────────────────────────────────────────────────────

  setBalance(value: number): void {
    this.balanceEl.textContent = value.toFixed(2);
  }

  // ── Round HUD ────────────────────────────────────────────────────────────

  setRoundValue(value: number, multiplier: number): void {
    this.roundValHud.textContent  = value.toFixed(2);
    this.roundValBig.textContent  = value.toFixed(2);
    this.multiplierEl.textContent = `×${multiplier.toFixed(2)}`;
    this.cashoutBtn.textContent   = `💰 Take Profit (+${value.toFixed(2)})`;
  }

  clearRoundHud(): void {
    this.roundValHud.textContent = '—';
  }

  // ── Bottom bar visibility ─────────────────────────────────────────────────

  showBottomBar(opts: { roundValue: boolean; cashout: boolean; swipeHint: boolean; hintText?: string }): void {
    this.roundValBig.style.display  = opts.roundValue ? 'block' : 'none';
    this.multiplierEl.style.display = opts.roundValue ? 'block' : 'none';
    this.cashoutBtn.style.display   = opts.cashout    ? 'block' : 'none';
    this.swipeHint.style.display    = opts.swipeHint  ? 'flex' : 'none';
    if (opts.hintText) this.swipeText.textContent = opts.hintText;
  }

  // ── Cashout button ────────────────────────────────────────────────────────

  onCashout(handler: () => void): void {
    this.cashoutBtn.addEventListener('click', handler);
  }

  // ── Popup ────────────────────────────────────────────────────────────────

  showPopupWin(cashoutAmount: number, balance: number): void {
    this.popupTitle.textContent    = 'NICE!';
    this.popupAmount.textContent   = `+${cashoutAmount.toFixed(2)} FUN`;
    this.popupAmount.className     = 'win';
    this.popupAmount.style.display = 'block';
    this.popupSubtitle.textContent = 'Safe feed. Take the FUN and keep scrolling.';
    this.popupBalance.textContent  = `Balance: ${balance.toFixed(2)} FUN`;
    this.popupBtn.textContent      = 'COLLECT';
    this.popupBtn.className        = 'popup-btn success';
    this._showPopup();
  }

  showPopupMaxWin(cashoutAmount: number, balance: number): void {
    this.popupTitle.textContent    = 'MAX WIN!';
    this.popupAmount.textContent   = `+${cashoutAmount.toFixed(2)} FUN`;
    this.popupAmount.className     = 'win';
    this.popupAmount.style.display = 'block';
    this.popupSubtitle.textContent = 'You hit the ×500 cap. Collect your winnings!';
    this.popupBalance.textContent  = `Balance: ${balance.toFixed(2)} FUN`;
    this.popupBtn.textContent      = 'COLLECT MAX WIN';
    this.popupBtn.className        = 'popup-btn success';
    this._showPopup();
  }

  showPopupLose(balance: number, bet = 10): void {
    this.popupTitle.textContent    = 'BUSTED';
    this.popupAmount.textContent   = `-${bet.toFixed(2)} FUN`;
    this.popupAmount.className     = 'lose';
    this.popupAmount.style.display = 'block';
    this.popupSubtitle.textContent = 'An agent caught you. Be careful next time.';
    this.popupBalance.textContent  = `Balance: ${balance.toFixed(2)} FUN`;
    this.popupBtn.textContent      = balance >= bet ? 'TRY AGAIN' : 'REFILL & PLAY';
    this.popupBtn.className        = 'popup-btn danger';
    this._showPopup();
  }

  showPopupBroke(): void {
    this.popupTitle.textContent    = 'BROKE!';
    this.popupAmount.style.display = 'none';
    this.popupSubtitle.textContent = 'You ran out of FUN. Refilling to 1000.';
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

  /**
   * Show a brief red error toast at the top of the screen.
   * Auto-dismisses after 3 seconds.
   */
  showError(message: string): void {
    let toast = document.getElementById('error-toast') as HTMLElement | null;
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'error-toast';
      Object.assign(toast.style, {
        position:     'fixed',
        top:          '70px',
        left:         '50%',
        transform:    'translateX(-50%)',
        background:   'rgba(180,20,20,0.92)',
        color:        '#fff',
        padding:      '10px 20px',
        borderRadius: '8px',
        fontSize:     '13px',
        fontWeight:   '700',
        zIndex:       '9999',
        pointerEvents: 'none',
        textAlign:    'center',
        maxWidth:     '80vw',
        boxShadow:    '0 2px 12px rgba(0,0,0,0.5)',
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
