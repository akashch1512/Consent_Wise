# 🛡️ ConsentGuard AI — Chrome Extension

> **Hackathon Project · Accessible Financial Authorization**
> Intelligently detects financial consent actions, prevents blind agreement, and redirects users to a safe analysis dashboard.

---

## 📁 File Structure

```
ConsentGuard-AI/
├── manifest.json       ← Manifest V3 config
├── content.js          ← Page-level detection & interception
├── background.js       ← Service worker / tab manager
├── popup.html          ← Extension popup dashboard UI
├── popup.js            ← Popup logic & stats
├── styles.css          ← Overlay & highlight styles (injected into pages)
├── icons/              ← (Add your own PNG icons: 16, 48, 128px)
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

---

## ⚡ Quick Setup

### 1. Add placeholder icons (required for Chrome to load)
You can use any small PNG files renamed to `icon16.png`, `icon48.png`, `icon128.png` and placed in an `icons/` subfolder. Or generate them with any icon tool.

### 2. Load the extension
1. Open Chrome → navigate to `chrome://extensions`
2. Toggle **Developer Mode** ON (top-right)
3. Click **"Load unpacked"**
4. Select the `ConsentGuard-AI/` folder
5. The extension appears in your toolbar 🎉

### 3. Start your web app (optional, for full flow)
```bash
# Your analysis dashboard should be running at:
http://localhost:3000
```
The extension will pass extracted page content as a URL query param:
```
http://localhost:3000?data=ENCODED_TEXT
```

---

## 🔍 How It Works

| Step | What happens |
|------|-------------|
| 1    | `content.js` scans the page for checkboxes near "agree/terms" text |
| 2    | `content.js` scans for buttons with words like "agree", "pay", "proceed" |
| 3    | MutationObserver watches for dynamically added elements (SPAs) |
| 4    | User clicks → event is **intercepted** (preventDefault + stopPropagation) |
| 5    | Matching element gets a **red border highlight** |
| 6    | A **premium animated overlay** appears with step indicators |
| 7    | User clicks "Analyze & Continue Safely" |
| 8    | Page content (first 5,000 chars) is extracted and **URL-encoded** |
| 9    | `background.js` opens (or reuses) a tab at `localhost:3000?data=…` |

---

## 🎨 UI Features

- **Overlay**: Dark frosted-glass backdrop, gradient card, animated spinner + pulse ring, 3-step progress indicator
- **Buttons**: Primary gradient CTA + ghost cancel button
- **Popup**: Live status pill, feature list with icons, animated stats counter, dashboard CTA

---

## 🔐 Permissions Used

| Permission | Reason |
|------------|--------|
| `activeTab` | Access current page's tab info |
| `scripting` | Programmatic script injection if needed |
| `tabs` | Open the analysis dashboard tab |
| `host_permissions: <all_urls>` | Content script runs on all pages |

---

## 🐛 Debugging

Open DevTools on any page → Console, filter by `[ConsentGuard`:

```
[ConsentGuard AI] 🛡️  Initialised on: https://...
[ConsentGuard AI] ☑️  Agreement checkbox detected
[ConsentGuard AI] 🔘 Consent button detected: pay now
[ConsentGuard AI] 🚫 Button intercept fired
[ConsentGuard AI] 🔀 Redirecting to web app
[ConsentGuard BG] ✅ New analysis tab created: 42
```

---

## 💡 Hackathon Edge Points

- ✅ Manifest V3 (latest standard)
- ✅ Both checkbox AND button interception
- ✅ MutationObserver for SPAs / lazy-loaded content
- ✅ Capture-phase event listeners (fire before host handlers)
- ✅ Premium fintech-style overlay (no `alert()` calls)
- ✅ Smart tab reuse in background service worker
- ✅ Graceful error handling + fallback `window.open`
- ✅ Fully commented, production-quality code
