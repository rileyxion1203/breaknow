// meditation/meditation.js (v2.0 - renderer aligned with background state machine)
// Standalone meditation page. Reads state from background, sends commands back.
// No local grace/meditation logic — background owns all transitions.
// Requires shared/meditation_protocol.js loaded via <script> in meditation.html.

const P = window.__breaknow_protocol;

const RING_RADIUS = 150;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

let localInterval = null;
let isMuted = false;

const audio = new Audio(chrome.runtime.getURL('sounds/meditation_music.mp3'));
audio.loop = false;

const body = document.body;
const focusImage = document.getElementById('focus-image');
const timerDisplay = document.getElementById('timer-display');
const mainTitle = document.getElementById('main-title');
const graceButton = document.getElementById('btn-grace');
const closeButton = document.getElementById('btn-close');
const muteButton = document.getElementById('btn-mute');
const confirmModal = document.getElementById('confirm-modal');
const graceMessage = document.getElementById('grace-message');
const graceTimer = document.getElementById('grace-timer');
const ringProgress = document.getElementById('ring-progress');
const mainContent = document.getElementById('main-content');
const gracePanel = document.getElementById('grace-panel');

ringProgress.style.strokeDasharray = RING_CIRCUMFERENCE;
ringProgress.style.strokeDashoffset = 0;

function fmt(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function tryPlay() {
  if (isMuted) return;
  audio.play().catch(() => {});
}

function stopPlay() {
  audio.pause();
  audio.currentTime = 0;
}

function destroyAudio() {
  audio.pause();
  audio.removeAttribute('src');
  audio.load();
}

function clearTick() {
  if (localInterval) { clearInterval(localInterval); localInterval = null; }
}

// ── Render: Meditating state ──
function renderMeditating(st) {
  clearTick();
  body.classList.remove('grace-mode');
  confirmModal.style.display = 'none';
  mainContent.style.display = '';

  mainTitle.textContent = P.getTitle(P.MODE.MEDITATING);
  focusImage.src = chrome.runtime.getURL('images/mindful_image.png');
  timerDisplay.textContent = fmt(st.meditationEndsAt - Date.now());

  graceButton.style.display = P.shouldShowGraceButton(st) ? '' : 'none';
  graceButton.textContent = P.COPY.BTN_GRACE;
  closeButton.textContent = P.getCloseButtonLabel(P.MODE.MEDITATING);
  muteButton.style.display = '';

  ringProgress.style.strokeDashoffset = 0;
  ringProgress.style.opacity = '1';

  tryPlay();
  startMeditationTick(st.meditationEndsAt);
}

// ── Render: Done state ──
function renderDone() {
  clearTick();
  stopPlay();
  body.classList.remove('grace-mode');
  confirmModal.style.display = 'none';
  mainContent.style.display = '';

  mainTitle.textContent = P.getTitle(P.MODE.DONE);
  timerDisplay.textContent = P.COPY.TIMER_DONE;
  focusImage.src = chrome.runtime.getURL('images/lotus_flower.png');

  graceButton.style.display = 'none';
  closeButton.textContent = P.getCloseButtonLabel(P.MODE.DONE);
  muteButton.style.display = 'none';

  ringProgress.style.opacity = '0.2';
}

// ── Render: Grace state ──
function renderGrace(st) {
  clearTick();
  stopPlay();
  body.classList.add('grace-mode');
  confirmModal.style.display = 'none';

  graceMessage.textContent = P.graceMessage(st.graceCount);
  graceTimer.textContent = fmt(st.graceEndsAt - Date.now());

  startGraceTick(st.graceEndsAt);
}

// ── Display ticks (local interval for countdown display only) ──
function startMeditationTick(endsAt) {
  clearTick();
  localInterval = setInterval(() => {
    const remaining = endsAt - Date.now();
    if (remaining > 0) {
      timerDisplay.textContent = fmt(remaining);
      const progress = Math.max(0, remaining) / (P.MEDITATION_SECONDS * 1000);
      ringProgress.style.strokeDashoffset = RING_CIRCUMFERENCE * (1 - progress);
    } else {
      clearTick();
      chrome.runtime.sendMessage({ command: P.CMD.MEDITATION_COMPLETED });
    }
  }, 1000);
}

function startGraceTick(endsAt) {
  clearTick();
  localInterval = setInterval(() => {
    const remaining = endsAt - Date.now();
    if (remaining > 0) {
      graceTimer.textContent = fmt(remaining);
    } else {
      clearTick();
      chrome.runtime.sendMessage({ command: P.CMD.START_MEDITATION_NOW });
    }
  }, 1000);
}

// ── User actions → background commands ──
body.addEventListener('click', tryPlay);

muteButton.addEventListener('click', (e) => {
  e.stopPropagation();
  chrome.runtime.sendMessage({ command: P.CMD.TOGGLE_MUTE });
});

graceButton.addEventListener('click', (e) => {
  e.stopPropagation();
  chrome.runtime.sendMessage({ command: P.CMD.REQUEST_GRACE });
});

closeButton.addEventListener('click', (e) => {
  e.stopPropagation();
  if (closeButton.textContent === P.COPY.BTN_DONE) {
    destroyAudio();
    clearTick();
    chrome.runtime.sendMessage({ command: P.CMD.DONE_ACKNOWLEDGED }, () => {
      window.close();
    });
  } else {
    confirmModal.style.display = 'block';
  }
});

document.getElementById('btn-stay').addEventListener('click', (e) => {
  e.stopPropagation();
  confirmModal.style.display = 'none';
});

document.getElementById('btn-leave').addEventListener('click', (e) => {
  e.stopPropagation();
  destroyAudio();
  clearTick();
  chrome.runtime.sendMessage({ command: P.CMD.LEAVE_EARLY }, () => {
    window.close();
  });
});

document.getElementById('grace-start-now').addEventListener('click', (e) => {
  e.stopPropagation();
  chrome.runtime.sendMessage({ command: P.CMD.START_MEDITATION_NOW });
});

// ── Message listener: background pushes state changes ──
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.command) {
    case P.RENDER.MEDITATION: {
      const st = request.state;
      if (st.mode === P.MODE.MEDITATING) {
        renderMeditating(st);
      } else if (st.mode === P.MODE.DONE) {
        renderDone();
      }
      sendResponse({ ok: true });
      break;
    }
    case P.RENDER.GRACE: {
      renderGrace(request.state);
      sendResponse({ ok: true });
      break;
    }
    case P.RENDER.UNMOUNT_STANDALONE:
    case P.RENDER.UNMOUNT_MEDITATION: {
      destroyAudio();
      clearTick();
      sendResponse({ ok: true });
      window.close();
      break;
    }
    case P.RENDER.UPDATE_MUTE: {
      isMuted = request.muted;
      muteButton.innerHTML = isMuted ? '&#x1F507;' : '&#x1F50A;';
      if (isMuted) stopPlay(); else tryPlay();
      sendResponse({ ok: true });
      break;
    }
  }
  return true;
});

// ── Boot: fetch current state from background and render ──
chrome.runtime.sendMessage({ command: P.CMD.GET_STATE }, (response) => {
  if (chrome.runtime.lastError || !response?.success) return;
  const st = response.state;
  isMuted = st.muted || false;
  if (isMuted) muteButton.innerHTML = '&#x1F507;';

  if (st.mode === P.MODE.MEDITATING) {
    renderMeditating(st);
  } else if (st.mode === P.MODE.DONE) {
    renderDone();
  } else if (st.mode === P.MODE.GRACE) {
    renderGrace(st);
  }
});
