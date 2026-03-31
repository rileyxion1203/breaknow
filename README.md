# Break Now

A Chrome extension that reminds you to take mindful meditation breaks while working.

## What It Does

Triggers a fullscreen meditation break every N minutes with an 8-minute guided session. Not ready? Request a 3-minute grace period (up to 2x). Cycle restarts automatically after each session.

## Install (Development)

1. Clone this repo
2. Open `chrome://extensions/`
3. Enable **Developer mode**
4. Click **Load unpacked** → select the project folder

## Architecture

Built on **Manifest V3** with a state machine pattern:

- **`background.js`** — Single source of truth. Manages all state transitions via `dispatch(event)`. No UI logic.
- **`shared/meditation_protocol.js`** — Contract layer shared across all consumers. Contains message constants, mode enums, copy strings, and display rules.
- **Content scripts** (`force_reminder.js`, `main_timer_banner.js`) — Pure renderers injected into web pages. Receive render commands from background, send user actions back. Zero business logic.
- **`meditation/meditation.js`** — Standalone meditation page renderer (fallback when content script injection fails). Same command protocol as content scripts.
- **`popup/popup.js`** — Timer controls. Reads state from `chrome.storage.local`.

### State Flow

```
idle → countdown → meditating ⇄ grace → done → countdown (restart)
                                          ↓
                                       STOP_ALL → idle
```

## Permissions

- **`<all_urls>`** — Required to inject break reminders on any active tab
- **`alarms`** — Timer scheduling
- **`storage`** — Persist state across sessions
- **`scripting`** — Content script injection
- **`tabs`** — Tab focus management during meditation

## Tech Stack

Chrome Extension (Manifest V3), vanilla JS, CSS animations, SVG progress ring
