/**
 * ConsentWise AI — content script (orchestration)
 * ─────────────────────────────────────────────────────────────────────────────
 * Runs on every page. Watches for genuine consent / payment actions, and — only
 * when Protection is on — interrupts them with an overlay that asks the user
 * whether to send the page text for analysis.
 *
 * Detection rules live in detect.js. Backend wiring in config.js.
 * ─────────────────────────────────────────────────────────────────────────────
 */
(function () {
  "use strict";

  if (window.__ConsentWiseInitialized) return;
  window.__ConsentWiseInitialized = true;

  const { WEB_APP_URL, API, TRUSTED_ORIGINS } = ConsentWise;
  const { classifyButton, isAgreementCheckbox } = ConsentWiseDetect;

  const MAX_CONTENT_LENGTH = 5000;
  const FETCH_TIMEOUT_MS = 30000;
  const EXTENSION_ID = chrome.runtime.id;
  const ORIGIN = location.origin;

  if (TRUSTED_ORIGINS.includes(ORIGIN)) return;

  let protectionEnabled = true;
  let scanScheduled = 0;
  const restyled = new WeakMap(); // el -> { outline, boxShadow, transition } to restore

  // ── Protection state (SEC-3: the toggle is now real) ──────────────────────
  chrome.storage.local.get(["protectionEnabled"], (data) => {
    protectionEnabled = data.protectionEnabled !== false;
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.protectionEnabled) {
      protectionEnabled = changes.protectionEnabled.newValue !== false;
    }
  });

  function skipThisSite() {
    return new Promise((resolve) => {
      chrome.storage.local.get(["consentWiseSkipOrigins"], (d) => {
        resolve(Array.isArray(d.consentWiseSkipOrigins) && d.consentWiseSkipOrigins.includes(ORIGIN));
      });
    });
  }
  function rememberSkipThisSite() {
    chrome.storage.local.get(["consentWiseSkipOrigins"], (d) => {
      const list = new Set(Array.isArray(d.consentWiseSkipOrigins) ? d.consentWiseSkipOrigins : []);
      list.add(ORIGIN);
      chrome.storage.local.set({ consentWiseSkipOrigins: [...list] });
    });
  }

  // ── Page text extraction (single implementation — MNT-7) ──────────────────
  function extractPolicyText() {
    const seen = new Set();
    const chunks = [];
    const KEYWORDS = ["terms", "privacy", "conditions", "consent", "authorize", "authorization", "policy"];
    const selector = "main,article,section,form,dialog,[role='dialog'],.terms,.privacy,.policy,#terms,#privacy,#policy";

    document.querySelectorAll(selector).forEach((node) => {
      const text = (node.innerText || "").trim();
      if (text.length < 120) return;
      const lower = text.toLowerCase();
      if (!KEYWORDS.some((k) => lower.includes(k))) return;
      if (seen.has(text)) return;
      seen.add(text);
      chunks.push(text);
    });

    const body = chunks.length
      ? chunks.join("\n\n")
      : (document.body ? document.body.innerText : "");
    return body.slice(0, MAX_CONTENT_LENGTH).trim();
  }

  function fetchWithTimeout(url, options) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    return fetch(url, { ...options, signal: ctrl.signal }).finally(() => clearTimeout(timer));
  }

  function bumpCounter(key) {
    chrome.storage.local.get([key], (d) => {
      chrome.storage.local.set({ [key]: (typeof d[key] === "number" ? d[key] : 0) + 1 });
    });
  }

  function openAnalysisTab(url) {
    chrome.runtime.sendMessage({ action: "openTab", url }, (res) => {
      if (chrome.runtime.lastError && !(res && res.success)) {
        // Background could not open it — as a last resort open here.
        window.open(url, "_blank", "noopener");
      }
    });
  }

  async function sendForAnalysis() {
    const text = extractPolicyText();
    try {
      const clientId = await ConsentWiseIdentity.getClientId().catch(() => null);
      const response = await fetchWithTimeout(API.analyze, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          title: document.title || "",
          url: location.href,
          source: "intercept-flow",
          client_id: clientId,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.dashboard_url) {
        throw new Error(data.detail || "No dashboard URL returned.");
      }
      bumpCounter("tabsOpened");
      openAnalysisTab(data.dashboard_url);
      return;
    } catch (err) {
      console.warn("[ConsentWise] Analysis failed:", err && err.message);
    }
    openAnalysisTab(API.dashboard || WEB_APP_URL);
  }

  // ── Highlight (BUG-4: restore host-page styles on close) ──────────────────
  const highlighted = [];
  function highlight(el) {
    if (!restyled.has(el)) {
      restyled.set(el, {
        outline: el.style.outline,
        boxShadow: el.style.boxShadow,
        transition: el.style.transition,
      });
    }
    el.style.transition = "box-shadow .2s ease, outline .2s ease";
    el.style.outline = "2px solid #b42318";
    el.style.boxShadow = "0 0 0 3px rgba(180,35,24,.18)";
    highlighted.push(el);
  }
  function clearHighlights() {
    highlighted.forEach((el) => {
      const prev = restyled.get(el);
      if (!prev) return;
      el.style.outline = prev.outline;
      el.style.boxShadow = prev.boxShadow;
      el.style.transition = prev.transition;
    });
    highlighted.length = 0;
  }

  // ── Overlay (SEC-1/SEC-2: honest, explicit consent) ──────────────────────
  function buildOverlay({ onConfirm }) {
    const overlay = document.createElement("div");
    overlay.id = "cw-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "cw-title");

    const card = document.createElement("div");
    card.id = "cw-card";

    const h = document.createElement("h2");
    h.id = "cw-title";
    h.textContent = "Review before you agree";

    const p = document.createElement("p");
    p.id = "cw-body";
    p.textContent =
      "This looks like a consent or payment action. ConsentWise can read the visible " +
      "text on this page and send it to the ConsentWise backend, where an AI model " +
      "summarises the risks. The page text and address are sent for this check; nothing " +
      "is stored on this site.";

    const actions = document.createElement("div");
    actions.id = "cw-actions";

    const confirm = document.createElement("button");
    confirm.id = "cw-confirm";
    confirm.className = "cw-btn cw-btn-primary";
    confirm.textContent = "Send page text for analysis";

    const cancel = document.createElement("button");
    cancel.id = "cw-cancel";
    cancel.className = "cw-btn cw-btn-ghost";
    cancel.textContent = "Not now";

    const skipRow = document.createElement("label");
    skipRow.id = "cw-skip";
    const skipBox = document.createElement("input");
    skipBox.type = "checkbox";
    skipBox.id = "cw-skip-box";
    const skipText = document.createElement("span");
    skipText.textContent = "Don't ask again on this site";
    skipRow.append(skipBox, skipText);

    actions.append(confirm, cancel);
    card.append(h, p, actions, skipRow);
    overlay.append(card);

    function close() {
      overlay.classList.add("cw-out");
      setTimeout(() => overlay.remove(), 180);
      document.removeEventListener("keydown", onKey);
      clearHighlights();
    }
    function onKey(e) {
      if (e.key === "Escape") close();
    }

    confirm.addEventListener("click", () => {
      if (skipBox.checked) rememberSkipThisSite();
      close();
      onConfirm();
    });
    cancel.addEventListener("click", () => {
      if (skipBox.checked) rememberSkipThisSite();
      close();
    });
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });
    document.addEventListener("keydown", onKey);

    document.body.appendChild(overlay);
    confirm.focus();
  }

  async function intercept(el) {
    if (!protectionEnabled) return;
    if (await skipThisSite()) return;
    highlight(el);
    bumpCounter("interceptCount");
    buildOverlay({ onConfirm: sendForAnalysis });
  }

  // ── Wiring interceptors ──────────────────────────────────────────────────
  const WIRED = "__cwWired";

  function wireCheckbox(cb) {
    if (cb[WIRED] || !isAgreementCheckbox(cb)) return;
    cb[WIRED] = true;
    cb.addEventListener("change", function (e) {
      if (!cb.checked || !protectionEnabled) return;
      e.preventDefault();
      cb.checked = false;
      intercept(cb);
    });
  }

  function wireButton(btn) {
    if (btn[WIRED]) return;
    const kind = classifyButton(btn);
    if (!kind) return;
    btn[WIRED] = true;
    btn.addEventListener(
      "click",
      function (e) {
        if (!protectionEnabled) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        intercept(btn);
      },
      true
    );
  }

  function scan(rootNode) {
    const scope = rootNode && rootNode.querySelectorAll ? rootNode : document;
    scope.querySelectorAll('input[type="checkbox"]').forEach(wireCheckbox);
    scope
      .querySelectorAll('button, input[type="submit"], input[type="button"], a[role="button"], [role="button"]')
      .forEach(wireButton);
  }

  function scheduleScan(node) {
    if (scanScheduled) return;
    scanScheduled = requestIdleCallback
      ? requestIdleCallback(() => { scanScheduled = 0; scan(node); }, { timeout: 400 })
      : setTimeout(() => { scanScheduled = 0; scan(node); }, 250);
  }

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.addedNodes && m.addedNodes.length) { scheduleScan(document); break; }
    }
  });

  // ── Messages (SEC-5: only our own extension) ──────────────────────────────
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!sender || sender.id !== EXTENSION_ID) return;
    if (message.action === "ping") {
      sendResponse({ status: "alive" });
      return false;
    }
    if (message.action === "getPolicyText") {
      sendResponse({ text: extractPolicyText(), url: location.href, title: document.title || "" });
      return false;
    }
    return false;
  });

  function start() {
    scan(document);
    observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
    // Two follow-up scans catch late SPA renders without a permanent observer cost.
    setTimeout(() => scan(document), 1500);
    setTimeout(() => scan(document), 4000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }

  window.addEventListener("pagehide", () => observer.disconnect(), { once: true });
})();
