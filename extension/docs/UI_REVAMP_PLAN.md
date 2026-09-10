# ConsentWise Extension — Revamp Plan

**Status:** implemented (Phases 0–5). Phase 6 (HTTPS backend, permission narrowing) deferred — see notes at the end.
**Scope:** everything under `extension/`
**Goal:** a minimal black-and-white, professional, trustworthy popup — and the removal of a set of security, privacy and correctness defects found during audit.

---

## Implementation notes (what shipped)

| Phase | Done | Where |
|---|---|---|
| **0 — trust & correctness** | ✅ | BUG-1 duplicate listener gone (single `popup.js`). SEC-3 Protection is real — `content.js` reads `protectionEnabled` + `chrome.storage.onChanged`. SEC-1/2 overlay rewritten: honest disclosure + explicit "Send page text for analysis" + per-origin "Don't ask again". SEC-4 `openTab` accepts backend-origin URLs only. SEC-5 sender checks on all 3 listeners. SEC-6 `web_accessible_resources` removed. BUG-3 quiz uses an index. BUG-4 highlight styles restored on close. BUG-7 `lastAnalysisTabId` → `chrome.storage.session`. BUG-6 offscreen creation promise-guarded. SEC-12 all fetches have a 30s `AbortController`. Console noise removed. |
| **1 — shell** | ✅ | `html,body{height:600px}`, body is a flex column, `.topbar`/`.tabs` pinned, `.body` is the only scroll region. Measured: tab strip visible at every scroll position. |
| **2 — design system** | ✅ | `src/styles/tokens.css` (monochrome) + `popup.css` + `content/overlay.css`; every gradient / accent hex removed incl. inline quiz colours. Fonts self-hosted in `src/assets/fonts/`, Google Fonts links deleted. `:focus-visible` rings global. Type split: `--font-ui` (system) for chrome, `--font-read` (Libre Baskerville) for prose. |
| **3 — Scan redesign** | ✅ | Two rings → one verdict card (word + score bar + explicit "higher = riskier" + trust one-liner + source). Key points / reputation / login moved to native `<details>` accordions; last-opened remembered. Pre-scan shows "Not scanned yet" with no asserted findings. One primary button; "Open full report" is a quiet link. Collapsed panel ≈ 533 px (verdict + button + summary above the fold, accordions one short scroll). |
| **4 — Chat / Quiz / Doc** | ✅ | `alert()` ×3 → one inline `#banner`. Analyze shows a shimmer skeleton and the button becomes **Cancel** (AbortController). Chat: auto-grow textarea, Enter/Shift+Enter, retry-on-failure, history capped at 8 turns, composer pinned to the floor (the "hanging" bug — measured `bottom≈584`). Quiz: pinned progress + Next. Document: centred empty state, compact after upload, unlocks Chat/Quiz. |
| **5 — maintainability & i18n** | ✅ | `popup.js` split → `state.js` (storage schema) + `api.js` (network) + `popup.js`. `src/demo/` deleted. Detection moved to `content/detect.js` with word-boundary matching + deny-list + "needs an agreement signal" for generic verbs; observer debounced via `requestIdleCallback`, disconnected on `pagehide`. i18n regenerated to **131 keys × 10 locales** via `scripts/build-i18n.mjs`; `scripts/check-i18n.mjs` fails on any missing key (`npm run check`). ~20 transient strings stay English-only (listed in `EN_ONLY`). New backend endpoint `DELETE /api/users/{client_id}` for "Delete my data" (+ 2 tests). |
| **6 — pre-release** | ⏸ deferred | HTTPS + env switch: `config.js` now exposes `BACKEND_ORIGIN` and documents the change, but the default stays `http://localhost:8000`. Permission narrowing intentionally **not** done — dropping `content_scripts` `<all_urls>` removes passive interception, which is a product decision. |

**Measured before → after** (headless Chrome, 380 px):

| | before | after |
|---|---|---|
| document height | 909 px (clipped) | 600 px, single scroll region |
| Scan panel (collapsed) | 792 px | 533 px |
| two score rings | 208 px | 0 (verdict card ≈ 135 px) |
| Chat composer position | y ≈ 262 (≈ 280 px dead space) | flush, bottom ≈ 584 |
| tab strip while scrolled | hidden | pinned |
| i18n coverage (non-en) | 68 / 85 keys | 131 / 131 keys |

---

