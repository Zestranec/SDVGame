/**
 * Russian locale (ru / ru-RU).
 * Mirrors every key from EN exactly — no missing keys allowed.
 */
const RU = {
  // ── HUD ──────────────────────────────────────────────────────────────────
  cashoutBtn:        '💰 Забрать (+{amount})',
  hudRoundEmpty:     '—',
  multiplier:        '×{value}',
  soundMuted:        '🔇',
  soundUnmuted:      '🔊',
  hintSwipeContinue: 'Свайпни вверх, чтобы продолжить',

  // ── Intro card ───────────────────────────────────────────────────────────
  introTitle:        'ADHDoom',
  introWinHighlight: 'Выиграй до ×500',
  introCta:          'СВАЙПНИ ВВЕРХ, ЧТОБЫ НАЧАТЬ',
  introBetLabel:     'СТАВКА  {amount}',

  // ── Video overlay ────────────────────────────────────────────────────────
  tapToPlay:     '▶  Нажми, чтобы воспроизвести',
  stampApproved: 'ОДОБРЕНО',

  // ── Popup: win ───────────────────────────────────────────────────────────
  popupWinTitle:    'КРАСИВО!',
  popupWinSubtitle: 'Безопасный клип. Продолжай скроллить!',
  popupWinBalance:  'Баланс: {balance}',
  popupWinBtn:      'ЗАБРАТЬ',

  // ── Popup: max win ───────────────────────────────────────────────────────
  popupMaxWinTitle:    'МАКСИМУМ!',
  popupMaxWinSubtitle: 'Достигнут лимит ×500. Забери выигрыш!',
  popupMaxWinBtn:      'ЗАБРАТЬ ВЫИГРЫШ',

  // ── Popup: lose ──────────────────────────────────────────────────────────
  popupLoseTitle:     'ПОПАЛСЯ',
  popupLoseSubtitle:  'Агент тебя поймал. В следующий раз будь осторожнее.',
  popupLoseBalance:   'Баланс: {balance}',
  popupLoseBtnAfford: 'ПОПРОБОВАТЬ СНОВА',
  popupLoseBtnBroke:  'ПОПОЛНИТЬ И ИГРАТЬ',

  // ── Popup: broke ─────────────────────────────────────────────────────────
  popupBrokeTitle:    'БАНКРОТ!',
  popupBrokeSubtitle: 'Средства закончились. Пополни баланс.',
  popupBrokeBtn:      'ПОПОЛНИТЬ И ИГРАТЬ',

  // ── Popup: free plays over ───────────────────────────────────────────────
  popupFbOverTitle:             'ФРИСПИНЫ ЗАКОНЧИЛИСЬ',
  popupFbOverSubtitle:          'Следующие свайпы — за твой счёт.',
  popupFbOverBalanceSingular:   'Выиграно +{win} за {rounds} раунд · Баланс: {balance}',
  popupFbOverBalancePlural:     'Выиграно +{win} за {rounds} раунда · Баланс: {balance}',
  popupFbOverBtn:               'ЗАБРАТЬ',

  // ── Popup: insufficient funds ────────────────────────────────────────────
  popupInsufficientTitle:      'НЕДОСТАТОЧНО СРЕДСТВ',
  popupInsufficientSubtitle:   'Баланса не хватает для ставки.',
  popupInsufficientBalance:    'Баланс: {balance}',
  popupInsufficientBet:        'Ставка: {bet}',
  popupInsufficientDepositBtn: 'ПОПОЛНИТЬ',
  popupInsufficientCancelBtn:  'ОТМЕНА',

  // ── Rules overlay ────────────────────────────────────────────────────────
  rulesTitle:    'ПРАВИЛА ИГРЫ',
  rulesCloseX:   '✕',
  rulesCloseBtn: 'ЗАКРЫТЬ',

  // ── Freebets counter ─────────────────────────────────────────────────────
  fbCounterLabel:    '🎁 ФРИСПИНЫ',
  fbCounterTotalWin: 'ИТОГО',
  fbCounterProgress: '{done} / {issued}',

  // ── Freebets toasts ──────────────────────────────────────────────────────
  fbAwardedSingular: '🎁  Тебе начислен {count} фриспин',
  fbAwardedPlural:   '🎁  Тебе начислено {count} фриспина',
  fbFinishedToast:   'ФРИСПИНЫ ЗАКОНЧИЛИСЬ\nВыиграно +{win}. Переход к балансу.',

  // ── Replay controls ──────────────────────────────────────────────────────
  replayBack: '◀ Назад',
  replayNext: 'Далее ▶',
  replayStep: 'Шаг {current} / {total}',

  // ── Errors ───────────────────────────────────────────────────────────────
  errorMissingToken:    'Токен не найден в URL (?token=…).\nИнициализация невозможна.',
  errorReplayFailed:    'Ошибка загрузки реплея:\n{err}',
  errorRunnerInitFailed:'Ошибка инициализации:\n{err}',
  errorDepositLink:     'Ссылка на пополнение недоступна.',
  errorConnection:      'Ошибка соединения — {err}',
  errorInvalidResponse: 'Неверный ответ сервера (отсутствует resp).',
  errorCashoutFailed:   'Вывод не удался — попробуй ещё раз',
  errorInvalidCashout:  'Неверный ответ сервера при выводе.',

  // ── Quick Rules screen ───────────────────────────────────────────────────
  quickRulesTitle: 'БЫСТРЫЕ ПРАВИЛА',
  quickRulesBtn:   'НАЖМИ, ЧТОБЫ ПРОДОЛЖИТЬ',

  // ── Animation flavor text ────────────────────────────────────────────────
  dogMessages: ['перекус?', 'перекус!', 'гулять?', 'вкусняшка?', 'мячик?'],
  quickRulesBullets: [
    'Свайпни вверх, чтобы открыть следующий клип.',
    'Безопасные клипы увеличивают твой банк.',
    'Вирусный Буст редкий — огромный множитель.',
    'Агент мгновенно заканчивает раунд.',
    'Забери выигрыш в любой момент — до ×500.',
  ],
} as const;

export default RU;
