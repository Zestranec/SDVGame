import * as PIXI from 'pixi.js';
import type { SlotConfig } from '../types';

// ─── Symbol palette ───────────────────────────────────────────────────────────

const SYMBOL_BG_COLORS = [
  0xc0392b,  // 0 CHR - deep red
  0xe67e22,  // 1 ORG - orange
  0xf1c40f,  // 2 LMN - yellow
  0x27ae60,  // 3 GRP - green
  0x16a085,  // 4 DIA - teal
  0x2980b9,  // 5 STR - blue
  0x8e44ad,  // 6 BEL - purple
  0xc0392b,  // 7 BAR - crimson (different label)
  0x2c3e50,  // 8  7  - dark navy
  0xb7950b,  // 9 CRN - dark gold
];

const SYMBOL_LABELS = [
  'CHR', 'ORG', 'LMN', 'GRP', 'DIA',
  'STR', 'BEL', 'BAR', ' 7 ', 'CRN',
];

// ─── Layout constants ─────────────────────────────────────────────────────────

const CELL_SIZE    = 100;
const CELL_GAP     = 10;
const CANVAS_SIZE  = 500;

function gridOffset(rows: number, cols: number) {
  const w = cols * CELL_SIZE + (cols - 1) * CELL_GAP;
  const h = rows * CELL_SIZE + (rows - 1) * CELL_GAP;
  return {
    x: Math.floor((CANVAS_SIZE - w) / 2),
    y: Math.floor((CANVAS_SIZE - h) / 2),
  };
}

// ─── CellView ─────────────────────────────────────────────────────────────────

interface CellView {
  container: PIXI.Container;
  bg:        PIXI.Graphics;
  label:     PIXI.Text;
}

function makeCellView(): CellView {
  const container = new PIXI.Container();
  const bg = new PIXI.Graphics();
  const label = new PIXI.Text('---', {
    fontFamily: 'system-ui, monospace',
    fontSize: 22,
    fontWeight: '700',
    fill: '#ffffff',
    align: 'center',
  });
  label.anchor.set(0.5);
  label.position.set(CELL_SIZE / 2, CELL_SIZE / 2);
  container.addChild(bg, label);
  return { container, bg, label };
}

function paintCell(cell: CellView, symbolId: number): void {
  const col   = SYMBOL_BG_COLORS[symbolId] ?? 0x333333;
  const lbl   = SYMBOL_LABELS[symbolId]     ?? '???';
  cell.bg.clear();
  cell.bg.beginFill(col, 1);
  cell.bg.drawRoundedRect(0, 0, CELL_SIZE, CELL_SIZE, 12);
  cell.bg.endFill();
  // Inner border highlight
  cell.bg.lineStyle(2, 0xffffff, 0.12);
  cell.bg.drawRoundedRect(2, 2, CELL_SIZE - 4, CELL_SIZE - 4, 10);
  cell.label.text = lbl;
}

// ─── GridView ─────────────────────────────────────────────────────────────────

export class GridView {
  /** The PIXI application — caller must append app.view to DOM. */
  readonly app: PIXI.Application;

  private gridContainer:   PIXI.Container;
  private cellContainer:   PIXI.Container;
  private paylineGfx:      PIXI.Graphics;
  private cells:           CellView[][];  // [row][col]
  private rows = 3;
  private cols = 3;
  private currentPaylineRow = 1;

  /** Active Ticker callback reference so we can remove it on rebuild. */
  private spinCb: ((delta: number) => void) | null = null;

  constructor() {
    this.app = new PIXI.Application({
      width:           CANVAS_SIZE,
      height:          CANVAS_SIZE,
      backgroundColor: 0x0d1424,
      antialias:       true,
    });

    this.gridContainer = new PIXI.Container();
    this.cellContainer = new PIXI.Container();
    this.paylineGfx    = new PIXI.Graphics();

    this.gridContainer.addChild(this.cellContainer);
    this.gridContainer.addChild(this.paylineGfx);
    this.app.stage.addChild(this.gridContainer);

    // Placeholder empty grid; caller calls rebuild() before first spin
    this.cells = [];
    this.rebuild({ rows: 3, cols: 3, symbolsCount: 10, targetRtp: 0.95, volatility: 'MED' });
  }

  /** Attach the canvas to a container element. */
  attachTo(container: HTMLElement): void {
    container.appendChild(this.app.view as HTMLCanvasElement);
  }

  // ─── Build / Rebuild ───────────────────────────────────────────────────────