This document is written to be executed by another engineer/model without further context. Every item states *where*, *what*, and *how to verify*.

---

## 0. Executive summary

The extension works, but three classes of problem stack up:

1. **Trust defects.** The interception overlay tells the user *"Your data is processed locally. Nothing is sent to external servers."* while the same code path POSTs up to 5,000 characters of page text to a backend that forwards it to OpenAI. The Protection toggle in Settings writes a storage key that **nothing ever reads** — it is a decorative switch. Both must be fixed before anything cosmetic.
2. **Layout is structurally broken, not just ugly.** The popup body has no fixed height, so the Scan panel renders **792 px tall inside a 600 px Chrome popup cap**, and because the header and tab strip are not pinned, **scrolling down destroys the navigation**. Conversely the Chat panel is only ~262 px, so its composer "hangs" near the top with ~280 px of dead white space — this is the "chat send hanging above" symptom.
3. **The Scan tab asks the user to decode two competing 0–100 scores** (Danger: higher is worse; Reputation: higher is better) rendered as two identical rings. There is no way to tell which direction is good.

Plus a duplicated event listener that makes every "Analyze This Page" click fire **two** backend analyses (double latency, double OpenAI spend).

The plan below is ordered so that **Phase 0 ships correctness and trust with zero visual change**, then the redesign lands on a clean base.

---

## PART A — Findings

Severity: **S1** ship-blocker · **S2** must fix · **S3** should fix · **S4** polish

### A1. Security & privacy

| # | Sev | Finding | Location |
|---|-----|---------|----------|
| SEC-1 | **S1** | **False privacy claim.** The overlay states "Your data is processed locally. Nothing is sent to external servers." The same flow sends page text, page title and full URL to `POST /api/extension/analyze` → OpenAI. This is a user-facing untruth and a store-review / legal risk. | `src/content/content.js:220-222` |
| SEC-2 | **S1** | **No consent before exfiltrating page text.** `redirectToWebApp()` uploads `document.body.innerText.slice(0,5000)` — which on a logged-in page can include names, addresses, balances, order history — with no disclosure of the destination and no opt-out. | `src/content/content.js:104-135` |
| SEC-3 | **S1** | **Protection toggle is a no-op.** `protectionEnabled` is written by the popup and read by *nobody*. Turning protection off leaves every interceptor armed. Users believe they disabled the extension when they did not. | written `src/popup/popup.js:70-83`; never read in `content/` or `background/` |
| SEC-4 | **S2** | **Unvalidated `openTab`.** The service worker calls `chrome.tabs.create({url})` with whatever `message.url` it is handed. The value originates from a backend JSON field (`dashboard_url`). A compromised or misconfigured backend gets an arbitrary-navigation primitive. | `src/background/service-worker.js:56-58, 99-120` |
| SEC-5 | **S2** | **No sender validation** on any `chrome.runtime.onMessage` listener (SW, content, offscreen). Any extension context can drive STT or open tabs. | all three listeners |
| SEC-6 | **S2** | **`offscreen.html` is web-accessible to `<all_urls>`.** It does not need to be — `chrome.offscreen.createDocument()` does not consult `web_accessible_resources`. As written, **any website can probe the URL and fingerprint that ConsentWise is installed.** | `manifest.json:33-38` |
| SEC-7 | **S2** | **Permanent device identifier + full browsing content.** `client_id` is a stable UUID sent alongside every analyzed URL and page excerpt, with `<all_urls>` host access. Server-side this composes into a cross-site browsing profile. There is no in-product way to view, export or rotate it (only "Log out", which silently wipes everything). | `src/shared/identity.js`, `content.js:108-118`, `popup.js:473-483` |
| SEC-8 | **S3** | **Cleartext HTTP backend** (`http://localhost:8000`) with `host_permissions` for it. Fine for dev, unacceptable in any shipped build. | `src/config/config.js:15` |
| SEC-9 | **S3** | **Third-party font request on every popup open.** Google Fonts is contacted from `fonts.googleapis.com` + `fonts.gstatic.com`, leaking usage timing to Google and breaking typography offline. | `src/popup/popup.html:8-12` |
| SEC-10 | **S3** | **Maximal permissions.** `<all_urls>` in both `content_scripts` and `host_permissions`. Chrome Web Store review will demand justification; a narrower model (activeTab + optional host permissions) is achievable given the popup already injects on demand. | `manifest.json:13-32` |
| SEC-11 | **S4** | `innerHTML` used for the chat welcome bubble and the overlay. Inputs are developer-controlled today, so not currently exploitable — but it is a sink one careless edit away from XSS. | `popup.js:596`, `content.js:150` |
| SEC-12 | **S4** | **No fetch timeouts anywhere.** A hung backend leaves buttons disabled and spinners running forever with no abort path. | every `fetch(` in `popup.js`, `content.js`, `offscreen.js` |

