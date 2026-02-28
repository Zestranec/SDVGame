#!/usr/bin/env tsx
/**
 * CLI simulation for SDVGame.
 *
 * Usage:
 *   npm run simulate          # 1M rounds, all depth profiles
 *   npm run simulate:quick    # 100k rounds
 */
import { runSimulation } from '../src/Simulation';

const rounds = parseInt(process.argv[2] ?? '1000000', 10);
const seed   = parseInt(process.argv[3] ?? '42', 10);

console.log(`\n🎰  SDVGame Simulation  (unknown_call danger model)`);
console.log(`   Rounds : ${rounds.toLocaleString()}`);
console.log(`   Seed   : ${seed}`);
console.log(`   Theory : P(bomb)=15%  P(viral_boost)≈1.67%  E[mult|safe]=1.1176`);
console.log(`   Target : RTP ≈ 95.00% at depth-1\n`);

// Run for multiple cashout depths to show the RTP spectrum
for (const depth of [1, 2, 3, 5, 8]) {
  const t0  = Date.now();
  const res = runSimulation(rounds, seed, depth);
  const ms  = Date.now() - t0;

  const rtpStr = (res.rtp * 100).toFixed(2) + '%';
  const flag   = depth === 1 ? ' ← optimal / target' : '';
  const vbRate = (res.viralBoosts / res.rounds * 100).toFixed(2);

  console.log(`── depth-${depth}: ${res.playerModel}`);
  console.log(`   RTP          : ${rtpStr}${flag}`);
  console.log(`   Avg swipes   : ${res.avgSwipes.toFixed(2)}`);
  console.log(`   Win rate     : ${(res.winRate  * 100).toFixed(2)}%`);
  console.log(`   Lose rate    : ${(res.loseRate * 100).toFixed(2)}%`);
  console.log(`   Viral boosts : ${res.viralBoosts.toLocaleString()} (${vbRate}%/round)`);
  console.log(`   House edge   : ${((1 - res.rtp) * 100).toFixed(2)}%  (${ms} ms)\n`);
}
