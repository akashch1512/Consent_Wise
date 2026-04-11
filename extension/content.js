/**
 * ConsentGuard AI — content.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Injected into every page. Responsible for:
 *   1. Detecting financial-consent checkboxes and intercepting them
 *   2. Detecting consent/payment buttons and intercepting their clicks
 *   3. Showing a premium animated overlay
 *   4. Extracting page content and forwarding it to the web app
 * ─────────────────────────────────────────────────────────────────────────────
 */

(function () {
  "use strict";

  // ─── Config ────────────────────────────────────────────────────────────────
  const WEB_APP_URL = "http://localhost:3000";
  const MAX_CONTENT_LENGTH = 5000;
  const POLICY_KEYWORDS = ["terms", "privacy", "conditions", "consent", "authorize", "authorization", "policy"];

  /** Keywords that flag a button as a consent / payment trigger */
  const BUTTON_KEYWORDS = ["agree", "pay", "proceed", "continue", "accept", "confirm", "subscribe", "buy now"];

  /** Keywords that flag nearby label/text as agreement-related */
  const AGREEMENT_KEYWORDS = ["agree", "terms", "conditions", "consent", "authorize", "policy", "accept"];

  // ─── Guard: run only once ──────────────────────────────────────────────────
  if (window.__consentGuardInitialized) return;
  window.__consentGuardInitialized = true;

  console.log("[ConsentGuard AI] 🛡️  Initialised on:", window.location.href);

  // ─── Utility: extract & truncate page text ─────────────────────────────────
  function extractPageContent() {
    const raw = document.body ? document.body.innerText : "";
    return raw.slice(0, MAX_CONTENT_LENGTH).trim();
  }

  function extractPolicyContent() {
    const seen = new Set();
    const chunks = [];
    const selector = [
      "main",
      "article",
      "section",
      "form",
      "dialog",
      "[role='dialog']",
      ".terms",
      ".privacy",
      ".policy",
      "#terms",
      "#privacy",
      "#policy",
    ].join(", ");

    document.querySelectorAll(selector).forEach((node) => {
      const text = (node.innerText || "").trim();
      const lowerText = text.toLowerCase();
      if (!text || text.length < 120) return;
      if (!POLICY_KEYWORDS.some((keyword) => lowerText.includes(keyword))) return;
      if (seen.has(text)) return;
      seen.add(text);
      chunks.push(text);
    });

    if (!chunks.length) {
      const pageText = extractPageContent();
      return pageText.slice(0, MAX_CONTENT_LENGTH);
    }

    return chunks.join("\n\n").slice(0, MAX_CONTENT_LENGTH);
  }

  // ─── Utility: open web-app with encoded content ────────────────────────────
  function redirectToWebApp(extractedText) {
    const encoded = encodeURIComponent(extractedText);
    const targetURL = `${WEB_APP_URL}?data=${encoded}`;
    console.log("[ConsentGuard AI] 🔀 Redirecting to web app:", targetURL.slice(0, 120) + "…");

    chrome.runtime.sendMessage(
      { action: "openTab", url: targetURL },
      (response) => {
        if (chrome.runtime.lastError) {
          console.warn("[ConsentGuard AI] Runtime error:", chrome.runtime.lastError.message);
          // Fallback: open directly
          window.open(targetURL, "_blank");
        } else {
          console.log("[ConsentGuard AI] ✅ Tab opened via background:", response);
        }
      }
    );
  }

  // ─── Overlay ───────────────────────────────────────────────────────────────
  function showOverlay(callback) {
    // Remove any stale overlay
    const stale = document.getElementById("cg-overlay");
    if (stale) stale.remove();

    // Build overlay shell
    const overlay = document.createElement("div");
    overlay.id = "cg-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "ConsentGuard AI — financial consent intercepted");

    overlay.innerHTML = `
      <div id="cg-card">

        <!-- Header row -->
        <div id="cg-header">
          <div id="cg-logo">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M14 2L3 7V14C3 19.55 7.84 24.74 14 26C20.16 24.74 25 19.55 25 14V7L14 2Z"
                    fill="url(#shieldGrad)" stroke="rgba(255,255,255,0.3)" stroke-width="0.5"/>
              <path d="M10 14l2.5 2.5L18 11" stroke="white" stroke-width="2"
                    stroke-linecap="round" stroke-linejoin="round"/>
              <defs>
                <linearGradient id="shieldGrad" x1="3" y1="2" x2="25" y2="26" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stop-color="#6C63FF"/>
                  <stop offset="100%" stop-color="#3B82F6"/>
                </linearGradient>
              </defs>
            </svg>
          </div>
          <span id="cg-brand">ConsentGuard <span class="cg-ai">AI</span></span>
          <button id="cg-close" aria-label="Dismiss">&times;</button>
        </div>

        <!-- Spinner -->
        <div id="cg-spinner-wrap">
          <div id="cg-spinner"></div>
          <div id="cg-pulse-ring"></div>
        </div>

        <!-- Text content -->
        <h2 id="cg-title">Analyzing Financial Agreement</h2>
        <p id="cg-message">
          We've intercepted a consent action and are extracting the relevant
          terms before you proceed.
        </p>
        <p id="cg-sub">Ensuring informed &amp; safe consent</p>

        <!-- Stepper -->
        <div id="cg-steps">
          <div class="cg-step active" id="cg-step-1">
            <span class="cg-step-dot"></span>
            <span class="cg-step-label">Detected</span>
          </div>
          <div class="cg-step-line"></div>
          <div class="cg-step" id="cg-step-2">
            <span class="cg-step-dot"></span>
            <span class="cg-step-label">Extracting</span>
          </div>
          <div class="cg-step-line"></div>
          <div class="cg-step" id="cg-step-3">
            <span class="cg-step-dot"></span>
            <span class="cg-step-label">Redirecting</span>
          </div>
        </div>

        <!-- Action buttons -->
        <div id="cg-actions">
          <button id="cg-btn-proceed" class="cg-btn cg-btn-primary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"
                    fill="currentColor" opacity="0.9"/>
            </svg>
            Analyze &amp; Continue Safely
          </button>
          <button id="cg-btn-cancel" class="cg-btn cg-btn-ghost">
            Cancel &amp; Stay Here
          </button>
        </div>

        <!-- Disclaimer -->
        <p id="cg-disclaimer">
          Your data is processed locally. Nothing is sent to external servers.
        </p>
      </div>
    `;

    document.body.appendChild(overlay);

    // Animate steps after small delays
    setTimeout(() => activateStep("cg-step-2"), 800);
    setTimeout(() => activateStep("cg-step-3"), 1600);

    // Wire up buttons
    document.getElementById("cg-btn-proceed").addEventListener("click", () => {
      removeOverlay();
      if (typeof callback === "function") callback();
    });

    document.getElementById("cg-btn-cancel").addEventListener("click", () => {
      removeOverlay();
      console.log("[ConsentGuard AI] User cancelled — no redirect.");
    });

    document.getElementById("cg-close").addEventListener("click", () => {
      removeOverlay();
    });

    // Close on backdrop click
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) removeOverlay();
    });

    // Keyboard close
    document.addEventListener("keydown", handleEscKey);
  }

  function activateStep(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add("active");
  }

  function removeOverlay() {
    const overlay = document.getElementById("cg-overlay");
    if (!overlay) return;
    overlay.classList.add("cg-fade-out");
    setTimeout(() => overlay.remove(), 400);
    document.removeEventListener("keydown", handleEscKey);
  }

  function handleEscKey(e) {
    if (e.key === "Escape") removeOverlay();
  }

  // ─── Highlight helper ──────────────────────────────────────────────────────
  function highlightElement(el) {
    el.style.transition = "box-shadow 0.3s ease, outline 0.3s ease";
    el.style.outline = "2.5px solid #EF4444";
    el.style.boxShadow = "0 0 0 4px rgba(239,68,68,0.25)";
    console.log("[ConsentGuard AI] 🔴 Element highlighted:", el.tagName, el.textContent.slice(0, 40));
  }

  // ─── Check if checkbox is agreement-related ────────────────────────────────
  function isAgreementCheckbox(checkbox) {
    // Look at: label, aria-label, adjacent siblings, parent text (up to 3 levels)
    const sources = [
      checkbox.getAttribute("aria-label") || "",
      checkbox.id ? (document.querySelector(`label[for="${checkbox.id}"]`) || {}).textContent || "" : "",
      checkbox.closest("label") ? checkbox.closest("label").textContent : "",
      checkbox.parentElement ? checkbox.parentElement.innerText : "",
      checkbox.parentElement && checkbox.parentElement.parentElement
        ? checkbox.parentElement.parentElement.innerText
        : "",
    ];

    const combined = sources.join(" ").toLowerCase();
    const matched = AGREEMENT_KEYWORDS.some((kw) => combined.includes(kw));

    if (matched) {
      console.log("[ConsentGuard AI] ☑️  Agreement checkbox detected. Context:", combined.slice(0, 80));
    }
    return matched;
  }

  // ─── Check if button is a consent/payment trigger ─────────────────────────
  function isConsentButton(btn) {
    const text = (btn.innerText || btn.value || btn.getAttribute("aria-label") || "").toLowerCase().trim();
    const matched = BUTTON_KEYWORDS.some((kw) => text.includes(kw));
    if (matched) {
      console.log("[ConsentGuard AI] 🔘 Consent button detected:", text.slice(0, 60));
    }
    return matched;
  }

  // ─── Intercept: checkbox ──────────────────────────────────────────────────
  function attachCheckboxListener(checkbox) {
    if (checkbox.__cgListening) return;
    checkbox.__cgListening = true;

    checkbox.addEventListener("change", function (e) {
      if (!checkbox.checked) return; // Only intercept when user checks it

      // Immediately uncheck
      e.preventDefault();
      checkbox.checked = false;
      highlightElement(checkbox);

      console.log("[ConsentGuard AI] 🚫 Checkbox intercept fired.");

      showOverlay(() => {
        const content = extractPageContent();
        redirectToWebApp(content);
      });
    });
  }

  // ─── Intercept: button ────────────────────────────────────────────────────
  function attachButtonListener(btn) {
    if (btn.__cgListening) return;
    btn.__cgListening = true;

    btn.addEventListener(
      "click",
      function (e) {
        e.preventDefault();
        e.stopImmediatePropagation();
        highlightElement(btn);

        console.log("[ConsentGuard AI] 🚫 Button intercept fired:", btn.innerText.slice(0, 40));

        showOverlay(() => {
          const content = extractPageContent();
          redirectToWebApp(content);
        });
      },
      true // Capture phase — fires before any existing handlers
    );
  }

  // ─── DOM Scanner ──────────────────────────────────────────────────────────
  function scanDOM() {
    // Scan checkboxes
    document.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
      if (isAgreementCheckbox(cb)) attachCheckboxListener(cb);
    });

    // Scan buttons & <a> tags acting as buttons
    const candidates = document.querySelectorAll('button, input[type="submit"], input[type="button"], a[role="button"], [role="button"]');
    candidates.forEach((btn) => {
      if (isConsentButton(btn)) attachButtonListener(btn);
    });
  }

  // ─── MutationObserver: watch for dynamically injected elements ────────────
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;

        // Check the node itself
        if (node.matches && node.matches('input[type="checkbox"]') && isAgreementCheckbox(node)) {
          attachCheckboxListener(node);
        }
        if (node.matches && node.matches('button, input[type="submit"]') && isConsentButton(node)) {
          attachButtonListener(node);
        }

        // Check descendants
        node.querySelectorAll && node.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
          if (isAgreementCheckbox(cb)) attachCheckboxListener(cb);
        });
        node.querySelectorAll && node.querySelectorAll('button, input[type="submit"], input[type="button"]').forEach((btn) => {
          if (isConsentButton(btn)) attachButtonListener(btn);
        });
      }
    }
  });

  observer.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true,
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "ping") {
      sendResponse({ status: "alive" });
      return false;
    }

    if (message.action === "getPolicyText") {
      sendResponse({
        text: extractPolicyContent(),
        url: window.location.href,
        title: document.title || "",
      });
      return false;
    }
  });

  // ─── Initial scan ─────────────────────────────────────────────────────────
  // Wait for DOM to settle, then scan
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scanDOM);
  } else {
    scanDOM();
  }

  // Re-scan after a short delay to catch late-rendered SPA content
  setTimeout(scanDOM, 1500);
  setTimeout(scanDOM, 4000);

  console.log("[ConsentGuard AI] 👁️  Observer active. Watching for consent elements…");
})();
