# SigPulse - Productivity Insights

A desktop app built with Electron.js for productivity insights.

## Project structure

```
Test project/
├── main/
│   ├── index.js          # Entry: app lifecycle, window creation, registers IPC
│   ├── config.js         # Intervals, nudge thresholds, feature flags
│   ├── tracker.js        # Screenshot, active-window, and idle tracking (start/stop/pause/resume)
│   ├── gentle-nudges.js  # Subtle desktop notifications (idle, high focus)
│   ├── storage.js       # Persisted data: JSON files, atomic writes, categories, focus score
│   ├── activity-log.js  # Date-keyed rollup file activity-log.json (save/get/last N days)
│   ├── summary.js       # Daily AI summary via OpenAI (cost-efficient prompt)
│   └── ipc.js           # IPC handler registration; consistent { ok, error } responses
├── preload/
│   └── preload.js       # contextBridge API for renderer (no direct Node/Electron)
├── renderer/
│   ├── index.html       # Shell: sidebar nav + Dashboard, Weekly Insights, Activity, Settings
│   ├── vendor/
│   │   └── chart.umd.min.js  # Chart.js (copied on npm install for CSP-safe local load)
│   ├── styles/
│   │   ├── main.css     # Design tokens (:root), dark theme, shared card/title patterns
│   │   └── onboarding.css # First-run onboarding overlay + step transitions
│   └── scripts/
│       ├── utils.js     # Shared formatting and activity-row HTML
│       ├── onboarding.js # First-run multi-step flow (settings.isFirstLaunch)
│       ├── layout.js    # Sidebar navigation, titles, Weekly Insights refresh on tab
│       ├── app.js       # Tracking, privacy, demo mode, delete today
│       ├── dashboard.js # Dashboard + Today's Insights; Refresh Insights / auto summary
│       ├── insights-weekly-data.js   # Helpers for 7-day rollups (charts)
│       ├── insights-weekly-charts.js # Chart.js focus line + stacked bars (Insights view)
│       └── insights-weekly-page.js    # Fetches 7-day rollups and refreshes charts
├── .env.example       # Template for local secrets (copy to `.env`)
├── package.json
└── README.md
```

- **Main** (`index.js`): Loads **`.env`** with **dotenv**, then app lifecycle and window; delegates tracking to `tracker`, data to `storage`, and IPC to `ipc`.
- **Config** (`config.js`): Intervals (screenshot, window, idle) and dev flag; avoids magic numbers.
- **Tracker** (`tracker.js`): All intervals and idle state; `startAll()` / `stopAll()` only. Errors are logged so intervals keep running.
- **Storage** (`storage.js`): Reads/writes with atomic writes; invalid files are treated as empty. Exposes get/append for screenshots, activity, idle, plus summary and focus score. **`settings.json`** holds privacy toggles and **`isFirstLaunch`**: `true` only on a **brand-new install** (no settings file yet). After the onboarding flow, it is set to `false`. If `settings.json` already exists from an older version without this field, **`isFirstLaunch` is treated as false** so existing users are not prompted again. **Daily rollups** per calendar date live in **`activity-log.json`** (see `activity-log.js`): `saveDailySummary`, `getDailySummary`, `getLastNDaysData` — each day includes **hours**, **focus_score**, and **summary_text** (AI daily summary, written when generation succeeds). Today’s row is updated when the dashboard loads activity summary (`syncTodayActivityLog`). Raw `activity.json` / `idle.json` are unchanged for granular tracking.
- **IPC** (`ipc.js`): One place for all handlers; `safeHandler` wraps async handlers and returns `{ ok: false, error }` on throw.
- **Renderer**: Scripts load in order: `utils.js`, Chart vendor, `app.js`, `dashboard.js`, **`insights-weekly-*.js`**, **`layout.js`** (defines `window.sigpulseNavigate`), **`onboarding.js`** (first launch + Settings “View onboarding”). **Insights** in the sidebar opens the **Insights** page (**7-day focus trend** and **stacked activity** charts). **`styles/main.css`** + **`onboarding.css`** define the dark theme and first-run overlay. **Settings → Presentation → Dashboard insight cards**: choose **Classic** (rounded panel cards) or **Banner** (chevron ribbon + icon + content strip for Highlights, Warnings, Suggestions, and Key Events). Stored in **`settings.json`** as `insightsCardStyle`.

## How to run

1. **Install dependencies** (from the project folder):

   ```bash
   npm install
   ```

