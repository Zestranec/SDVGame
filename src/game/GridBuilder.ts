import type { SlotConfig, Outcome, WinKind } from '../types';
import type { Rng } from '../math/Rng';

// ─── Payline evaluation ───────────────────────────────────────────────────────

/**
 * Evaluates the payline row for left-consecutive symbol matches.
 *
 * Rules:
 * - cols=4: MATCH_4 if grid[row][0..3] are all equal.
 * - cols>=3: MATCH_3 if grid[row][0..2] are all equal (and not MATCH_4).
 * - Otherwise LOSE.
 */
export function evaluatePayline(
  grid: number[][],
  row: number,
  cols: number,
): WinKind {
  const r = grid[row];
  if (cols === 4 && r[0] === r[1] && r[1] === r[2] && r[2] === r[3]) {
    return 'MATCH_4';
  }
  if (r[0] === r[1] && r[1] === r[2]) {
    return 'MATCH_3';
  }
  return 'LOSE';
}

// ─── GridBuilder ─────────────────────────────────────────────────────────────

/**
 * Builds the final symbol grid so it matches the pre-determined Outcome.
 *
 * Steps:
 * 1. Fill entire grid with random symbols.
 * 2. Apply the outcome onto the payline row:
 *    - LOSE  → deterministic anti-win fix (no 3-/4-match on payline).
 *    - MATCH_3 → set cols 0-2 to symbolId; if cols=4 force col 3 ≠ symbolId.
 *    - MATCH_4 → set cols 0-3 to symbolId (only valid when cols=4).
 * 3. Assert evaluatePayline equals intended winKind.
 */
export class GridBuilder {
  static buildFinalGrid(
    config: SlotConfig,
    rng: Rng,
    outcome: Outcome,
  ): number[][] {
    const { rows, cols } = config;
    const { winKind, symbolId, paylineRow } = outcome;

    // Step 1: Random fill
    const grid: number[][] = [];
    for (let r = 0; r < rows; r++) {
      const row: number[] = [];
      for (let c = 0; c < cols; c++) {
        row.push(rng.nextInt(config.symbolsCount));
      }
      grid.push(row);
    }

    // Step 2: Enforce outcome on payline row
    if (winKind === 'LOSE') {
      GridBuilder.fixPaylineForLose(grid, paylineRow, cols);
    } else if (winKind === 'MATCH_3') {
      grid[paylineRow][0] = symbolId!;
      grid[paylineRow][1] = symbolId!;
      grid[paylineRow][2] = symbolId!;
      if (cols === 4 && grid[paylineRow][3] === symbolId) {
        // Force col 3 to be different (cyclic)
        grid[paylineRow][3] = (symbolId! + 1) % config.symbolsCount;
      }
    } else {
      // MATCH_4 (cols must be 4)
      grid[paylineRow][0] = symbolId!;
      grid[paylineRow][1] = symbolId!;
      grid[paylineRow][2] = symbolId!;
      grid[paylineRow][3] = symbolId!;
    }

    // Step 3: Correctness assertion
    const actual = evaluatePayline(grid, paylineRow, cols);
    if (actual !== winKind) {
      throw new Error(
        `GridBuilder assertion failed: expected ${winKind}, got ${actual}`,
      );
    }

    return grid;
  }

  /**
   * Modifies the payline in-place so it contains no left-consecutive 3- or
   * 4-match.  The fix is deterministic and terminates in ≤ ~10 iterations
   * (one full symbol cycle) in the absolute worst case.
   *
   * Algorithm:
   * - If MATCH_4 → increment col[cols-1] cyclically (breaks the 4th match).
   *   The row may still be MATCH_3 after this; the next iteration handles it.
   * - If MATCH_3 → increment col[2] cyclically (breaks the 3rd match in the
   *   consecutive run from the left).
   */
  private static fixPaylineForLose(
    grid: number[][],
    row: number,
    cols: number,
  ): void {
    let iter = 0;
    while (evaluatePayline(grid, row, cols) !== 'LOSE' && iter < 50) {
      const kind = evaluatePayline(grid, row, cols);
      if (kind === 'MATCH_4') {
        // Change col[cols-1] (= col[3]) to break the 4th match
        grid[row][cols - 1] = (grid[row][cols - 1] + 1) % 10;
      } else {
        // MATCH_3: cols[0]==cols[1]==cols[2]; change col[2] to break it
        grid[row][2] = (grid[row][2] + 1) % 10;
      }
      iter++;
    }
  }
}
