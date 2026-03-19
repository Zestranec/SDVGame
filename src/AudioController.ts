/**
 * AudioController — three-track music system (lobby / safe / bomb).
 *
 * Tracks:
 *   lobby — loops while in menu (intro / quick_rules)
 *   safe  — loops during an active round
 *   bomb  — plays once on round loss; silence afterwards
 *
 * Usage:
 *   const audio = new AudioController();
 *   audio.unlock();           // call synchronously inside first user gesture
 *   audio.playLobby();
 *   audio.playSafe();
 *   audio.playBombOnceThenSilence();
 *   audio.stopAll();
 *   audio.setEnabled(false);  // mute; remembers track for resume
 */

/// <reference types="vite/client" />

function makeAudio(src: string, volume: number, loop: boolean): HTMLAudioElement {
  const el = new Audio(src);
  el.volume = volume;
  el.loop   = loop;
  el.preload = 'auto';
  return el;
}

type Track = 'lobby' | 'safe' | 'bomb' | 'silent';

export class AudioController {
  private readonly lobby: HTMLAudioElement;
  private readonly safe:  HTMLAudioElement;
  private readonly bomb:  HTMLAudioElement;

  private enabled  = true;
  private unlocked = false;
  /** Which track should be playing when enabled. */
  private desired: Track = 'silent';

  constructor() {
    const base = import.meta.env.BASE_URL;
    this.lobby = makeAudio(`${base}assets/audio/lobby.mp3`, 0.55, true);
    this.safe  = makeAudio(`${base}assets/audio/safe.mp3`,  0.65, true);
    this.bomb  = makeAudio(`${base}assets/audio/bomb.mp3`,  0.75, false);

    this.bomb.addEventListener('ended', () => {
      // After bomb finishes, stay silent — no auto-resume.
      this.desired = 'silent';
    });
  }

  /**
   * Must be called synchronously inside the first user gesture (swipe/tap).
   * Plays a silent fragment on each track to satisfy browser autoplay policy.
   */
  unlock(): void {
    if (this.unlocked) return;
    this.unlocked = true;
    for (const el of [this.lobby, this.safe, this.bomb]) {
      el.muted = true;
      void el.play().then(() => { el.pause(); el.currentTime = 0; el.muted = false; }).catch(() => {});
    }
  }

  // ── Public playback API ─────────────────────────────────────────────────────

  playLobby(): void {
    this.desired = 'lobby';
    if (!this.enabled) return;
    this._stop(this.safe);
    this._stop(this.bomb);
    this._play(this.lobby);
  }

  playSafe(): void {
    this.desired = 'safe';
    if (!this.enabled) return;
    this._stop(this.lobby);
    this._stop(this.bomb);
    this._play(this.safe);
  }

  playBombOnceThenSilence(): void {
    this.desired = 'bomb';
    this._stop(this.lobby);
    this._stop(this.safe);
    // Bomb plays even if muted flag is off (sfx intent) — but we respect enabled.
    if (!this.enabled) return;
    this.bomb.currentTime = 0;
    void this.bomb.play().catch(() => {});
  }

  stopAll(): void {
    this.desired = 'silent';
    this._stop(this.lobby);
    this._stop(this.safe);
    this._stop(this.bomb);
  }

  // ── Enable / disable ────────────────────────────────────────────────────────

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this._stop(this.lobby);
      this._stop(this.safe);
      this._stop(this.bomb);
      return;
    }
    // Resume the appropriate track.
    switch (this.desired) {
      case 'lobby': this._play(this.lobby); break;
      case 'safe':  this._play(this.safe);  break;
      case 'bomb':
        // Only resume bomb if it hasn't finished yet.
        if (this.bomb.currentTime > 0 && !this.bomb.ended) {
          void this.bomb.play().catch(() => {});
        }
        break;
      // 'silent': nothing to resume
    }
  }

  get isEnabled(): boolean { return this.enabled; }

  // ── Internals ───────────────────────────────────────────────────────────────

  private _play(el: HTMLAudioElement): void {
    if (!this.unlocked) return;
    if (!el.paused) return; // already playing
    void el.play().catch(() => {});
  }

  private _stop(el: HTMLAudioElement): void {
    if (el.paused) return;
    el.pause();
    el.currentTime = 0;
  }
}