### A2. Correctness bugs

| # | Sev | Finding | Location |
|---|-----|---------|----------|
| BUG-1 | **S1** | **Duplicate listener registration.** `openLatestBtn` and `analyzeCurrentBtn` each get their click handler bound **twice**. One click ⇒ two `analyzeCurrentTab()` runs ⇒ two `/api/extension/analyze` calls, two OpenAI charges, and racing writes to the button label (the first run's `finally` restores the label while the second is still in flight). | `popup.js:886-887` **and** `popup.js:1011-1012` |
| BUG-2 | **S2** | **Interception matches far too broadly.** `BUTTON_KEYWORDS` is substring-matched against every `button`/`[role=button]` on every site: `"continue"`, `"accept"`, `"confirm"`, `"pay"` catch cookie banners, wizards, "Accepted", "PayPal", "Repayment"… and the handler runs in the **capture phase** with `preventDefault()` + `stopImmediatePropagation()`. This silently breaks host sites. | `content.js:24, 337-358` |
| BUG-3 | **S2** | **Quiz "Finish" is compared as literal English** (`quizNextBtn.textContent === "Finish"`) while the label is set from `t("finishQuiz")`. In any of the 9 non-English locales the guard never matches. | `popup.js:1005` vs `949` |
| BUG-4 | **S2** | **Host page permanently defaced.** `highlightElement()` writes a red outline + box-shadow into the page's inline styles and never removes them. | `content.js:274-279` |
| BUG-5 | **S3** | **Offscreen "silence timeout" is not silence detection** — it is a hard 5 s cap that cuts the user off mid-sentence. | `offscreen.js:18, 145-150` |
| BUG-6 | **S3** | **Offscreen creation race.** If a second `stt-start` arrives while `offscreenCreating` is true, `ensureOffscreenDocument()` sleeps 500 ms and returns regardless; the follow-up message can be delivered before the document exists and is dropped. | `service-worker.js:26-42` |
| BUG-7 | **S3** | **Service-worker state is lost on every idle unload.** `lastAnalysisTabId` lives in a module variable; MV3 terminates the worker after ~30 s, so tab-reuse silently stops working. Belongs in `chrome.storage.session`. | `service-worker.js:12` |
| BUG-8 | **S3** | **`chatHistory` grows unbounded** and is resent in full on every message — cost and latency grow linearly, eventually exceeding the model context. | `popup.js:744-745` |
| BUG-9 | **S4** | **Reflow storm.** The `MutationObserver` fires on every DOM change and `isAgreementCheckbox()` reads `parentElement.innerText` (forces synchronous layout) for each candidate. Heavy on SPAs. Observer is never disconnected. | `content.js:282-301, 375-402` |

### A3. UX problems (measured)

Measurements taken by rendering the real popup in headless Chrome at 372 px width.

| # | Sev | Finding | Evidence |
|---|-----|---------|----------|
| UX-1 | **S1** | **Navigation scrolls away.** Document height is **909 px**; Chrome caps popups at **600 px**. `.topbar` and `.tabs` are static, so scrolling to read the Scan results pushes the tab strip off-screen — the user loses the only way to switch sections. | `body h=908.5`, `.tabs top=53` |
| UX-2 | **S1** | **Scan panel is 792 px of uninterrupted content** — 6 stacked blocks with no hierarchy. This is the "highly occupied" complaint. | `[data-panel=scan] h=792.5` |
| UX-3 | **S1** | **Short tabs leave a dead zone — the "chat send hanging above".** The Chat panel's content ends at y≈262 in a ≥540 px popup, so the composer floats in the upper third with ~280 px of blank white beneath it. Root cause: panels are content-height; nothing claims the remaining space. | `.chat-input-row bottom=262.2`, body min-height 540 |
| UX-4 | **S2** | **Two contradictory 0–100 rings.** Danger (high = bad) and Reputation (high = good) are rendered identically, side by side, consuming **207 px**. Users cannot infer direction. Risk is also encoded **by colour alone** — fails WCAG 1.4.1 and is unreadable for red-green colour blindness. | `.meters h=207.7` |
| UX-5 | **S2** | **`alert()` used for three error paths.** Blocking, unstyled, OS-chrome dialogs inside a 372 px popup; can dismiss the popup on focus loss. | `popup.js:529, 877, 958` |
| UX-6 | **S2** | **Empty states are wrong before first use.** A fresh install shows "No verified bad history was identified from this analysis" — asserting a *result* when no analysis has run. | `popup.js:296` |
| UX-7 | **S2** | **Non-English users get an English UI.** 17 keys (all tab labels, the entire welcome screen, the whole profile panel) exist only in `en-IN`; the other **9 locales fall back to English**. | see A4/i18n table |
| UX-8 | **S3** | **Libre Baskerville at 8.5–11 px.** A high-contrast display serif is used for uppercase micro-labels down to 8.5 px (`.meter-caption`). Hairlines disappear; legibility is poor. | `popup.html:188` |
| UX-9 | **S3** | **No loading skeletons, no progress.** Analysis takes seconds; the UI only swaps a button label. No cancel affordance. | `popup.js:444-451` |
| UX-10 | **S3** | **Chat has no auto-grow, no Shift+Enter, no scroll-to-bottom, no retry.** `keypress` (deprecated) is used instead of `keydown`. | `popup.js:757-758` |
| UX-11 | **S3** | **No keyboard access to tabs** (no arrow-key roving focus, no `role="tablist"`/`aria-selected`), and **no visible focus ring anywhere** (`outline: none` on inputs with no replacement). | `popup.html:116-129, 269-280` |
| UX-12 | **S3** | **Two "primary" gradient buttons compete** in the Scan header row; nothing signals which is the main action. | `popup.html` row-actions |
| UX-13 | **S4** | Onboarding "interest chips" are captured and stored but **never influence anything** in the product. | profile panel |

### A4. Maintainability

| # | Sev | Finding |
|---|-----|---------|
| MNT-1 | **S2** | **`popup.js` is 1,316 lines of flat script** — DOM refs, network, i18n, tabs, chat, quiz, TTS, upload, profile, welcome all in one file scope with ~50 module-level `const` element handles. No modules, no tests, no build step. |
| MNT-2 | **S2** | **`popup.html` is 862 lines with ~540 lines of inline `<style>`.** CSS cannot be linted, diffed or shared with the overlay. |
| MNT-3 | **S2** | **i18n key drift with no guard.** `en-IN` has 85 keys; the other 9 locales have 68. Nothing fails when a key is added to one locale only. |
| MNT-4 | **S2** | **UI strings hardcoded past the i18n layer** — `"High danger"`, `"Use caution"`, `"Ready to Scan"`, `"Awaiting Site Check"`, `"Show raw text ▾"`, all the mic tooltips, every `alert()` body. |
| MNT-5 | **S3** | **`src/demo/` (969 lines) is dead code** — not in the manifest, not referenced by any page, yet shipped in the package. |
| MNT-6 | **S3** | **Styling driven from JS.** `renderQuizQuestion` / `handleQuizAnswer` assign raw hex colours (`#e2e8f0`, `#dcfce7`, `#166534`) inline, bypassing the token system — these are the colours that will survive a black-and-white redesign unless hunted down. |
| MNT-7 | **S3** | **Two page-text extractors with different behaviour** (`extractPageContent` for interception, `extractPolicyContent` for the popup) — results differ by entry point. |
| MNT-8 | **S3** | **Storage keys are stringly-typed and scattered** — 13 `latest*` keys enumerated by hand in three places in `restoreLatestAnalysis`. |
| MNT-9 | **S4** | 29 `console.log` calls with emoji, including page URLs, left in shipping code. |
| MNT-10 | **S4** | Stray `// hello` comment (`popup.js:120`); dead `WEB_APP_URL`/`extensionConfig` config entries. |

---

## PART B — Target design system

**Direction: monochrome, editorial, quiet.** No gradients. No decorative colour. Colour appears *only* to encode risk, and never alone — always paired with a word and a shape.

### B1. Tokens

Replace the entire `:root` block. New file: `src/styles/tokens.css`.

```css
:root {
  /* Surface */
  --bg:          #ffffff;
  --surface:     #ffffff;
  --surface-sunken: #fafafa;   /* inset blocks: summary, chat log, drop zone */

  /* Line */
  --line:        #e7e7e7;      /* hairlines, card borders */
  --line-strong: #d0d0d0;      /* input borders, dividers under headers */

  /* Ink */
  --ink:         #0a0a0a;      /* primary text + primary button fill */
  --ink-2:       #575757;      /* secondary text, labels */
  --ink-3:       #8e8e8e;      /* tertiary, placeholders, disabled */

  /* Risk — the ONLY colour in the product. Never used decoratively. */
  --risk-high:   #b42318;
  --risk-mid:    #b54708;
  --risk-low:    #067647;
  --risk-high-bg:#fef3f2;
  --risk-mid-bg: #fffaeb;
  --risk-low-bg: #ecfdf3;

  /* Focus */
  --focus:       #0a0a0a;

  /* Geometry */
  --r-sm: 6px;  --r-md: 10px;  --r-lg: 14px;
  --sp-1: 4px;  --sp-2: 8px;   --sp-3: 12px;  --sp-4: 16px;  --sp-5: 24px;
}
```

**Delete on sight:** every `linear-gradient(`, `--accent`, `--accent2`, `#5b5bd6`, `#0ea5e9`, `#6366f1`, `#eef0fb`, and all inline hex in `popup.js` (MNT-6).

### B2. Typography

Libre Baskerville is a display serif and is currently used down to 8.5 px. Split the roles — this keeps the editorial character where it reads, and restores legibility in the chrome:

```css
--font-ui:   system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
--font-read: "Libre Baskerville", Georgia, serif;
```

- `--font-ui` → tabs, buttons, labels, badges, meta, inputs, settings.
- `--font-read` → analysis summary, chat messages, quiz question + options, document results. The *content the user is there to read*.

Scale (UI): 11 / 12 / 13 / 15 px only. **Nothing below 11 px.** Retire the 8.5 px and 9 px sizes entirely.
Scale (Read): 13 / 14 px, `line-height: 1.6`.

**Self-host the font** (SEC-9): download `LibreBaskerville-Regular/Bold/Italic.woff2` into `src/assets/fonts/`, declare `@font-face` locally, and delete the three `<link>` tags. If the team prefers zero font weight, dropping to `--font-ui` everywhere is acceptable — but that is a product call, not a technical one.

### B3. Components

| Component | Spec |
|---|---|
| **Primary button** | `background: var(--ink)`, `color:#fff`, `border:1px solid var(--ink)`, `height:36px`, `radius: var(--r-sm)`, font-ui 13px/600. Hover `#1f1f1f`. Exactly **one per screen**. |
| **Secondary button** | `background:#fff`, `color: var(--ink)`, `border:1px solid var(--line-strong)`. Hover `background: var(--surface-sunken)`. |
| **Quiet/tertiary** | text-only, `color: var(--ink-2)`, underline on hover. Use for "Full report", "Show raw text". |
| **Icon button** | 32×32, transparent, `color: var(--ink-2)`, hover `background: var(--surface-sunken)`. |
| **Card** | `border:1px solid var(--line)`, `radius: var(--r-lg)`, `padding: var(--sp-3)`. No shadow. |
| **Inset block** | `background: var(--surface-sunken)`, `radius: var(--r-md)`, no border. |
| **Focus ring** | `outline: 2px solid var(--focus); outline-offset: 2px` on `:focus-visible` **for every interactive element**. Never `outline:none` without a replacement. |
| **Avatar** | solid `var(--ink)` circle, white initials. No gradient. |
| **Toggle** | off `#e7e7e7`; on `var(--ink)`. No gradient. |

### B4. Risk expression (replaces the two rings)

Never colour-only. Every risk state carries **glyph + word + number**:

| Band | Glyph | Word | Colour |
|---|---|---|---|
| 0–39 | `▲` filled-low / check | **Looks routine** | `--risk-low` |
| 40–74 | `▲` half | **Review carefully** | `--risk-mid` |
| 75–100 | `▲` full | **High risk** | `--risk-high` |

Render as a single **verdict bar**: a full-width 4 px track with the score marked, the word in 15 px semibold, and the number as `72/100` secondary. State the direction explicitly in the label — `Risk 72/100 (higher = riskier)` — or use words alone.

Reputation becomes a secondary one-liner (`Site trust: Mixed · 45/100`), not a second ring.

---

## PART C — Information architecture

### C1. Shell (fixes UX-1 and UX-3 — the "hanging" bug)

The popup becomes a **fixed-height flex column**: header and tabs pinned, exactly one scroll region.

```css
html, body { height: 600px; }          /* Chrome's popup ceiling */
body { width: 380px; margin: 0; display: flex; flex-direction: column; overflow: hidden; }
.topbar, .tabs { flex: 0 0 auto; }
.body        { flex: 1 1 auto; min-height: 0; overflow-y: auto; }
.tab-panel            { display: none; }
.tab-panel.active     { display: flex; flex-direction: column; gap: var(--sp-3); min-height: 100%; }
```

`min-height: 100%` + `flex` on the active panel is what lets short panels claim the full height instead of collapsing to content.

### C2. Chat panel (the specific "send hanging above" fix)

The message log must absorb the slack and the composer must sit on the floor:

```css
[data-panel="chat"].active { height: 100%; }
#chat-section     { display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0; }
.chat-window      { flex: 1 1 auto; min-height: 0; max-height: none; overflow-y: auto; }
.chat-input-row   { flex: 0 0 auto; }
```

Delete `max-height: 168px` from `.chat-window` — that fixed cap is what prevents it from growing.

### C3. Splitting the Scan tab (fixes UX-2)

Keep **4 tabs** — a fifth does not fit at 380 px. Instead make Scan *verdict-first* with progressive disclosure. Target: ~360 px above the fold, everything else one tap away.

```
┌────────────────────────────────────────┐
│ ● ConsentWise                     (AC) │  topbar        56px  [pinned]
├────────────────────────────────────────┤
│  Scan   │  Chat  │  Quiz  │  Document  │  tabs          36px  [pinned]
├════════════════════════════════════════┤  ← scroll starts here
│                                        │
│  ┌──────────────────────────────────┐  │
│  │ ▲ Review carefully               │  │  VERDICT CARD  ~120px
│  │ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │  │  • band word (15px)
│  │ Risk 72/100 · higher = riskier   │  │  • score bar
│  │ Site trust: Mixed · 45/100       │  │  • trust one-liner
│  │ example.com · 2 min ago          │  │  • source + freshness
│  └──────────────────────────────────┘  │
│                                        │
│  [    Analyze this page    ]           │  ONE primary     36px
│                                        │
│  ┌──────────────────────────────────┐  │
│  │ Summary                    ⏵ Listen │ SUMMARY        ~130px
│  │ This agreement auto-renews …     │  │  3 lines clamped
│  │ Show more                        │  │  + expand
│  └──────────────────────────────────┘  │
│                                        │
│  ▸ What we found            (3)        │  ACCORDIONS    3 × 40px
│  ▸ Site reputation                     │  collapsed by default
│  ▸ Login safety            Caution     │
│                                        │
│  Open full report ↗                    │  quiet link
└────────────────────────────────────────┘
```

Rules:
- **Verdict card is the only thing guaranteed above the fold.**
- Accordions (`<details>`/`<summary>`, native, zero JS) hold key points, reputation prose + examples, and login guidance. Collapsed by default; remember the last-opened one in `chrome.storage.local`.
- "Open full report" (the backend dashboard) becomes a quiet text link, not a competing gradient button (fixes UX-12).
- **Pre-scan state:** verdict card renders a neutral "Not scanned yet" with the score bar empty and accordions hidden. No sentence may assert a finding before an analysis exists (fixes UX-6).

### C4. Other panels

- **Quiz** — progress (`2 / 5`) pinned top; question and options centred in the free space; Next pinned bottom. Same flex-fill treatment as Chat.
- **Document** — drop zone centred vertically when empty; after analysis, results replace it and the drop zone collapses to a compact "Replace file" row.
- **Profile & Settings** — unchanged in structure; restyle to tokens; add **"Your data"** (see D5).

---

## PART D — Screen specs

### D1. Top bar
Brand mark (16 px black glyph) + wordmark 13 px/700 left; avatar button right. Hairline bottom border. Height 56 px, pinned.

### D2. Tab strip
`role="tablist"`, each tab `role="tab"` + `aria-selected` + `aria-controls`, panels `role="tabpanel"`. Roving tabindex with ←/→ arrow support (fixes UX-11). Active tab = `--ink` text + 2 px `--ink` underline. Inactive = `--ink-3`. Pinned.

### D3. Verdict card
Structure: band word · score track · direction hint · trust line · source line. Score track is a 4 px `--line` rail with a filled segment in the band colour and a 2 px black tick at the score position. Announce with `aria-live="polite"` on completion.

### D4. Errors and progress (fixes UX-5, UX-9)
- Delete all three `alert()` calls. Introduce a **single inline banner** slot at the top of the active panel: `role="status"`, one line, dismissible, `--risk-*-bg` background.
- Analysis in flight: verdict card shows a shimmer skeleton, primary button becomes **"Cancel"** wired to an `AbortController` (also satisfies SEC-12).

### D5. Profile panel — "Your data" section (fixes SEC-7)
Add above Log out:
- Device ID (first 8 chars, monospace) + **Copy** + **Reset ID** (issues a fresh UUID).
- **What we send** — plain-language: *"When you analyze a page, its text, title and address are sent to the ConsentWise backend and processed by an AI model."*
- **Download my data** / **Delete my data** → `GET`/`DELETE` on `/api/users/{client_id}`.

---

## PART E — File restructure

```
src/
  assets/fonts/              ← self-hosted woff2 (SEC-9)
  styles/
    tokens.css               ← B1
    base.css                 ← reset, focus rings, typography
    components.css           ← buttons, cards, badges, toggle, accordion
    popup.css                ← popup layout only
    overlay.css              ← content-script overlay (imports tokens)
  popup/
    popup.html               ← markup only, zero inline <style>
    main.js                  ← bootstrap + wiring
    state.js                 ← storage schema, STORAGE_KEYS, load/save/migrate (MNT-8)
    api.js                   ← every fetch, with AbortController + timeout (SEC-12)
    ui/
      tabs.js  verdict.js  summary.js  chat.js  quiz.js  upload.js
      profile.js  banner.js  skeleton.js
  content/
    content.js               ← orchestration only
    detect.js                ← detection rules (BUG-2, BUG-9)
    overlay.js               ← DOM building (no innerHTML)
  background/service-worker.js
  offscreen/
  config/config.js  i18n/
```

- **Delete `src/demo/` entirely** (MNT-5).
- Add `scripts/check-i18n.mjs` — fails if any locale is missing a key present in `en-IN` (MNT-3). Wire into a `npm run check` script.
- Extension has no build step; keep it that way. Use classic scripts loaded in order, as today — the split is for humans, not bundling.

---

## PART F — Execution phases

Each phase is independently shippable. **Do not reorder — Phase 0 must land first.**

### Phase 0 — Trust & correctness (no visual change)

1. **BUG-1** Delete the duplicate listener registrations at `popup.js:1011-1012`. *Verify:* one click ⇒ exactly one `POST /api/extension/analyze` in DevTools Network.
2. **SEC-3** Make Protection real. `content.js` reads `protectionEnabled` before arming any interceptor and subscribes to `chrome.storage.onChanged` to arm/disarm live. *Verify:* toggle off ⇒ clicking an "I agree" checkbox does nothing.
3. **SEC-1** Replace the overlay disclaimer with the truth: *"Page text is sent to ConsentWise and analyzed by an AI model. Nothing is stored on this site."* (adjust to what the backend actually does).
4. **SEC-2** Gate the upload. The overlay's primary button becomes explicit consent: *"Send page text for analysis"*. Add a "Don't ask again for this site" option persisted per-origin.
5. **SEC-4** Validate `openTab`: accept only URLs whose origin equals `ConsentWise.BACKEND_URL`'s origin. Reject and log otherwise.
6. **SEC-6** Remove the `web_accessible_resources` block from `manifest.json`. *Verify:* STT still works end-to-end.
7. **SEC-5** Add sender checks (`sender.id === chrome.runtime.id`) to all three message listeners.
8. **BUG-3** Compare quiz state against an index, not `textContent`.
9. **BUG-4** Track highlighted elements and restore their previous inline styles when the overlay closes.
10. **BUG-7** Move `lastAnalysisTabId` to `chrome.storage.session`.
11. **SEC-12** Wrap every `fetch` in a 30 s `AbortController` timeout.
12. **MNT-9/10** Strip `console.log` from shipping paths (keep `console.warn`/`error`); delete `// hello`.

**Exit criteria:** analyze fires once; protection toggle observably works; no false privacy claim; `offscreen.html` not reachable from a web page.

### Phase 1 — Shell (fixes the "hanging" complaint)

13. Apply **C1** shell CSS and **C2** chat flex rules. Delete `.chat-window { max-height: 168px }`.
14. Make `.topbar` + `.tabs` non-scrolling; `.body` is the sole scroll container.

**Exit criteria:** at 380×600, the tab strip is visible at every scroll position of every tab; the Chat composer sits at the bottom edge with no dead space; nothing below 600 px is clipped without a scrollbar.

### Phase 2 — Design system

15. Extract all inline CSS into `src/styles/*` (**MNT-2**); add `tokens.css` (**B1**).
16. Remove every gradient and legacy accent hex, including the inline hex in `popup.js` quiz rendering (**MNT-6**).
17. Apply the typography split (**B2**), self-host fonts, delete Google Fonts links (**SEC-9**).
18. Add `:focus-visible` rings everywhere (**UX-11**).

**Exit criteria:** `grep -rn "linear-gradient\|#5b5bd6\|#0ea5e9\|#6366f1" src/` returns nothing. Every interactive element shows a visible focus ring on Tab.

### Phase 3 — Scan redesign

19. Build the verdict card (**D3**) and delete the two-ring `.meters` block (**UX-4**).
20. Move key points / reputation / login safety into native `<details>` accordions (**C3**).
21. Correct the pre-scan empty states (**UX-6**).
22. Demote "Open full report" to a quiet link; leave exactly one primary button (**UX-12**).

**Exit criteria:** the Scan panel is **≤ 400 px** before any accordion is expanded (measure the same way as A3). The verdict word and direction hint are readable without interpreting colour.

### Phase 4 — Chat / Quiz / Document

23. Inline banner replaces all `alert()` (**UX-5**); skeleton + Cancel for in-flight analysis (**UX-9**).
24. Chat: auto-growing textarea, `keydown` with Enter-to-send / Shift+Enter newline, scroll-to-bottom pill, retry on failed turn (**UX-10**); cap `chatHistory` at the last 8 turns (**BUG-8**).
25. Quiz: pinned progress + pinned Next; token-driven answer states.
26. Document: vertically centred empty state; compact "Replace file" after upload.

### Phase 5 — Maintainability & i18n

27. Split `popup.js` per **PART E** (**MNT-1**).
28. Route every remaining hardcoded string through i18n (**MNT-4**), then backfill the **17 missing keys × 9 locales** (**UX-7**) and add `scripts/check-i18n.mjs` (**MNT-3**).
29. Delete `src/demo/` (**MNT-5**); unify the two extractors (**MNT-7**); centralise storage keys (**MNT-8**).
30. **BUG-2** Rewrite detection: word-boundary matching, a deny-list for common false positives (cookie banners, `[aria-label*="cookie"]`), require a nearby agreement signal for generic verbs like "continue", and prefer a non-blocking inline nudge over capture-phase `preventDefault()`. **BUG-9** Debounce the observer (~250 ms) and stop reading `innerText` during detection.

### Phase 6 — Pre-release (separate track)

31. **SEC-8** HTTPS backend + build-time environment config.
32. **SEC-10** Narrow permissions: drop `content_scripts` on `<all_urls>` in favour of `activeTab` + `optional_host_permissions`, requesting access per-site on first use.

---

## Appendix 1 — Measured baseline

Re-measure after each phase with the same method (headless Chrome, 372 px viewport, `getBoundingClientRect`).

| Element | Now | Target |
|---|---|---|
| Document height | 909 px | ≤ 600 px (single scroll region) |
| Scan panel | 792 px | ≤ 400 px collapsed |
| `.meters` | 208 px | 0 (replaced by ~120 px verdict card) |
| Chat content bottom | y = 262 | composer flush to y ≈ 588 |
| Tab strip visible while scrolled | ✗ | ✓ |

## Appendix 2 — i18n parity

`en-IN` = 85 keys. All 9 other locales = 68 keys. Missing in every one:

```
tabScan · tabChat · tabQuiz · tabDoc · analyzeFirstHint
getStarted · welcomeTitle · welcomeDesc
profileTitle · personalDetails · interestsLabel · settingsLabel
saveProfile · logOut · logoutConfirm · namePlaceholder · emailPlaceholder
```

## Appendix 3 — Explicit non-goals

- No framework, no bundler, no TypeScript. Classic scripts, ordered `<script>` tags.
- No change to any backend endpoint contract.
- Dark mode is out of scope (the brief is white-and-black light).
