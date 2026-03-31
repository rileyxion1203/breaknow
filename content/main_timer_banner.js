// content/main_timer_banner.js (v2.0 - pure renderer: mount / render / unmount)
(() => {
  const ID = 'mindful-break-main-timer-banner';

  // ── Cleanup prior injection ──
  if (window.__breaknow_banner_cleanup) {
    try { window.__breaknow_banner_cleanup(); } catch (e) {}
  }
  const stale = document.getElementById(ID);
  if (stale) stale.remove();

  let el = null;
  let intervalId = null;
  let targetTime = 0;
  let listener = null;

  // ── Mount ──
  function mount() {
    if (el) return;
    el = document.createElement('div');
    el.id = ID;
    el.classList.add('hidden');
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    el.title = 'Open timer dashboard';

    const text = document.createElement('p');
    text.id = `${ID}-text`;
    text.innerHTML = 'Break in <span class="banner-time">--s</span>';
    el.appendChild(text);

    const openDashboard = () => {
      chrome.runtime.sendMessage({ command: 'openTimerDashboard' }, () => {
        if (chrome.runtime.lastError) {}
      });
    };
    el.addEventListener('click', openDashboard);
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDashboard(); }
    });
    document.body.appendChild(el);
  }

  // ── Render ──
  function render() {
    if (!el || !targetTime) return;
    const ms = targetTime - Date.now();
    const text = document.getElementById(`${ID}-text`);
    if (ms <= 0) {
      if (text) text.innerHTML = 'Break in <span class="banner-time">0s</span>';
      unmount(true); // fade out
      return;
    }
    const total = Math.ceil(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    const fmt = m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`;
    if (text) text.innerHTML = `Break in <span class="banner-time">${fmt}</span>`;
  }

  // ── Unmount ──
  function unmount(fade = false) {
    if (intervalId) { clearInterval(intervalId); intervalId = null; }
    if (!el) return;
    if (fade) {
      el.classList.add('hidden');
      setTimeout(() => { if (el?.parentNode) el.remove(); el = null; }, 300);
    } else {
      if (el.parentNode) el.remove();
      el = null;
    }
  }

  function cleanup() {
    unmount();
    if (listener) {
      try { chrome.runtime.onMessage.removeListener(listener); } catch {}
      listener = null;
    }
  }

  window.__breaknow_banner_cleanup = cleanup;

  // ── Message interface ──
  listener = (request, sender, sendResponse) => {
    if (request.command === 'render_banner') {
      targetTime = request.targetTime;
      mount();
      el.classList.remove('hidden');
      if (intervalId) clearInterval(intervalId);
      render();
      intervalId = setInterval(render, 1000);
      sendResponse({ ok: true });

    } else if (request.command === 'unmount_banner') {
      unmount();
      sendResponse({ ok: true });
    }
    return true;
  };

  chrome.runtime.onMessage.addListener(listener);
})();