2. **Start the app**:

   ```bash
   npm start
   ```

   Or:

   ```bash
   npm run dev
   ```

## Windows installer (`electron-builder`)

Build an **NSIS setup `.exe`** (install wizard):

```bash
npm run dist
```

Output goes to **`dist/`** (gitignored), e.g. `SigPulse Setup 1.0.0.exe`.

**Prerequisites on Windows**

1. **Native modules** (`active-win`, `screenshot-desktop`): electron-builder runs **`@electron/rebuild`** (node-gyp). Install **[Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)** with the **“Desktop development with C++”** workload (includes Windows SDK), then run `npm run dist` again.
2. **Project path**: Prefer a folder path **without spaces** (e.g. `C:\dev\sigpulse`). Paths with spaces can break node-gyp during rebuild.

The packaged app **excludes** `.env` files; users add their own `.env` next to the app or configure keys after install as you prefer.

## Environment variables (dotenv)

The Electron **main process** loads a project-root **`.env`** file at startup via **`dotenv`** (`main/index.js`), before other modules run. Values are available on **`process.env`**.

1. Copy **`.env.example`** to **`.env`** in the project root (same folder as `package.json`).
2. Set **`GROQ_API_KEY`** (or **`OPENAI_API_KEY`** / **`OPENAI_KEY`** as fallback). Optional: **`GROQ_MODEL`**.
3. **`.env` is gitignored** — do not commit secrets. Share **`.env.example`** only (no real keys).

`main/summary.js` reads **`process.env.GROQ_API_KEY`** (trimmed) for Groq’s OpenAI-compatible API.

### API key safety (frontend vs backend)

- **Secrets stay in the main (Node) process:** `GROQ_API_KEY` / OpenAI keys are read only in **`main/summary.js`**. The **renderer** (HTML/CSS/JS in `renderer/`) has **no access** to `process.env`, `.env`, or Node APIs.
- **Preload (`preload/preload.js`)** exposes only **`window.sigpulse`** IPC helpers. It does **not** bridge environment variables or API keys.
- **UI calls** `sigpulse.generateDailySummary()` (e.g. **Refresh Insights**) → IPC → main syncs today’s rollup, builds a structured **productivity-assistant** user prompt from **activity hours**, **focus score**, and **behavioral signals** (`high_idle_time`, `high_productivity`, `frequent_context_switching` from `getBehavioralSignalsFromActivity`). **Preprocessor signals** are still computed for **insight tags** and server-side merge, not as the main prompt blob. The model must return JSON (`summary`, `highlights`, `warnings`, `suggestions`); invalid JSON yields a safe error. Response: **`{ ok, text, structured?, generatedAt? }`** or **`{ ok: false, error }`**. Error text is **sanitized** in main; full errors log in the **terminal**.
- **Window hardening:** `contextIsolation: true`, `nodeIntegration: false`, **`sandbox: true`**, `webSecurity: true` so the page cannot turn into a full Node environment.

The window opens with the header **SigPulse - Productivity Insights** and tracking controls. When **Tracking** is ON, the app:
- Captures a screenshot every 5 minutes into the `screenshots` folder (files: `YYYY-MM-DD_HH-mm-ss.png`) and appends metadata to `screenshots.json` (`capturedAt`, `fileName`, optional `appName` from the active window at capture time).
- Records the active window every 10 seconds into `activity.json` (each entry: `timestamp`, `appName`, `windowTitle`).
- Tracks idle time (no mouse/keyboard for 60+ seconds) into `idle.json` (each entry: `idleStart`, `idleEnd`).

Activity, idle, and screenshots metadata use `{ "version": 1, "entries": [ ... ] }`. **`activity-log.json`** is a flat map of **`YYYY-MM-DD`** → `{ coding_hours, browsing_hours, meeting_hours, idle_hours, focus_score, summary_text }` plus root **`version`** (schema v2 adds `summary_text`). Writes are atomic to prevent corruption. After each successful daily summary (**Refresh Insights** or auto-generate on load), `summary_text` for that calendar day is merged into **`activity-log.json`** (metrics-only syncs preserve an existing `summary_text`). The latest successful **AI daily summary** is also cached in `daily-ai-summary.json` (`text`, `generatedAt`) for the dashboard **Today's Insights** card and is removed when you delete today’s data. Deleting today’s data also removes today’s key from **`activity-log.json`**.

