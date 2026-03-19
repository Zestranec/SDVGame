/**
 * English rules text for the in-game Rules overlay.
 * Each section is separated by a blank line; the first line of each section
 * is the section header, the remaining lines are body text.
 *
 * To add a new language: create src/i18n/rules/<code>.ts and register it
 * in src/i18n/i18n.ts.
 */
export const RULES_EN = `About The Game
ADHDoom is a short-session risk game built around "doomscrolling" through a feed of looping videos. Each swipe reveals the next clip and applies a multiplier to your current pot — until you decide to cash out or an Agent (bomb) ends the round. Rare Viral Boost clips can dramatically increase the pot. The outcome of each step is decided by a certified RNG before the animation plays.

How To Play
1. Select your Bet on the intro screen (values are provided by the platform).
2. Start the round with the initial swipe (this is the Play action).
3. Each additional swipe is a Step:
   - Safe clip (multiplier applies),
   - Viral Boost clip (special multiplier applies),
   - Agent/Bomb clip (round ends with a loss).
4. You can press Cash Out at any time during the round to collect the current pot.
5. The round ends when one of these happens:
   - Bomb/Agent (loss),
   - Cash Out (win),
   - Max Win reached (forced win collection).

General
- A round begins when the player performs the initial swipe and places a bet.
- Each subsequent swipe advances the round by one Step.
- The game uses integer currency subunits (e.g., cents) provided by the platform; displayed values follow the platform currency rules (subunits/exponent).
- The game has a Maximum Win of 500× bet. When the cap is reached, the round ends immediately and the win is collected automatically.

Round Value & Multipliers
- The round starts with a seeded pot value based on the bet and the game's RTP configuration.
- Each Safe Step multiplies the pot by the Safe Multiplier.
- Viral Boost Steps multiply the pot by the Viral Boost Multiplier (rare event).
- Bomb/Agent ends the round immediately and forfeits the pot.

Viral Boost
- Viral Boost is a rare Safe-type Step with an enhanced multiplier.
- It is displayed as a special "buff" clip and uses a dedicated multiplier override for that step.

Max Win
- Maximum win is 500× bet.
- When the pot reaches or exceeds this limit, the game forces a Collect (no further steps are allowed).

Free Bets (if available)
If Free Bets / Free Plays are issued by the platform:
- The game will display a Free Plays counter and total freebet winnings.
- When all Free Plays are completed, the game shows a dedicated Free Plays Over collect screen and then returns to normal paid play.

Return to Player (RTP)
The theoretical Return to Player (RTP) is 95%. The game's probability model is designed to target the configured RTP while keeping outcomes deterministic per step.

RNG
The game uses a certified Random Number Generator (RNG) service. Each Step is resolved by RNG before visuals play. Cash Out does not consume RNG.

Additional Information
- Malfunction voids all plays and pays.
- Incomplete rounds may be terminated by the platform according to its rules.
- If the game requires Collect, selecting Collect adds the win to the player balance.
- This is the game rule version 1.0.0.`;

export default RULES_EN;