  rebuild(config: SlotConfig): void {
    // Stop any running animation
    if (this.spinCb) {
      this.app.ticker.remove(this.spinCb);
      this.spinCb = null;
    }

    this.rows = config.rows;
    this.cols = config.cols;
    this.currentPaylineRow = Math.floor(config.rows / 2);

    // Remove old cells
    this.cellContainer.removeChildren();
    this.cells = [];

    const { x: ox, y: oy } = gridOffset(this.rows, this.cols);

    for (let r = 0; r < this.rows; r++) {
      const row: CellView[] = [];
      for (let c = 0; c < this.cols; c++) {
        const cell = makeCellView();
        cell.container.position.set(
          ox + c * (CELL_SIZE + CELL_GAP),
          oy + r * (CELL_SIZE + CELL_GAP),
        );
        paintCell(cell, (r + c * 3) % 10);
        this.cellContainer.addChild(cell.container);
        row.push(cell);
      }
      this.cells.push(row);
    }

    // Draw idle payline indicator
    this.drawPaylineIdle();
  }

  // ─── Payline drawing ───────────────────────────────────────────────────────

  private drawPaylineIdle(): void {
    const { x: ox, y: oy } = gridOffset(this.rows, this.cols);
    const row = this.currentPaylineRow;
    const cy  = oy + row * (CELL_SIZE + CELL_GAP) + CELL_SIZE / 2;
    const w   = this.cols * CELL_SIZE + (this.cols - 1) * CELL_GAP;

    this.paylineGfx.clear();
    this.paylineGfx.lineStyle(2, 0xffffff, 0.30);
    this.paylineGfx.moveTo(ox, cy);
    this.paylineGfx.lineTo(ox + w, cy);
  }

  highlightPayline(win: boolean): void {
    const { x: ox, y: oy } = gridOffset(this.rows, this.cols);
    const row   = this.currentPaylineRow;
    const py    = oy + row * (CELL_SIZE + CELL_GAP);
    const w     = this.cols * CELL_SIZE + (this.cols - 1) * CELL_GAP;
    const color = win ? 0xffd700 : 0xff4444;

    this.paylineGfx.clear();
    // Semi-transparent fill
    this.paylineGfx.beginFill(color, win ? 0.18 : 0.10);
    this.paylineGfx.drawRoundedRect(ox, py, w, CELL_SIZE, 12);
    this.paylineGfx.endFill();
    // Line through center
    this.paylineGfx.lineStyle(3, color, win ? 1.0 : 0.7);
    this.paylineGfx.moveTo(ox, py + CELL_SIZE / 2);
    this.paylineGfx.lineTo(ox + w, py + CELL_SIZE / 2);
  }

  clearHighlight(): void {
    this.drawPaylineIdle();
  }

  // ─── Symbol helpers ────────────────────────────────────────────────────────

  private setSymbol(row: number, col: number, symbolId: number): void {
    paintCell(this.cells[row][col], symbolId);
  }

  /** Instantly show a fully-known grid (no animation). */
  showGrid(grid: number[][]): void {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        this.setSymbol(r, c, grid[r][c]);
      }
    }
  }

  // ─── Spin animation ────────────────────────────────────────────────────────

  /**
   * Animates reels spinning then stopping column-by-column (left → right),
   * landing on `finalGrid`.  Returns a Promise that resolves when all columns
   * have stopped.
   *
   * The outcome is pre-determined; this only drives the visual.
   */
  async spinTo(finalGrid: number[][]): Promise<void> {
    // Safety: stop any previous animation
    if (this.spinCb) {
      this.app.ticker.remove(this.spinCb);
      this.spinCb = null;
    }

    const rows = this.rows;
    const cols = this.cols;

    /** How long (ms) before column `col` stops. */
    const colStopMs = (col: number) => 500 + col * 380;

    const startTime   = performance.now();
    const stoppedCols = new Set<number>();

    return new Promise<void>((resolve) => {
      const tick = () => {
        const elapsed = performance.now() - startTime;

        for (let c = 0; c < cols; c++) {
          if (stoppedCols.has(c)) continue;

          if (elapsed >= colStopMs(c)) {
            stoppedCols.add(c);
            // Land on predetermined symbols
            for (let r = 0; r < rows; r++) {
              this.setSymbol(r, c, finalGrid[r][c]);
            }
          } else {
            // Rapid cycling — different offset per cell for visual variety
            const frame = Math.floor(elapsed / 75);
            for (let r = 0; r < rows; r++) {
              this.setSymbol(r, c, (frame + c * 3 + r * 7) % 10);
            }
          }
        }

        if (stoppedCols.size === cols) {
          this.app.ticker.remove(tick);
          this.spinCb = null;
          resolve();
        }
      };

      this.spinCb = tick;
      this.app.ticker.add(tick);
    });
  }
}