**Daily summary (AI):** On **Dashboard** load, the app shows a cached summary for today if one exists; otherwise it **generates automatically** (after charts and stats load). Use **Refresh Insights** (header or Weekly Insights page) to **re-fetch all dashboard data** and **regenerate** today’s summary from the latest activity; summaries are short headlines plus **bullet insights** from activity and focus score.

**UI performance:** Background refresh triggers (e.g. demo mode or AI summary events) are **debounced** (~160ms) so bursts don’t stack duplicate IPC work; the **first dashboard load** and **Refresh Insights** run **immediately**. When numbers and text haven’t changed, the renderer **reuses** chart instances and DOM (activity doughnut, Today’s Insights hero, weekly charts) to cut flicker and work.

**Key Events:** Under **Today’s Insights**, **computed bullets** from today’s `activity.json` appear in a **Key Events** card (same boxed layout as Highlights / Warnings / Suggestions): most **productive hour** (coding + meetings), **most used app** (by tracked time), **longest stretch in one app**, and **frequent context switching** when app-change rate is high (~14+ per tracked hour). This block is **not** from the AI — only from local samples.

**Focus vs yesterday:** The **Today’s Insights** focus tile compares **today’s live focus score** with **yesterday’s stored score** from `activity-log.json`, showing **percent change** and **↑ / ↓ / →** when yesterday’s rollup exists.

- **Groq (preferred if set):** Put `GROQ_API_KEY` in `.env` (loaded into `process.env`). Uses the OpenAI SDK with Groq’s `baseURL`. Default model: **`llama-3.3-70b-versatile`** (override with `GROQ_MODEL` in `.env`). Older ids like `mixtral-8x7b-32768` and `llama3-70b-8192` are [deprecated](https://console.groq.com/docs/deprecations).
- **OpenAI:** If `GROQ_API_KEY` is not set, set `OPENAI_API_KEY` or `OPENAI_KEY` in `.env`; the app uses `gpt-4o-mini`.

The AI receives activity hours as JSON plus focus score and must return **structured JSON only** (`summary` as 2–3 lines, `highlights`, `warnings`, `suggestions` arrays) — concise, professional, insight-driven. **Insight tags** (`Deep Work`, `Distraction`, `Context Switching`) are **not** produced by the model; they are **merged in main** from deterministic rules in `getDailySummaryPreprocessorSignals()` (coding share, idle/browsing, app-switch rate) and saved in the same JSON as `tags`. On read, tags are **refreshed** from current activity so the dashboard stays aligned with live tracking. Those tags remain in stored JSON for possible future use; the **dashboard** surfaces **Highlights**, **Warnings**, and **Suggestions** only (no separate summary card or tag chips).

The OpenAI client in `main/summary.js` is created the same way as in the [OpenAI Node quickstart](https://platform.openai.com/docs/quickstart): `new OpenAI({ apiKey: process.env.OPENAI_API_KEY })`. This project uses `require('openai')` because Electron’s main process is CommonJS; the ESM form is `import OpenAI from "openai"`.

**Privacy:** In **Privacy & settings** you can turn off screenshots (only app usage and idle time are recorded), turn off **gentle desktop nudges** (system toasts), and set an **app blacklist** (comma-separated terms). When the active window’s app name contains any blacklisted term, that window is not recorded. Data is stored only locally. When tracking is on, a banner shows what is currently being collected (screenshots on/off, app usage, idle) for transparency.

**Gentle nudges:** While **tracking** is on, the main process can show **silent** system notifications: one reminder if you stay **idle ~15+ minutes** (once per idle stretch until you’re active again), and an occasional line of **encouragement** if your **focus score is high** (≥80), at most about **every 6 hours**. Tuned in `main/config.js` (`IDLE_LONG_NOTIFY_SECONDS`, `NUDGE_*`). **Windows** uses `app.setAppUserModelId` for toasts; **macOS** may prompt for notification permission the first time.

**Demo mode:** For presentations, enable **Demo mode** in the UI. The app then shows preloaded sample data (activity, idle, screenshots metadata) instead of your real data. Focus score, activity breakdown, and **Refresh Insights** use this sample data while the toggle is on. Turn Demo mode off to return to your real data. Real data is never overwritten by demo mode.

**Weekly charts:** The **Insights** tab loads **`getLastNDaysData(7)`** and renders a **focus score line chart** and **stacked bar chart** (hours by category per day). In **Demo mode**, sample rollups come from `demo-data.js`. To test on disk without Demo mode, run:

```bash
npm run seed-activity-log
```

That writes **seven** days into **`activity-log.json`** (merges by date; does not erase other days), matching the **Weekly performance** focus chart range.
