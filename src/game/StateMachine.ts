export type GameState = 'IDLE' | 'RUNNING' | 'WIN' | 'LOSE';

type Listener = () => void;

/**
 * Minimal state machine for the slot game loop:
 * IDLE → RUNNING → WIN → IDLE
 *                → LOSE → IDLE
 *
 * Callers check `isLocked()` to prevent double-triggers during RUNNING.
 */
export class StateMachine {
  private state: GameState = 'IDLE';
  private listeners = new Map<GameState, Listener>();

  get current(): GameState { return this.state; }

  is(s: GameState): boolean { return this.state === s; }

  /** Returns true while input should be locked (spin in progress). */
  isLocked(): boolean { return this.state === 'RUNNING'; }

  /** Register a callback for when we enter a given state. */
  on(state: GameState, cb: Listener): void {
    this.listeners.set(state, cb);
  }

  /** Perform a state transition and fire the registered callback. */
  transition(next: GameState): void {
    this.state = next;
    this.listeners.get(next)?.();
  }
}
