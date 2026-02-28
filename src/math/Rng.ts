/**
 * Mulberry32 — fast, deterministic, seed-based PRNG.
 * Given the same seed, always produces the same sequence.
 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    // Ensure unsigned 32-bit integer seed
    this.state = (seed | 0) >>> 0;
  }

  /** Returns a float in [0, 1). */
  nextFloat(): number {
    let z = (this.state += 0x6d2b79f5) >>> 0;
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 0x100000000;
  }

  /** Returns an integer in [0, max). */
  nextInt(max: number): number {
    return Math.floor(this.nextFloat() * max);
  }
}
