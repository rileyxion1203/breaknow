# Break Now

**A Chrome extension that forces you to actually take breaks — with guided meditation built in.**

Most break reminder tools send a notification you instantly dismiss. Break Now takes over your entire screen with an **8-minute guided meditation session**, so you can't just click it away and keep grinding. Not ready? You get a **3-minute grace period** — but only twice. Then it's break time.


<img width="2940" height="1680" alt="2757b6e8e57395b70445e2db2369d19e" src="https://github.com/user-attachments/assets/59e4b10d-4cfa-4c5d-a700-54947199da24" />


<img width="2940" height="1668" alt="ba07b7ab17318a345cd18ba8180f85fd" src="https://github.com/user-attachments/assets/30e9486f-1d2b-465a-ab27-50a8fe0e3b27" />



## The Problem

You know you should take breaks. You don't. Browser notifications are too easy to ignore — one click and you're back to doom-scrolling Jira tickets. Your eyes are dry, your back hurts, and your last break was lunch four hours ago.

## The Solution

Break Now triggers a **fullscreen meditation overlay** every N minutes. It follows you across tabs, so switching to another page won't escape it. The session includes a visual **SVG progress ring**, ambient audio with a **mute toggle**, and a dark, distraction-free UI designed to actually calm you down — not annoy you.

The grace period system respects your workflow: if you're mid-thought, request a **3-minute delay** (up to **2x**). After that, it's non-negotiable. The cycle restarts automatically after each session.

---

## Features

- **Fullscreen meditation overlay** — takes over your active tab with an **8-minute** guided session
- **Tab-following banner** — switch tabs all you want, the reminder follows you
- **Grace period system** — **3-minute** snooze, max **2x** per cycle, then it's break time
- **Dark mode UI** — minimal, distraction-free design with **CSS animations** and **SVG progress ring**
- **Mute button** — toggle audio on/off without skipping the session
- **chrome:// fallback** — opens a dedicated meditation tab when content script injection isn't possible (e.g. Chrome settings pages)
- **Auto-restart** — cycle resets automatically after each session
- **State persistence** — survives browser restarts via **`chrome.storage.local`**
- **Zero dependencies** — pure vanilla **JavaScript**, no frameworks, no build step

---

## Install

### From source (Developer mode)

```bash
git clone https://github.com/rileyxion1203/breaknow.git
```

1. Open `chrome://extensions/`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** → select the cloned project folder
4. Pin the extension to your toolbar

---

## How It Works

### User Flow

```
Set timer interval → Work → Fullscreen break triggers
                              ↓
                    Not ready? → 3-min grace (max 2x)
                              ↓
                    8-min meditation session
                              ↓
                    Session ends → Cycle restarts
```

### State Machine

The entire extension runs on a single state machine in `background.js`:

```
idle → countdown → meditating ⇄ grace → done → countdown (restart)
                                          ↓
                                       STOP_ALL → idle
```

---

## Architecture

| Module | Role |
|---|---|
| **`background.js`** | Single source of truth. All state transitions via `dispatch(event)`. Zero UI logic. |
| **`shared/meditation_protocol.js`** | Contract layer — message constants, mode enums, display rules. Shared across all consumers. |
| **`content/force_reminder.js`** | Fullscreen overlay injected into active tab. Pure renderer, zero business logic. |
| **`content/main_timer_banner.js`** | Tab-following countdown banner. Receives render commands from background. |
| **`meditation/meditation.js`** | Standalone fallback page for restricted tabs (chrome://, extensions). Same protocol. |
| **`popup/popup.js`** | Timer controls UI. Reads state from `chrome.storage.local`. |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Platform | **Chrome Extension** (**Manifest V3**) |
| Language | Vanilla **JavaScript** — zero dependencies |
| UI | **CSS animations**, **SVG** progress ring |
| State | **chrome.storage.local** + **chrome.alarms** |
| Injection | **chrome.scripting** API for content scripts |

---

## Permissions

| Permission | Why |
|---|---|
| `<all_urls>` | Inject break reminders on any active tab |
| `alarms` | Schedule timer intervals |
| `storage` | Persist state across browser sessions |
| `scripting` | Dynamic content script injection |
| `tabs` | Tab focus management during meditation |

---

## Project Structure

```
├── background.js                  # State machine — all business logic
├── manifest.json                  # Extension config (Manifest V3)
├── popup/                         # Timer controls UI
├── content/                       # Injected overlays & banners
│   ├── force_reminder.js
│   └── main_timer_banner.js
├── meditation/                    # Fallback meditation page
├── shared/                        # Shared protocol & constants
├── sounds/                        # Audio assets
├── icons/                         # Extension icons
└── images/                        # UI assets
```

---

## Why This Exists

Screen time tools either nag you with ignorable notifications or block websites entirely. Neither actually helps you recover. Break Now sits in the middle — it interrupts you just enough to reset, with a guided experience that makes the break worth taking.

---

## License

MIT

---

Built by [Riley Xiong](https://github.com/rileyxion1203)
