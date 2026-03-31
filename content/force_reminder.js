// content/force_reminder.js (v2.0 - pure renderer: mount / render / unmount)
// No business logic. Background owns all state transitions.
// Requires shared/meditation_protocol.js to be injected first.
(() => {
  const P = window.__breaknow_protocol;

  const OVERLAY_ID = 'meditation-full-overlay';
  const GRACE_ID = 'meditation-grace-reminder';
  const MODAL_ID = 'meditation-confirm-leave-modal';
  const IMAGE_ID = 'meditation-focus-image';
  const MINDFUL_IMG = 'images/mindful_image.png';
  const LOTUS_IMG = 'images/lotus_flower.png';
  const RING_R = 150;
  const RING_C = 2 * Math.PI * RING_R;

  // ── Cleanup prior injection ──
  if (window.__breaknow_meditation_cleanup) {
    try { window.__breaknow_meditation_cleanup(); } catch (e) {}
  }
  [OVERLAY_ID, GRACE_ID, MODAL_ID].forEach(id => {
    const el = document.getElementById(id);
    if (el?.parentNode) el.remove();
  });

  let audio = null;
  let localInterval = null;
  let muted = false;
  let listener = null;

  function initAudio() {
    if (audio) return;
    audio = new Audio();
    try { audio.src = chrome.runtime.getURL('sounds/meditation_music.mp3'); } catch {}
    audio.loop = false;
  }

  function destroyAudio() {
    if (!audio) return;
    audio.pause(); audio.currentTime = 0;
    audio.removeAttribute('src'); audio.load();
    audio = null;
  }

  function tryPlay() {
    if (muted || !audio) return;
    audio.play().catch(() => {});
  }

  function stopPlay() {
    if (audio) { audio.pause(); audio.currentTime = 0; }
  }

  function fmt(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  // ── DOM builders ──
  function buildOverlay(st) {
    const overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;

    // Mute button
    const muteBtn = document.createElement('button');
    muteBtn.id = 'meditation-mute-button';
    muteBtn.textContent = muted ? '\u{1F507}' : '\u{1F50A}';
    muteBtn.onclick = e => {
      e.stopPropagation();
      chrome.runtime.sendMessage({ command: P.CMD.TOGGLE_MUTE });
    };
    overlay.appendChild(muteBtn);

    // Main wrap
    const wrap = document.createElement('div');
    wrap.className = 'meditation-main-wrap';

    // Title
    const title = document.createElement('h2');
    title.id = 'meditation-main-title';
    title.textContent = P.getTitle(st.mode);
    wrap.appendChild(title);

    // Ring
    const ringBox = document.createElement('div');
    ringBox.className = 'meditation-ring-container';

    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 320 320');
    const bg = document.createElementNS(svgNS, 'circle');
    bg.setAttribute('class', 'meditation-ring-bg');
    bg.setAttribute('cx', '160'); bg.setAttribute('cy', '160'); bg.setAttribute('r', String(RING_R));
    svg.appendChild(bg);
    const prog = document.createElementNS(svgNS, 'circle');
    prog.id = 'meditation-ring-progress';
    prog.setAttribute('class', 'meditation-ring-progress');
    prog.setAttribute('cx', '160'); prog.setAttribute('cy', '160'); prog.setAttribute('r', String(RING_R));
    prog.style.strokeDasharray = RING_C;
    prog.style.strokeDashoffset = 0;
    if (st.mode === P.MODE.DONE) prog.style.opacity = '0.2';
    svg.appendChild(prog);
    ringBox.appendChild(svg);

    const inner = document.createElement('div');
    inner.className = 'meditation-ring-inner';
    const img = document.createElement('img');
    img.id = IMAGE_ID;
    try {
      img.src = chrome.runtime.getURL(st.mode === P.MODE.DONE ? LOTUS_IMG : MINDFUL_IMG);
    } catch {}
    img.alt = 'Mindful Moment';
    inner.appendChild(img);

    const timer = document.createElement('div');
    timer.id = 'meditation-timer-display';
    if (st.mode === P.MODE.DONE) {
      timer.textContent = P.COPY.TIMER_DONE;
    } else {
      timer.textContent = fmt(st.meditationEndsAt - Date.now());
    }
    inner.appendChild(timer);
    ringBox.appendChild(inner);
    wrap.appendChild(ringBox);

    // Actions
    const actions = document.createElement('div');
    actions.className = 'meditation-actions';

    const closeBtn = document.createElement('button');
    closeBtn.id = 'meditation-close-button';
    closeBtn.textContent = P.getCloseButtonLabel(st.mode);
    closeBtn.onclick = () => {
      if (st.mode === P.MODE.DONE) {
        chrome.runtime.sendMessage({ command: P.CMD.DONE_ACKNOWLEDGED });
      } else {
        showConfirmModal();
      }
    };
    actions.appendChild(closeBtn);

    if (P.shouldShowGraceButton(st)) {
      const graceBtn = document.createElement('button');
      graceBtn.id = 'meditation-grace-button';
      graceBtn.textContent = P.COPY.BTN_GRACE;
      graceBtn.onclick = () => {
        chrome.runtime.sendMessage({ command: P.CMD.REQUEST_GRACE });
      };
      actions.appendChild(graceBtn);
    }

    wrap.appendChild(actions);
    overlay.appendChild(wrap);
    overlay.addEventListener('click', () => tryPlay());
    return overlay;
  }

  function showConfirmModal() {
    if (document.getElementById(MODAL_ID)) return;
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;

    const modal = document.createElement('div');
    modal.id = MODAL_ID;
    const p = document.createElement('p');
    p.textContent = P.COPY.CONFIRM_MSG;
    modal.appendChild(p);

    const btns = document.createElement('div');
    btns.className = 'confirm-leave-buttons';

    const stay = document.createElement('button');
    stay.textContent = P.COPY.CONFIRM_STAY;
    stay.onclick = () => modal.remove();
    btns.appendChild(stay);

    const leave = document.createElement('button');
    leave.textContent = P.COPY.CONFIRM_LEAVE;
    leave.onclick = () => {
      chrome.runtime.sendMessage({ command: P.CMD.LEAVE_EARLY });
    };
    btns.appendChild(leave);

    modal.appendChild(btns);
    overlay.appendChild(modal);
  }

  function buildGraceReminder(st) {
    const box = document.createElement('div');
    box.id = GRACE_ID;

    const msg = document.createElement('p');
    msg.id = 'grace-message';
    msg.textContent = P.graceMessage(st.graceCount);
    box.appendChild(msg);

    const timer = document.createElement('div');
    timer.id = 'grace-timer-display';
    timer.textContent = fmt(st.graceEndsAt - Date.now());
    box.appendChild(timer);

    const btn = document.createElement('button');
    btn.id = 'meditation-start-now-button';
    btn.textContent = P.COPY.BTN_START_NOW;
    btn.onclick = () => {
      chrome.runtime.sendMessage({ command: P.CMD.START_MEDITATION_NOW });
    };
    box.appendChild(btn);
    return box;
  }

  // ── Render loop (display only) ──
  function startTick(mode, endTimeKey, displayId, ringId) {
    if (localInterval) clearInterval(localInterval);
    localInterval = setInterval(() => {
      const remaining = endTimeKey - Date.now();
      const display = document.getElementById(displayId);
      if (display && remaining > 0) {
        display.textContent = fmt(remaining);
      }
      if (ringId && mode === P.MODE.MEDITATING) {
        const ringEl = document.getElementById(ringId);
        if (ringEl) {
          const totalMs = P.MEDITATION_SECONDS * 1000;
          const progress = Math.max(0, remaining) / totalMs;
          ringEl.style.strokeDashoffset = RING_C * (1 - progress);
        }
      }
      if (remaining <= 0) {
        clearInterval(localInterval);
        localInterval = null;
        if (mode === P.MODE.MEDITATING) {
          chrome.runtime.sendMessage({ command: P.CMD.MEDITATION_COMPLETED });
        } else if (mode === P.MODE.GRACE) {
          chrome.runtime.sendMessage({ command: P.CMD.START_MEDITATION_NOW });
        }
      }
    }, 1000);
  }

  // ── Mount / Unmount ──
  function mountMeditation(st) {
    unmountAll();
    muted = st.muted || false;
    const overlay = buildOverlay(st);
    document.body.appendChild(overlay);
    if (st.mode === P.MODE.MEDITATING) {
      initAudio(); tryPlay();
      startTick(P.MODE.MEDITATING, st.meditationEndsAt, 'meditation-timer-display', 'meditation-ring-progress');
    }
  }

  function mountGrace(st) {
    unmountAll();
    const grace = buildGraceReminder(st);
    document.body.appendChild(grace);
    startTick(P.MODE.GRACE, st.graceEndsAt, 'grace-timer-display', null);
  }

  function unmountAll() {
    if (localInterval) { clearInterval(localInterval); localInterval = null; }
    stopPlay();
    [OVERLAY_ID, GRACE_ID, MODAL_ID].forEach(id => {
      const el = document.getElementById(id);
      if (el?.parentNode) el.remove();
    });
  }

  function cleanup() {
    unmountAll();
    destroyAudio();
    if (listener) {
      try { chrome.runtime.onMessage.removeListener(listener); } catch {}
      listener = null;
    }
  }

  window.__breaknow_meditation_cleanup = cleanup;

  // ── Message interface ──
  listener = (request, sender, sendResponse) => {
    switch (request.command) {
      case P.RENDER.MEDITATION: {
        const st = request.state;
        if (st.mode === P.MODE.MEDITATING) {
          mountMeditation(st);
        } else if (st.mode === P.MODE.DONE) {
          unmountAll();
          stopPlay();
          const overlay = buildOverlay(st);
          document.body.appendChild(overlay);
        }
        sendResponse({ ok: true });
        break;
      }
      case P.RENDER.GRACE: {
        mountGrace(request.state);
        sendResponse({ ok: true });
        break;
      }
      case P.RENDER.UNMOUNT_MEDITATION:
      case P.RENDER.UNMOUNT_GRACE: {
        unmountAll();
        destroyAudio();
        sendResponse({ ok: true });
        break;
      }
      case P.RENDER.UPDATE_MUTE: {
        muted = request.muted;
        const muteBtn = document.getElementById('meditation-mute-button');
        if (muteBtn) muteBtn.textContent = muted ? '\u{1F507}' : '\u{1F50A}';
        if (muted) stopPlay(); else tryPlay();
        sendResponse({ ok: true });
        break;
      }
      case 'checkMeditationUI': {
        sendResponse({ active: !!document.getElementById(OVERLAY_ID) });
        break;
      }
    }
    return true;
  };

  chrome.runtime.onMessage.addListener(listener);
})();
