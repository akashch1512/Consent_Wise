# 🛡️ ConsentWise AI — Browser Extension

Detects financial / consent / privacy language on a page, intercepts blind
"I agree" clicks, and opens a readable safety analysis backed by the
ConsentWise backend (FastAPI + OpenAI).

Works in Chrome and Edge (Manifest V3).

---

## Folder structure

```
extension/
├── manifest.json
├── README.md
└── src/
    ├── config/
    │   ├── config.js          single source of truth for backend URLs (globalThis.ConsentWise)
    │   └── i18n.js             popup translations + tiny translation engine
    ├── shared/
    │   └── identity.js         per-user client id + backend profile sync (globalThis.ConsentWiseIdentity)
    ├── background/
    │   └── service-worker.js   opens the analysis tab, manages the offscreen doc
    ├── content/
    │   ├── content.js          page scanning, click interception, overlay
    │   └── overlay.css         styles injected into pages
    ├── offscreen/
    │   ├── offscreen.html
    │   └── offscreen.js        records the mic for speech-to-text
    ├── popup/
    │   ├── popup.html
    │   └── popup.js            toolbar UI: analysis, chat, quiz, TTS, doc upload, onboarding
    └── demo/
        ├── index.html          standalone image-analysis demo (not wired into the toolbar)
        ├── demo.js
        └── demo.css
```

### Load order per context

`config.js` runs first everywhere and publishes `globalThis.ConsentWise`
(`BACKEND_URL`, `WEB_APP_URL`, `TRUSTED_ORIGINS`, `API.*`). `identity.js`
(`globalThis.ConsentWiseIdentity`) runs next where a user id is needed.

| Context | Wiring |
|---|---|
| content script | `manifest.json` → `"js": ["src/config/config.js", "src/shared/identity.js", "src/content/content.js"]` |
| popup | `<script>` tags: `../config/config.js`, `../config/i18n.js`, `../shared/identity.js`, `popup.js` |
| offscreen | `<script>` tags: `../config/config.js`, `offscreen.js` |
| service worker | no backend calls — no imports |
| popup → tab injection | `chrome.scripting.executeScript({ files: ["src/config/config.js", "src/shared/identity.js", "src/content/content.js"] })` |

To target a deployed backend, change the two URLs at the top of
`src/config/config.js` — nothing else.

---

## Per-user data

There is no login. On first run `identity.js` generates a random `clientId`
(UUID) and stores it in `chrome.storage.local`. That id keys the user's data on
the backend.

- **Sent to the backend (durable, Postgres):**
  - onboarding profile — name, email, interest chips, language — via `POST /api/users`
  - every analysis — url, title, danger/reputation scores, summary — attached to
    `/api/extension/analyze` and `/api/analyze-document` as `client_id`
- **Kept in `chrome.storage.local` (convenience only):** `clientId`,
  `hasSeenWelcome`, `globalLangCode`, `protectionEnabled`, the cached last
  analysis, and a `userProfile` copy so the onboarding form re-populates
  instantly.

Backend persistence is optional — if the backend has no `DATABASE_URL`, the
sync calls fail quietly and the extension still works.

---

## Setup

1. Start the backend (`../backend/README.md`) at `http://localhost:8000`.
2. Open `chrome://extensions` (or `edge://extensions`).
3. Enable **Developer mode** → **Load unpacked** → select this `extension/` folder.

---

## How it works

| Step | What happens |
|------|--------------|
| 1 | `content.js` scans for agreement checkboxes / consent buttons; a `MutationObserver` catches ones added later |
| 2 | A matching click is intercepted (capture-phase `preventDefault`) and the element is highlighted |
| 3 | An overlay explains what was caught |
| 4 | On "Analyze & Continue Safely", page text + `client_id` → `POST /api/extension/analyze` |
| 5 | `service-worker.js` opens (or reuses) a tab on the backend `/dashboard/{id}` report |

The popup runs the same analysis for the current tab, plus a document/image
uploader, grounded chat, a comprehension quiz, and text-to-speech.

---

## Debugging

Filter the page console by `[ConsentWise`.
