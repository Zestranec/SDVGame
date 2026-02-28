/// <reference types="vite/client" />

/**
 * Mulberry32 — fast, deterministic, seedable PRNG.
 * Same seed → same sequence every time.
 */
export class Rng {
  private s: number;
  readonly seed: number;

  constructor(seed: number) {
    this.s = (seed >>> 0) || 1;
    this.seed = this.s;
  }

  /** Returns float in [0, 1). */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(this.s ^ (this.s >>> 15), 1 | this.s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) >>> 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Random integer in [0, max). */
  nextInt(max: number): number {
    return Math.floor(this.next() * max);
  }

  /** Random boolean with given probability of being true. */
  nextBool(prob: number): boolean {
    return this.next() < prob;
  }

  /** Random element from array. */
  pick<T>(arr: readonly T[]): T {
    return arr[this.nextInt(arr.length)];
  }
}

/** Generate a random seed based on current time + Math.random(). */
export function makeSeed(): number {
  return ((Date.now() * 31337) ^ (Math.random() * 0xffffffff)) >>> 0;
}
