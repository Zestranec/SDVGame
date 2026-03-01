#!/usr/bin/env tsx
/**
 * CLI simulation for ADHDoom — depth-invariant RTP model.
 *
 * Usage:
 *   npm run simulate          # 1M rounds, depths 1–10
 *   npm run simulate:quick    # 100k rounds
 */
import { runSimulation } from '../src/Simulation';

const rounds = parseInt(process.argv[2] ?? '1000000', 10);
const seed   = parseInt(process.argv[3] ?? '42', 10);

console.log(`\n🎰  ADHDoom Simulation  (depth-invariant RTP model)`);
console.log(`   Rounds : ${rounds.toLocaleString()}`);
console.log(`   Seed   : ${seed}`);
console.log(`   Theory : RTP ≈ 95.00% at any cashout depth`);
console.log(`   Model  : BOMB=15%  VB_prob=0.3%  VB_mult=×10  normal_safe=×1.1499`);
console.log(`   Edge   : Applied once at round start (roundValue = bet × 0.95)\n`);

for (const depth of [1, 2, 3, 4, 5, 6, 7, 8, 10]) {
  const t0  = Date.now();
  const res = runSimulation(rounds, seed, depth);
  const ms  = Date.now() - t0;

  const rtpStr = (res.rtp * 100).toFixed(2) + '%';
  const vbRate = (res.viralBoosts / res.rounds * 100).toFixed(3);

  console.log(`── depth-${depth}: ${res.playerModel}`);
  console.log(`   RTP          : ${rtpStr}`);
  console.log(`   Avg swipes   : ${res.avgSwipes.toFixed(2)}`);
  console.log(`   Win rate     : ${(res.winRate   * 100).toFixed(2)}%`);
  console.log(`   Lose rate    : ${(res.loseRate  * 100).toFixed(2)}%`);
  console.log(`   Viral boosts : ${res.viralBoosts.toLocaleString()} (${vbRate}%/round)  (${ms} ms)\n`);
}
