// background.js (v2.0 - state machine architecture)
// ═══════════════════════════════════════════════════
// Single responsibility: manage state + route commands.
// Content scripts only render; all business logic lives here.
// ═══════════════════════════════════════════════════

importScripts('shared/meditation_protocol.js');
const P = globalThis.__breaknow_protocol;

const ALARM_NAME = 'meditationAlarm';

// ── Default state ──
const DEFAULT_STATE = {
  mode: P.MODE.IDLE,
  targetTime: 0,
  graceEndsAt: 0,
  meditationEndsAt: 0,
  graceCount: 0,
  hostTabId: null,
  muted: false,
  timerInterval: 40,
};

// ── In-memory cache (authoritative copy lives in storage) ──
let state = { ...DEFAULT_STATE };
let _tabSwitchTimer = null;

// ── State helpers ──
function getState() {
  return new Promise(resolve => {
    chrome.storage.local.get('breaknow', result => {
      state = result.breaknow ? { ...DEFAULT_STATE, ...result.breaknow } : { ...DEFAULT_STATE };
      resolve(state);
    });
  });
}

function setState(patch) {
  state = { ...state, ...patch };
  return new Promise(resolve => {
    chrome.storage.local.set({ breaknow: state }, resolve);
  });
}

// ── Tab utilities ──
function isInjectableUrl(url) {
  if (!url) return false;
  return !url.startsWith('chrome://') && !url.startsWith('chrome-extension://') && !url.startsWith('about:');
}

function isStandaloneUrl(url) {
  try {
    return url === chrome.runtime.getURL('meditation/meditation.html');
  } catch { return false; }
}

async function isStandaloneTab(tabId) {
  if (!tabId) return false;
  try {
    const tab = await chrome.tabs.get(tabId);
    return isStandaloneUrl(tab.url);
  } catch { return false; }
}

function msg(tabId, message) {
  return new Promise(resolve => {
    if (!tabId) { resolve({ success: false }); return; }
    chrome.tabs.sendMessage(tabId, message, response => {
      if (chrome.runtime.lastError) { resolve({ success: false }); return; }
      resolve({ success: true, response });
    });
  });
}

async function focusTab(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (tab.windowId) await chrome.windows.update(tab.windowId, { focused: true });
    await chrome.tabs.update(tabId, { active: true });
    return true;
  } catch { return false; }
}

async function pickTargetTab(preferredId) {
  const candidates = [];
  if (preferredId) candidates.push(preferredId);

  try {
    const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (active?.id && !candidates.includes(active.id)) candidates.push(active.id);
  } catch {}

  const allTabs = await chrome.tabs.query({});
  for (const t of allTabs) {
    if (t.id && isInjectableUrl(t.url) && !candidates.includes(t.id)) candidates.push(t.id);
  }

  for (const id of candidates) {
    try {
      const t = await chrome.tabs.get(id);
      if (t && isInjectableUrl(t.url)) return t;
    } catch {}
  }
  return null;
}

// ── UI injection ──
async function injectBanner(tabId, targetTime) {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!isInjectableUrl(tab.url)) return false;
    await chrome.scripting.insertCSS({ target: { tabId }, files: ['content/main_timer_banner.css'] });
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content/main_timer_banner.js'] });
    const r = await msg(tabId, { command: P.RENDER.BANNER, targetTime });
    return !!(r.success && r.response?.ok);
  } catch { return false; }
}

async function removeBanner(tabId) {
  if (!tabId) return;
  await msg(tabId, { command: P.RENDER.UNMOUNT_BANNER });
}

async function injectMeditation(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!isInjectableUrl(tab.url)) return false;
    await chrome.scripting.insertCSS({ target: { tabId }, files: ['content/force_reminder.css'] });
    await chrome.scripting.executeScript({ target: { tabId }, files: ['shared/meditation_protocol.js', 'content/force_reminder.js'] });
    const r = await msg(tabId, { command: P.RENDER.MEDITATION, state });
    return !!(r.success && r.response?.ok);
  } catch { return false; }
}

async function removeMeditation(tabId) {
  if (!tabId) return;
  await msg(tabId, { command: P.RENDER.UNMOUNT_MEDITATION });
}

async function cleanupAllUIs() {
  const allTabs = await chrome.tabs.query({});
  const meditationUrl = chrome.runtime.getURL('meditation/meditation.html');
  const jobs = [];

  for (const tab of allTabs) {
    if (!tab.id) continue;
    if (tab.url === meditationUrl) {
      jobs.push(msg(tab.id, { command: P.RENDER.UNMOUNT_STANDALONE }));
    } else if (isInjectableUrl(tab.url)) {
      jobs.push(msg(tab.id, { command: P.RENDER.UNMOUNT_MEDITATION }));
      jobs.push(msg(tab.id, { command: P.RENDER.UNMOUNT_BANNER }));
    }
  }
  await Promise.allSettled(jobs);

  const medTabs = allTabs.filter(t => t.url === meditationUrl);
  if (medTabs.length) {
    await chrome.tabs.remove(medTabs.map(t => t.id).filter(Boolean)).catch(() => {});
  }
}

