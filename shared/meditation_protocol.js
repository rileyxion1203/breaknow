// shared/meditation_protocol.js
// ═══════════════════════════════════════════════════════════
// Single source of truth for the meditation extension contract.
// Constants + multi-field rules only. No display utils (fmt, ring math).
//
// Wrapped in IIFE to avoid polluting the global scope with local vars.
// Only globalThis.__breaknow_protocol is exported.
// ═══════════════════════════════════════════════════════════
(() => {
  const _P = {};

  // ── Modes ──
  _P.MODE = {
    IDLE:       'idle',
    COUNTDOWN:  'countdown',
    GRACE:      'grace',
    MEDITATING: 'meditating',
    DONE:       'done',
  };

  // ── Commands: renderer → background ──
  _P.CMD = {
    REQUEST_GRACE:        'requestGrace',
    START_MEDITATION_NOW: 'startMeditationNow',
    MEDITATION_COMPLETED: 'meditationCompleted',
    DONE_ACKNOWLEDGED:    'doneAcknowledged',
    LEAVE_EARLY:          'leaveEarly',
    TOGGLE_MUTE:          'toggleMute',
    START_TIMER:          'startTimer',
    STOP_TIMER:           'stopTimer',
    GET_STATE:            'getState',
  };

  // ── Commands: background → renderer ──
  _P.RENDER = {
    MEDITATION:         'render_meditation',
    GRACE:              'render_grace',
    BANNER:             'render_banner',
    UNMOUNT_MEDITATION: 'unmount_meditation',
    UNMOUNT_GRACE:      'unmount_grace',
    UNMOUNT_BANNER:     'unmount_banner',
    UNMOUNT_STANDALONE: 'unmount_standalone',
    UPDATE_MUTE:        'update_mute',
  };

  // ── Timing ──
  _P.MEDITATION_SECONDS = 8 * 60;
  _P.GRACE_SECONDS      = 3 * 60;
  _P.MAX_GRACE          = 2;

  // ── Copy / text ──
  _P.COPY = {
    TITLE_MEDITATING: 'Time to pause',
    TITLE_DONE:       'Thank you for spending time with yourself.',
    TIMER_DONE:       'Have an abundant day! ✨',
    BTN_DONE:         'Done',
    BTN_BACK:         'Back to Work',
    BTN_GRACE:        'Need 3 mins to wrap up?',
    BTN_START_NOW:    'Start Meditation Now',
    CONFIRM_STAY:     'Stay',
    CONFIRM_LEAVE:    'Leave',
    CONFIRM_MSG:      'Almost there! A few minutes of calm goes a long way.',
  };

  _P.graceMessage = function (count) {
    return count >= _P.MAX_GRACE
      ? "This is your final 3-minute breather. Let's find our calm soon. 😊"
      : "Okay, we'll start in 3 minutes. Feel free to wrap things up.";
  };

  // ── Multi-field rules ──
  _P.shouldShowGraceButton = function (state) {
    return state.mode === _P.MODE.MEDITATING && state.graceCount < _P.MAX_GRACE;
  };

  _P.getCloseButtonLabel = function (mode) {
    return mode === _P.MODE.DONE ? _P.COPY.BTN_DONE : _P.COPY.BTN_BACK;
  };

  _P.getTitle = function (mode) {
    return mode === _P.MODE.DONE ? _P.COPY.TITLE_DONE : _P.COPY.TITLE_MEDITATING;
  };

  // ── Expose ──
  globalThis.__breaknow_protocol = _P;
})();
