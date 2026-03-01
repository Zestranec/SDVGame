/**
 * Ui — manages all HTML overlay elements for SpinTok mode.
 * Pure DOM manipulation; no game logic here.
 */
export class Ui {
  private balanceEl   = document.getElementById('balance-display')!   as HTMLElement;
  private levelNumEl  = document.getElementById('level-number')!       as HTMLElement;
  private levelHudEl  = document.getElementById('level-hud-item')!     as HTMLElement;
  private cashoutPrev = document.getElementById('cashout-preview')!    as HTMLElement;

  private actionArea  = document.getElementById('action-area')!        as HTMLElement;
  private likeBtn     = document.getElementById('btn-like')!            as HTMLButtonElement;
  private dislikeBtn  = document.getElementById('btn-dislike')!         as HTMLButtonElement;
  private collectBtn  = document.getElementById('btn-collect')!         as HTMLButtonElement;

  private flashEl     = document.getElementById('flash-overlay')!      as HTMLElement;
  private glitchEl    = document.getElementById('glitch-overlay')!     as HTMLElement;

  private popup         = document.getElementById('popup')!            as HTMLElement;
  private popupTitle    = document.getElementById('popup-title')!;
  private popupAmount   = document.getElementById('popup-amount')!     as HTMLElement;
  private popupSubtitle = document.getElementById('popup-subtitle')!;
  private popupBalance  = document.getElementById('popup-balance')!;
  private popupBtn      = document.getElementById('popup-btn')!        as HTMLButtonElement;

  readonly seedInput = document.getElementById('seed-input')! as HTMLInputElement;
  readonly soundBtn  = document.getElementById('btn-sound')!  as HTMLElement;

  // ── Balance ──────────────────────────────────────────────────────────────

  setBalance(value: number): void {
    this.balanceEl.textContent = value.toFixed(2);
  }

  // ── Level HUD ────────────────────────────────────────────────────────────

  /**
   * Show the level pill and cashout preview.
   * @param level           Current SpinTok level (1-22).
   * @param previewText     e.g. "×2.5 = 25.00 FUN"
   */
  setLevelHud(level: number, previewText: string): void {
    this.levelNumEl.textContent  = String(level);
    this.cashoutPrev.textContent = previewText;
    this.levelHudEl.style.display = 'flex';
  }

  hideLevelHud(): void {
    this.levelHudEl.style.display = 'none';
  }

  // ── Action buttons ───────────────────────────────────────────────────────

  /**
   * Show the bottom action area.
   * @param collectOnly  When true (level 22) show only COLLECT; otherwise LIKE + DISLIKE.
   */
  showLikeDislike(collectOnly = false): void {
    this.actionArea.style.display = 'flex';
    if (collectOnly) {
      this.likeBtn.style.display    = 'none';
      this.dislikeBtn.style.display = 'none';
      this.collectBtn.style.display = 'block';
    } else {
      this.likeBtn.style.display    = 'block';
      this.dislikeBtn.style.display = 'block';
      this.collectBtn.style.display = 'none';
    }
  }

  hideActions(): void {
    this.actionArea.style.display = 'none';
  }

  onLike(handler: () => void): void {
    this.likeBtn.addEventListener('click', handler);
  }

  onDislike(handler: () => void): void {
    this.dislikeBtn.addEventListener('click', handler);
  }

  onCollect(handler: () => void): void {
    this.collectBtn.addEventListener('click', handler);
  }

  // ── Popup ────────────────────────────────────────────────────────────────

  showPopupWin(cashoutAmount: number, balance: number): void {
    this.popupTitle.textContent    = 'NICE!';
    this.popupAmount.textContent   = `+${cashoutAmount.toFixed(2)} FUN`;
    this.popupAmount.className     = 'win';
    this.popupAmount.style.display = 'block';
    this.popupSubtitle.textContent = 'You cashed out. Keep scrolling.';
    this.popupBalance.textContent  = `Balance: ${balance.toFixed(2)} FUN`;
    this.popupBtn.textContent      = 'PLAY AGAIN';
    this.popupBtn.className        = 'popup-btn success';
    this._showPopup();
  }

  showPopupLose(balance: number, bet = 10): void {
    this.popupTitle.textContent    = 'BUSTED';
    this.popupAmount.textContent   = `-${bet.toFixed(2)} FUN`;
    this.popupAmount.className     = 'lose';
    this.popupAmount.style.display = 'block';
    this.popupSubtitle.textContent = 'That LIKE bombed. Be more careful.';
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

  // ── Flash (lose effect) ───────────────────────────────────────────────────

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