// ── State machine transitions ──
async function dispatch(event, payload = {}) {
  await getState();

  switch (event) {

    case 'START_TIMER': {
      const interval = payload.interval || state.timerInterval;
      const targetTime = Date.now() + interval * 60 * 1000;
      const hostTabId = payload.hostTabId || null;

      await removeBanner(state.hostTabId);
      await cleanupAllUIs();
      await chrome.alarms.clear(ALARM_NAME);

      await setState({
        mode: P.MODE.COUNTDOWN, targetTime, graceEndsAt: 0, meditationEndsAt: 0,
        graceCount: 0, hostTabId, muted: false, timerInterval: interval,
      });

      chrome.alarms.create(ALARM_NAME, { delayInMinutes: interval });

      if (hostTabId) {
        const ok = await injectBanner(hostTabId, targetTime);
        if (!ok) await setState({ hostTabId: null });
      }
      break;
    }

    case 'ALARM_FIRED': {
      const meditationEndsAt = Date.now() + P.MEDITATION_SECONDS * 1000;
      const preferredTab = state.hostTabId;

      await removeBanner(state.hostTabId);
      await setState({ mode: P.MODE.MEDITATING, meditationEndsAt, graceCount: 0 });

      const targetTab = await pickTargetTab(preferredTab);
      if (targetTab?.id) {
        await focusTab(targetTab.id);
        let ok = await injectMeditation(targetTab.id);
        if (!ok) {
          await removeMeditation(targetTab.id);
          ok = await injectMeditation(targetTab.id);
        }
        if (ok) {
          await setState({ hostTabId: targetTab.id });
          return;
        }
      }
      chrome.tabs.create({ url: chrome.runtime.getURL('meditation/meditation.html'), active: true });
      break;
    }

    case 'START_GRACE': {
      if (state.graceCount >= P.MAX_GRACE) {
        await dispatch('START_MEDITATION_NOW');
        return;
      }
      const graceEndsAt = Date.now() + P.GRACE_SECONDS * 1000;
      const hostTabId = state.hostTabId;
      const standalone = await isStandaloneTab(hostTabId);

      if (!standalone) await removeMeditation(hostTabId);
      await setState({ mode: P.MODE.GRACE, graceEndsAt, graceCount: state.graceCount + 1 });

      if (hostTabId) {
        await msg(hostTabId, { command: P.RENDER.GRACE, state });
      }
      break;
    }

    case 'START_MEDITATION_NOW': {
      const meditationEndsAt = Date.now() + P.MEDITATION_SECONDS * 1000;
      const hostTabId = state.hostTabId;

      if (hostTabId) await msg(hostTabId, { command: P.RENDER.UNMOUNT_GRACE });

      await setState({ mode: P.MODE.MEDITATING, meditationEndsAt });

      if (hostTabId && await isStandaloneTab(hostTabId)) {
        await focusTab(hostTabId);
        await msg(hostTabId, { command: P.RENDER.MEDITATION, state });
        return;
      }

      if (hostTabId) {
        await focusTab(hostTabId);
        const ok = await injectMeditation(hostTabId);
        if (ok) return;
      }

      const targetTab = await pickTargetTab(hostTabId);
      if (targetTab?.id) {
        await focusTab(targetTab.id);
        const ok = await injectMeditation(targetTab.id);
        if (ok) { await setState({ hostTabId: targetTab.id }); return; }
      }
      chrome.tabs.create({ url: chrome.runtime.getURL('meditation/meditation.html'), active: true });
      break;
    }

    case 'MEDITATION_COMPLETED': {
      await setState({ mode: P.MODE.DONE });
      if (state.hostTabId) {
        await msg(state.hostTabId, { command: P.RENDER.MEDITATION, state });
      }
      break;
    }

    case 'DONE_ACKNOWLEDGED': {
      const interval = state.timerInterval;
      const targetTime = Date.now() + interval * 60 * 1000;
      const hostTabId = payload.hostTabId || state.hostTabId;

      await removeMeditation(hostTabId);
      await cleanupAllUIs();
      await setState({
        mode: P.MODE.COUNTDOWN, targetTime, meditationEndsAt: 0, graceEndsAt: 0,
        graceCount: 0, hostTabId,
      });

      chrome.alarms.create(ALARM_NAME, { delayInMinutes: interval });

      if (hostTabId) {
        const ok = await injectBanner(hostTabId, targetTime);
        if (!ok) await setState({ hostTabId: null });
      }
      break;
    }

    case 'STOP_ALL': {
      const preservedInterval = state.timerInterval;
      const hostTabId = state.hostTabId;

      await setState({ ...DEFAULT_STATE, timerInterval: preservedInterval });
      await chrome.alarms.clear(ALARM_NAME);

      await removeBanner(hostTabId);
      await cleanupAllUIs();
      break;
    }

    case 'TOGGLE_MUTE': {
      await setState({ muted: !state.muted });
      if (state.hostTabId) {
        await msg(state.hostTabId, { command: P.RENDER.UPDATE_MUTE, muted: state.muted });
      }
      break;
    }
  }
}

