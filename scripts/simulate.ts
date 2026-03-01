#!/usr/bin/env tsx
/**
 * CLI simulation for ADHDoom — SpinTok mode.
 *
 * Usage:
 *   npm run simulate          # 1M rounds, multiple cashout strategies
 *   npm run simulate:quick    # 100k rounds
 */
import { runSimulation } from '../src/Simulation';
import { MAX_LEVEL } from '../src/SpinTokController';

const rounds = parseInt(process.argv[2] ?? '1000000', 10);
const seed   = parseInt(process.argv[3] ?? '42', 10);

console.log(`\n🎰  ADHDoom Simulation  (SpinTok mode)`);
console.log(`   Rounds : ${rounds.toLocaleString()}`);
console.log(`   Seed   : ${seed}`);
console.log(`   Theory : RTP ≈ 95.00% at cashout-L2+ (EV-invariant for L≥2)\n`);

// Sweep over several cashout strategies
for (const cashoutAt of [1, 2, 3, 5, 10, MAX_LEVEL]) {
  const t0  = Date.now();
  const res = runSimulation(rounds, seed, cashoutAt);
  const ms  = Date.now() - t0;

  const rtpStr = (res.rtp * 100).toFixed(2) + '%';
  const flag   = cashoutAt === 2 ? ' ← optimal / target' : '';

  console.log(`── cashout-L${cashoutAt}: ${res.playerModel}`);
  console.log(`   RTP        : ${rtpStr}${flag}`);
  console.log(`   Avg level  : ${res.avgLevel.toFixed(2)}`);
  console.log(`   Win rate   : ${(res.winRate   * 100).toFixed(2)}%`);
  console.log(`   Lose rate  : ${(res.loseRate  * 100).toFixed(2)}%`);
  console.log(`   House edge : ${((1 - res.rtp) * 100).toFixed(2)}%  (${ms} ms)\n`);
}
