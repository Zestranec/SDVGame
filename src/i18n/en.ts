/**
 * English locale — the default and reference locale.
 *
 * To add a new language:
 *   1. Create src/i18n/<code>.ts that satisfies `Locale` from i18n.ts.
 *   2. Create src/i18n/rules/<code>.ts with the translated rules text.
 *   3. Register both in src/i18n/i18n.ts — no other code changes required.
 */
export const EN = {
  // ── HUD ──────────────────────────────────────────────────────────────────
  cashoutBtn:        '💰 Take Profit (+{amount})',
  hudRoundEmpty:     '—',
  multiplier:        '×{value}',
  soundMuted:        '🔇',
  soundUnmuted:      '🔊',
  hintSwipeContinue: 'Swipe up to continue',

  // ── Intro card ───────────────────────────────────────────────────────────
  introTitle:        'ADHDoom',
  introWinHighlight: 'Win Up To ×500',
  introCta:          'SWIPE UP TO START',
  introBetLabel:     'BET  {amount}',

  // ── Video overlay ────────────────────────────────────────────────────────
  tapToPlay:     '▶  Tap to play',
  stampApproved: 'APPROVED',

  // ── Popup: win ───────────────────────────────────────────────────────────
  popupWinTitle:    'NICE!',
  popupWinSubtitle: 'Safe feed. Keep scrolling!',
  popupWinBalance:  'Balance: {balance}',
  popupWinBtn:      'COLLECT',

  // ── Popup: max win ───────────────────────────────────────────────────────
  popupMaxWinTitle:    'MAX WIN!',
  popupMaxWinSubtitle: 'You hit the ×500 cap. Collect your winnings!',
  popupMaxWinBtn:      'COLLECT MAX WIN',

  // ── Popup: lose ──────────────────────────────────────────────────────────
  popupLoseTitle:     'BUSTED',
  popupLoseSubtitle:  'An agent caught you. Be careful next time.',
  popupLoseBalance:   'Balance: {balance}',
  popupLoseBtnAfford: 'TRY AGAIN',
  popupLoseBtnBroke:  'REFILL & PLAY',

  // ── Popup: broke ─────────────────────────────────────────────────────────
  popupBrokeTitle:    'BROKE!',
  popupBrokeSubtitle: 'You ran out of credit. Refilling to starting balance.',
  popupBrokeBtn:      'REFILL & PLAY',

  // ── Popup: free plays over ───────────────────────────────────────────────
  popupFbOverTitle:             'FREE PLAYS OVER',
  popupFbOverSubtitle:          'Next swipes will be from your account funds.',
  popupFbOverBalanceSingular:   'Won +{win} in {rounds} round · Balance: {balance}',
  popupFbOverBalancePlural:     'Won +{win} in {rounds} rounds · Balance: {balance}',
  popupFbOverBtn:               'COLLECT',

  // ── Popup: insufficient funds ────────────────────────────────────────────
  popupInsufficientTitle:      'INSUFFICIENT FUNDS',
  popupInsufficientSubtitle:   'Your balance is too low for this bet.',
  popupInsufficientBalance:    'Balance: {balance}',
  popupInsufficientBet:        'Bet: {bet}',
  popupInsufficientDepositBtn: 'TOP UP',
  popupInsufficientCancelBtn:  'CANCEL',

  // ── Rules overlay ────────────────────────────────────────────────────────
  rulesTitle:   'GAME RULES',
  rulesCloseX:  '✕',
  rulesCloseBtn:'CLOSE',

  // ── Freebets counter ─────────────────────────────────────────────────────
  fbCounterLabel:    '🎁 FREE PLAYS',
  fbCounterTotalWin: 'TOTAL WIN',
  fbCounterProgress: '{done} / {issued}',

  // ── Freebets toasts ──────────────────────────────────────────────────────
  fbAwardedSingular: "🎁  You've been awarded {count} free play",
  fbAwardedPlural:   "🎁  You've been awarded {count} free plays",
  /** First line (bold) + \n + second line (muted) — rendered by _showToast. */
  fbFinishedToast:   'FREE PLAYS OVER\nWon +{win}. Switching to balance.',

  // ── Replay controls ──────────────────────────────────────────────────────
  replayBack: '◀ Back',
  replayNext: 'Next ▶',
  replayStep: 'Step {current} / {total}',

  // ── Errors ───────────────────────────────────────────────────────────────
  errorMissingToken:    'Missing token in URL (?token=…).\nRunner init cannot start.',
  errorReplayFailed:    'Replay load failed:\n{err}',
  errorRunnerInitFailed:'Runner init failed:\n{err}',
  errorDepositLink:     'Deposit link not available.',
  errorConnection:      'Connection error — {err}',
  errorInvalidResponse: 'Invalid runner response (missing resp).',
  errorCashoutFailed:   'Cashout failed — please retry',
  errorInvalidCashout:  'Invalid runner response on cashout.',

  // ── Animation flavor text ────────────────────────────────────────────────
  dogMessages: ['snack?', 'snack!', 'walk?', 'treat?', 'ball?'],
} as const;

export default EN;
