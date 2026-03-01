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

  private popup        = document.getElementById('popup')! as HTMLElement;
  private popupEmoji   = document.getElementById('popup-emoji')!;
  private popupTitle   = document.getElementById('popup-title')!;
  private popupSubtitle = document.getElementById('popup-subtitle')!;
  private popupAmount  = document.getElementById('popup-amount')! as HTMLElement;
  private popupBtn     = document.getElementById('popup-btn')! as HTMLButtonElement;

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
    this.popupEmoji.textContent    = '💰';
    this.popupTitle.textContent    = 'Cashed Out!';
    this.popupSubtitle.textContent = `Balance: ${balance.toFixed(2)} FUN`;
    this.popupAmount.textContent   = `+${cashoutAmount.toFixed(2)} FUN`;
    this.popupAmount.className     = 'win';
    this.popupAmount.style.display = 'block';
    this.popupBtn.textContent      = '▶ Play Again';
    this.popupBtn.className        = 'popup-btn success';
    this._showPopup();
  }

  showPopupLose(balance: number): void {
    this.popupEmoji.textContent    = '💥';
    this.popupTitle.textContent    = 'Busted!';
    this.popupSubtitle.textContent = `The bomb dropped. Round over.\nBalance: ${balance.toFixed(2)} FUN`;
    this.popupAmount.textContent   = '-10.00 FUN';
    this.popupAmount.className     = 'lose';
    this.popupAmount.style.display = 'block';
    this.popupBtn.textContent      = balance >= 10 ? '▶ Try Again' : '↺ Refill & Play';
    this.popupBtn.className        = 'popup-btn danger';
    this._showPopup();
  }

  showPopupBroke(): void {
    this.popupEmoji.textContent    = '😅';
    this.popupTitle.textContent    = 'Broke!';
    this.popupSubtitle.textContent = 'You ran out of FUN.\nRefilling balance to 1000.';
    this.popupAmount.style.display = 'none';
    this.popupBtn.textContent      = '↺ Refill & Play';
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
