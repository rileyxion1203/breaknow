// popup/popup.js (v2.0 - reads from breaknow state schema)
// Requires shared/meditation_protocol.js loaded via <script> in popup.html.
const P = window.__breaknow_protocol;

const startButton = document.getElementById('startButton');
const stopButton = document.getElementById('stopButton');
const statusDiv = document.getElementById('status');
const intervalInput = document.getElementById('interval');
let statusIntervalId = null;

function formatCountdown(targetTime) {
  const timeLeftMs = Math.max(0, targetTime - Date.now());
  const minutesLeft = Math.floor(timeLeftMs / 60000);
  const secondsLeft = Math.floor((timeLeftMs % 60000) / 1000);
  return `${minutesLeft}m ${String(secondsLeft).padStart(2, '0')}s`;
}

function setTemporaryStatus(message) {
  statusDiv.textContent = message;
  window.setTimeout(() => {
    loadAndUpdateStatus();
  }, 1800);
}

function updateDisplayFromState(st) {
  if (!st || st.mode === P.MODE.IDLE) {
    statusDiv.textContent = 'Timer is off.';
    startButton.disabled = false;
    stopButton.disabled = true;
    intervalInput.disabled = false;
    return;
  }

  if (st.mode === P.MODE.MEDITATING || st.mode === P.MODE.DONE) {
    const label = st.mode === P.MODE.DONE
      ? 'Meditation complete ✨'
      : st.meditationEndsAt > Date.now()
        ? `Meditation in progress: ${formatCountdown(st.meditationEndsAt)} left`
        : 'Meditation in progress';
    statusDiv.textContent = label;
    startButton.disabled = true;
    stopButton.disabled = false;
    intervalInput.disabled = true;
    return;
  }

  if (st.mode === P.MODE.GRACE) {
    const label = st.graceEndsAt > Date.now()
      ? `Grace period: ${formatCountdown(st.graceEndsAt)} left`
      : 'Starting meditation...';
    statusDiv.textContent = label;
    startButton.disabled = true;
    stopButton.disabled = false;
    intervalInput.disabled = true;
    return;
  }

  if (st.mode === P.MODE.COUNTDOWN) {
    if (st.targetTime > Date.now()) {
      statusDiv.textContent = `Next break in ${formatCountdown(st.targetTime)}`;
    } else {
      statusDiv.textContent = 'Preparing your break reminder...';
    }
    startButton.disabled = true;
    stopButton.disabled = false;
    intervalInput.disabled = true;
    return;
  }

  // Fallback
  statusDiv.textContent = 'Timer is off.';
  startButton.disabled = false;
  stopButton.disabled = true;
  intervalInput.disabled = false;
}

function loadAndUpdateStatus(forceUpdateIntervalInput = false) {
  chrome.storage.local.get('breaknow', (result) => {
    const st = result.breaknow || { mode: P.MODE.IDLE, timerInterval: 40 };
    if (forceUpdateIntervalInput && st.timerInterval !== undefined) {
      intervalInput.value = st.timerInterval;
    }
    updateDisplayFromState(st);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  loadAndUpdateStatus(true);

  if (statusIntervalId) clearInterval(statusIntervalId);
  statusIntervalId = setInterval(() => {
    loadAndUpdateStatus();
  }, 1000);
});

startButton.addEventListener('click', async () => {
  const interval = parseInt(intervalInput.value, 10);
  if (isNaN(interval) || interval < 1) {
    setTemporaryStatus('Enter a valid interval of at least 1 minute.');
    return;
  }

  let currentTabId = null;
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab?.id) currentTabId = activeTab.id;
  } catch (e) {
    console.error('Popup: Error querying active tab:', e);
  }

  chrome.runtime.sendMessage(
    {
      command: P.CMD.START_TIMER,
      interval,
      tabIdToInjectBanner: currentTabId,
    },
    (response) => {
      if (chrome.runtime.lastError) {
        console.error('Error sending startTimer:', chrome.runtime.lastError.message);
        setTemporaryStatus('Could not start the timer. Please reload the extension.');
        return;
      }
      if (response?.success) {
        loadAndUpdateStatus();
      } else {
        setTemporaryStatus('Start failed. Please check the service worker logs.');
      }
    }
  );
});

stopButton.addEventListener('click', () => {
  chrome.runtime.sendMessage({ command: P.CMD.STOP_TIMER }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('Error sending stopTimer:', chrome.runtime.lastError.message);
      setTemporaryStatus('Could not stop the timer. Please reload the extension.');
      return;
    }
    if (response?.success) {
      loadAndUpdateStatus(true);
    } else {
      setTemporaryStatus('Stop failed. Please check the service worker logs.');
    }
  });
});

window.addEventListener('unload', () => {
  if (statusIntervalId) clearInterval(statusIntervalId);
});
