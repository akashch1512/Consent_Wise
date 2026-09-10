"use strict";

/**
 * ConsentWise AI — detection rules
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure, side-effect-free classifiers. Loaded before content.js.
 *
 * The old rule ("does the button text contain 'continue' / 'accept' / 'pay'")
 * fired on cookie banners, wizards and unrelated buttons and then blocked the
 * click in the capture phase — breaking host sites. This version:
 *   • matches whole words, not substrings
 *   • denies a list of known false positives (cookie/newsletter/search UI)
 *   • only treats a generic verb ("continue", "proceed") as consent when there
 *     is an agreement signal nearby ("terms", "privacy policy", a checkbox…)
 *
 * Exposed as `globalThis.ConsentWiseDetect`.
 * ─────────────────────────────────────────────────────────────────────────────
 */
(function attachDetect(root) {
  // Strong, unambiguous consent phrases — a match here is enough on its own.
  const STRONG_PHRASES = [
    "i agree", "i accept", "agree and continue", "accept and continue",
    "accept terms", "agree to terms", "accept all terms", "authorize payment",
    "authorise payment", "confirm payment", "place order", "complete purchase",
    "subscribe now", "start subscription", "start free trial", "confirm and pay",
    "pay now", "pay $", "agree & join", "accept & join",
  ];

  // Generic verbs — consent only when an agreement signal sits nearby.
  const WEAK_WORDS = ["continue", "proceed", "confirm", "next", "agree", "accept", "authorize", "authorise", "submit"];

  // Words that mean "this is NOT a consent action".
  const DENY_WORDS = [
    "cookie", "cookies", "consent preferences", "manage preferences", "reject",
    "decline", "deny", "newsletter", "subscribe to our", "search", "filter",
    "sort", "menu", "close", "cancel", "back", "skip", "not now", "maybe later",
    "learn more", "read more", "settings", "log out", "sign out",
  ];

  const AGREEMENT_SIGNALS = [
    "terms", "conditions", "privacy policy", "privacy notice", "consent",
    "authorization", "authorisation", "e-sign", "electronic signature",
    "recurring", "auto-renew", "autopay", "mandate", "i have read",
  ];

  const norm = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
  const hasWord = (text, word) =>
    new RegExp(`(^|[^a-z])${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`, "i").test(text);
  const hasAny = (text, list) => list.some((w) => (w.includes(" ") ? text.includes(w) : hasWord(text, w)));

  /** Text around an element: its own label + up to 2 ancestors, capped. */
  function nearbyText(el) {
    const bits = [
      el.getAttribute && el.getAttribute("aria-label"),
      el.getAttribute && el.getAttribute("name"),
      el.getAttribute && el.getAttribute("title"),
      el.textContent,
      el.value,
    ];
    let node = el.parentElement;
    for (let i = 0; i < 2 && node; i++, node = node.parentElement) {
      // textContent (not innerText) — no forced layout
      bits.push(node.getAttribute && node.getAttribute("aria-label"));
      bits.push(node.textContent);
    }
    return norm(bits.filter(Boolean).join(" ")).slice(0, 600);
  }

  function labelForCheckbox(cb) {
    const bits = [cb.getAttribute("aria-label")];
    if (cb.id) {
      const lbl = document.querySelector(`label[for="${CSS.escape(cb.id)}"]`);
      if (lbl) bits.push(lbl.textContent);
    }
    const wrap = cb.closest("label");
    if (wrap) bits.push(wrap.textContent);
    bits.push(nearbyText(cb));
    return norm(bits.filter(Boolean).join(" ")).slice(0, 600);
  }

  /** @returns {"consent"|"payment"|null} */
  function classifyButton(btn) {
    const own = norm((btn.innerText || btn.textContent || btn.value || btn.getAttribute("aria-label") || ""));
    if (!own || own.length > 120) return null;
    if (hasAny(own, DENY_WORDS)) return null;

    if (STRONG_PHRASES.some((p) => own.includes(p))) {
      return /pay|purchase|order|subscri|trial|\$|₹/.test(own) ? "payment" : "consent";
    }

    if (hasAny(own, WEAK_WORDS)) {
      const context = nearbyText(btn);
      if (hasAny(context, AGREEMENT_SIGNALS)) return "consent";
    }
    return null;
  }

  /** @returns {boolean} true if this checkbox is an agreement checkbox */
  function isAgreementCheckbox(cb) {
    const label = labelForCheckbox(cb);
    if (!label || hasAny(label, DENY_WORDS)) return false;
    return hasAny(label, AGREEMENT_SIGNALS) || /\bi\s+(agree|accept|consent|authoris?e)\b/.test(label);
  }

  root.ConsentWiseDetect = { classifyButton, isAgreementCheckbox };
})(typeof globalThis !== "undefined" ? globalThis : self);
