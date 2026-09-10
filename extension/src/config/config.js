"use strict";

/**
 * ConsentWise AI — shared configuration
 * ─────────────────────────────────────────────────────────────────────────────
 * Single source of truth for backend wiring. Loaded first in every context:
 *   • popup / offscreen → <script src="../config/config.js"> before the page script
 *   • content script   → manifest "js": ["src/config/config.js", ...]
 *
 * Everything hangs off `globalThis.ConsentWise` so it is reachable the same way
 * from a worker, a page, or a content script's isolated world.
 * ─────────────────────────────────────────────────────────────────────────────
 */
(function attachConfig(root) {
  const BACKEND_URL = "http://localhost:8000";
  const WEB_APP_URL = "http://localhost:3000";

  root.ConsentWise = {
    BACKEND_URL,
    WEB_APP_URL,

    /** Origins the extension must never intercept (its own app + API server). */
    TRUSTED_ORIGINS: [
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "http://localhost:8000",
      "http://127.0.0.1:8000",
    ],

    /** Fully-qualified backend endpoints — see backend/README.md. */
    API: {
      analyze: `${BACKEND_URL}/api/extension/analyze`,
      extensionConfig: `${BACKEND_URL}/api/extension/config`,
      dashboard: `${BACKEND_URL}/dashboard`,
      chat: `${BACKEND_URL}/api/chat`,
      tts: `${BACKEND_URL}/api/tts`,
      quiz: `${BACKEND_URL}/api/generate-quiz`,
      analyzeDocument: `${BACKEND_URL}/api/analyze-document`,
      stt: `${BACKEND_URL}/api/stt`,
      users: `${BACKEND_URL}/api/users`,
    },
  };
})(typeof globalThis !== "undefined" ? globalThis : self);
