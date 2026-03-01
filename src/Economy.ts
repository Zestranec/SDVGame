export const STARTING_BALANCE = 1000;

/** Bet selector range and step (FUN). */
export const BET_MIN  = 10;
export const BET_MAX  = 200;
export const BET_STEP = 10;

export class Economy {
  balance: number;
  /** Currently selected bet amount. Updated by the intro-screen bet selector. */
  bet: number;

  constructor() {
    this.balance = STARTING_BALANCE;
    this.bet     = BET_MIN;
  }

  get canStartRound(): boolean {
    return this.balance >= this.bet;
  }

  /** Deduct the bet at the start of a round. */
  startRound(): void {
    this.balance -= this.bet;
  }

  /** Add winnings to the balance (called on win or collect). */
  addWinnings(amount: number): void {
    this.balance += amount;
  }
}
