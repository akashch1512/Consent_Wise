"use strict";

/**
 * ConsentWise AI — popup network layer
 * ─────────────────────────────────────────────────────────────────────────────
 * Every backend call goes through here. Each request has a 30s timeout and can
 * be cancelled by passing an AbortSignal (SEC-12). Exposed as `globalThis.CWApi`.
 * ─────────────────────────────────────────────────────────────────────────────
 */
(function (root) {
  const { API } = ConsentWise;
  const TIMEOUT_MS = 30000;

  function request(url, options = {}, { timeout = TIMEOUT_MS, signal } = {}) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(new DOMException("Timed out", "TimeoutError")), timeout);
    if (signal) {
      if (signal.aborted) ctrl.abort(signal.reason);
      else signal.addEventListener("abort", () => ctrl.abort(signal.reason), { once: true });
    }
    return fetch(url, { ...options, signal: ctrl.signal }).finally(() => clearTimeout(timer));
  }

  async function json(url, options, opts) {
    const res = await request(url, options, opts);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(body.detail || `Request failed (${res.status})`);
      err.status = res.status;
      throw err;
    }
    return body;
  }

  const jsonPost = (url, payload, opts) =>
    json(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }, opts);

  root.CWApi = {
    analyzePage: (payload, opts) => jsonPost(API.analyze, payload, opts),
    chat: (payload, opts) => jsonPost(API.chat, payload, opts),
    quiz: (payload, opts) => jsonPost(API.quiz, payload, opts),
    tts: (payload, opts) => jsonPost(API.tts, payload, opts),
    analyzeDocument: (formData, opts) => json(API.analyzeDocument, { method: "POST", body: formData }, opts),
    getUser: (id, opts) => json(`${API.users}/${encodeURIComponent(id)}`, undefined, opts),
    deleteUser: (id, opts) => request(`${API.users}/${encodeURIComponent(id)}`, { method: "DELETE" }, opts),
    isAbort: (err) => err && (err.name === "AbortError" || err.name === "TimeoutError"),
  };
})(typeof globalThis !== "undefined" ? globalThis : self);
