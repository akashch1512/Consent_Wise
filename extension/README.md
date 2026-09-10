# ConsentWise AI — Browser Extension

Reviews consent, payment and privacy language on a page, offers a readable
risk verdict, and — with your permission — sends the page text to the
ConsentWise backend (FastAPI + OpenAI) for a deeper analysis.

Manifest V3 · Chrome / Edge · no build step.

---

## Folder structure

```
extension/
├── manifest.json
├── package.json              npm run check / i18n:build / i18n:check
├── scripts/
│   ├── build-i18n.mjs         rebuilds src/config/i18n.js from its translation table
│   └── check-i18n.mjs         CI guard: every locale has every en-IN key
└── src/
    ├── assets/fonts/          self-hosted Libre Baskerville (SEC-9, no Google Fonts)
    ├── styles/
    │   ├── tokens.css         monochrome design tokens
    │   └── popup.css          popup layout + components
    ├── config/
    │   ├── config.js          globalThis.ConsentWise — backend URLs + endpoints
    │   └── i18n.js            globalThis.ConsentWiseI18n — 131 keys × 10 locales (generated)
    ├── shared/
    │   └── identity.js        globalThis.ConsentWiseIdentity — per-install client id
    ├── background/
    │   └── service-worker.js  opens the analysis tab (backend-origin only), offscreen doc
    ├── content/
    │   ├── detect.js          globalThis.ConsentWiseDetect — consent/payment classifiers
    │   ├── content.js         orchestration: scan, intercept, consent overlay
    │   └── overlay.css        overlay styles injected into pages
    ├── offscreen/
    │   ├── offscreen.html
    │   └── offscreen.js       mic capture + real silence detection for speech-to-text
    └── popup/
        ├── popup.html         markup only
        ├── state.js           globalThis.CWState — storage schema + helpers
        ├── api.js             globalThis.CWApi — every fetch, 30s timeout + AbortSignal
        └── popup.js           orchestrator: tabs, verdict, chat, quiz, upload, sheet
```

### Script load order

`config.js` → `i18n.js` → `identity.js` → `state.js` → `api.js` → `popup.js`
(content script: `config.js` → `identity.js` → `detect.js` → `content.js`;
service worker: `importScripts("../config/config.js")`).

To target a deployed backend, change `BACKEND_URL` in `src/config/config.js`
to an `https://` origin and update `host_permissions` in `manifest.json`.

---

## The popup

Fixed 380 × 600 shell: the top bar and tab strip are pinned; one scroll region.

| Tab | Contents |
|---|---|
| **Scan** | verdict card (risk word + score bar + direction), one primary action, a 3-line summary with *Show more*, and collapsible **What we found / Site reputation / Login safety** accordions. "Open full report" links to the backend dashboard. |
| **Chat** | ask about the analyzed text; the composer is pinned to the bottom. Locked until an analysis exists. |
| **Quiz** | short comprehension check with a progress bar. Locked until an analysis exists. |
| **Document** | drop an image / PDF for OCR + analysis; results also unlock Chat and Quiz. |

The avatar (top-right) opens **Profile & Settings**: name / email / interests,
language, the **Protection** switch, usage stats, and a **Your data** section
(device ID + reset, download, delete).

Colour is used only to encode risk (`--risk-high/mid/low`) and always alongside
a word — never colour alone.

---

## Privacy model

There is no account. Each install gets a random `clientId` (UUID in
`chrome.storage.local`) that keys the user's data on the backend.

- **Sent to the backend when you analyze:** page text, title and URL, plus
  `client_id`. The interception overlay states this and asks before sending;
  "Don't ask again on this site" is remembered per origin.
- **Kept only in `chrome.storage.local`:** `clientId`, `hasSeenWelcome`,
  `protectionEnabled`, `globalLangCode`, the cached last analysis, `userProfile`,
  usage counters, and per-site skip list.
- **Protection switch** is real: `content.js` reads `protectionEnabled` before
  arming any interceptor and reacts to `chrome.storage.onChanged` live.

Backend persistence is optional — with no `DATABASE_URL` the `/api/users` calls
fail quietly and everything else works.

---

## Setup

1. Start the backend (`../backend/README.md`) at `http://localhost:8000`.
2. `chrome://extensions` → **Developer mode** → **Load unpacked** → this folder.

## Development

```
npm run check        # i18n parity + syntax check on every script
npm run i18n:build   # regenerate src/config/i18n.js after editing scripts/build-i18n.mjs
```

No bundler: the module split is for humans. Scripts share state through a few
`globalThis.*` namespaces, loaded in a fixed order.

---

## Known follow-ups (see docs/UI_REVAMP_PLAN.md)

- Ship an `https://` backend and a build-time environment switch (SEC-8).
- Narrow `<all_urls>` to `activeTab` + optional host permissions — this removes
  passive interception, so it is a product decision, not just a refactor (SEC-10).
- Machine-free translations for the ~20 English-only transient strings listed in
  `scripts/build-i18n.mjs` (`EN_ONLY`).