// ── Alarm listener ──
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === ALARM_NAME) dispatch('ALARM_FIRED');
});

// ── Message router ──
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const tabId = sender.tab?.id || null;

  const meditationCommands = [P.CMD.REQUEST_GRACE, P.CMD.START_MEDITATION_NOW, P.CMD.MEDITATION_COMPLETED, P.CMD.TOGGLE_MUTE];
  if (tabId && meditationCommands.includes(request.command)) {
    if (!state.hostTabId || state.hostTabId !== tabId) {
      setState({ hostTabId: tabId });
    }
  }

  switch (request.command) {
    case P.CMD.START_TIMER:
      dispatch('START_TIMER', {
        interval: request.interval,
        hostTabId: request.tabIdToInjectBanner,
      }).then(() => {
        sendResponse({ success: true, scheduledTime: state.targetTime });
      });
      return true;

    case P.CMD.STOP_TIMER:
      dispatch('STOP_ALL').then(() => sendResponse({ success: true }));
      return true;

    case P.CMD.REQUEST_GRACE:
      dispatch('START_GRACE').then(() => sendResponse({ success: true }));
      return true;

    case P.CMD.START_MEDITATION_NOW:
      dispatch('START_MEDITATION_NOW').then(() => sendResponse({ success: true }));
      return true;

    case P.CMD.MEDITATION_COMPLETED:
      dispatch('MEDITATION_COMPLETED').then(() => sendResponse({ success: true }));
      return true;

    case P.CMD.DONE_ACKNOWLEDGED:
      dispatch('DONE_ACKNOWLEDGED', { hostTabId: tabId }).then(() => sendResponse({ success: true }));
      return true;

    case P.CMD.LEAVE_EARLY:
      dispatch('STOP_ALL').then(() => sendResponse({ success: true }));
      return true;

    case P.CMD.TOGGLE_MUTE:
      dispatch('TOGGLE_MUTE').then(() => sendResponse({ success: true }));
      return true;

    case P.CMD.GET_STATE:
      if (tabId && (state.mode === P.MODE.MEDITATING || state.mode === P.MODE.GRACE || state.mode === P.MODE.DONE)) {
        setState({ hostTabId: tabId });
      }
      getState().then(s => sendResponse({ success: true, state: s }));
      return true;

    case 'openTimerDashboard':
      openTimerDashboard();
      sendResponse({ success: true });
      return false;
  }
});

// ── Tab switch: move banner to active tab ──
chrome.tabs.onActivated.addListener(activeInfo => {
  if (_tabSwitchTimer) clearTimeout(_tabSwitchTimer);
  _tabSwitchTimer = setTimeout(async () => {
    _tabSwitchTimer = null;
    await getState();
    if (state.mode !== P.MODE.COUNTDOWN) return;
    if (!state.targetTime || state.targetTime <= Date.now()) return;

    if (state.hostTabId && state.hostTabId !== activeInfo.tabId) {
      await removeBanner(state.hostTabId);
    }
    const ok = await injectBanner(activeInfo.tabId, state.targetTime);
    await setState({ hostTabId: ok ? activeInfo.tabId : null });
  }, 150);
});

// ── Tab navigation: re-inject banner on page load ──
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading' && state.hostTabId === tabId) {
    removeBanner(tabId);
    setState({ hostTabId: null });
    return;
  }
  if (changeInfo.status === 'complete') {
    getState().then(async s => {
      if (s.mode !== P.MODE.COUNTDOWN) return;
      if (!s.targetTime || s.targetTime <= Date.now()) return;
      const ok = await injectBanner(tabId, s.targetTime);
      if (ok) await setState({ hostTabId: tabId });
    });
  }
});

// ── Tab closed ──
chrome.tabs.onRemoved.addListener(tabId => {
  if (state.hostTabId === tabId) {
    setState({ hostTabId: null });
  }
});

// ── Install / update ──
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get('breaknow', result => {
    const existing = result.breaknow || {};
    setState({ ...DEFAULT_STATE, timerInterval: existing.timerInterval || 40 });
  });
  chrome.alarms.clear(ALARM_NAME);
});

// ── Popup helper ──
function openTimerDashboard() {
  if (chrome.action?.openPopup) {
    chrome.action.openPopup().catch(() => {
      chrome.windows.create({
        url: chrome.runtime.getURL('popup/popup.html'),
        type: 'popup', width: 320, height: 360,
      });
    });
    return;
  }
  chrome.windows.create({
    url: chrome.runtime.getURL('popup/popup.html'),
    type: 'popup', width: 320, height: 360,
  });
}

// ── Boot: restore state from storage ──
getState();
