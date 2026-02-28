export type Volatility = 'LOW' | 'MED' | 'HIGH';
export type WinKind = 'LOSE' | 'MATCH_3' | 'MATCH_4';

export interface Outcome {
  winKind: WinKind;
  symbolId?: number;
  payoutMult: number;
  paylineRow: number;
}

export interface SlotConfig {
  rows: 3 | 4;
  cols: 3 | 4;
  symbolsCount: 10;
  targetRtp: 0.95;
  volatility: Volatility;
}
