"use strict";

/**
 * ConsentWise AI — per-user identity + backend profile sync
 * ─────────────────────────────────────────────────────────────────────────────
 * The extension has no login, so each install gets one random `clientId`
 * (a UUID) persisted in chrome.storage.local. That id is what the backend
 * keys durable user data on (profile, analysis history).
 *
 * Convenience/UI state stays in chrome.storage.local; only real user data
 * (name, email, interests, language, history) is sent to the backend.
 *
 * Exposed as `globalThis.ConsentWiseIdentity`; depends on config.js.
 * ─────────────────────────────────────────────────────────────────────────────
 */
(function attachIdentity(root) {
  const STORAGE_KEY = "clientId";
  let cachedId = null;

  function storageGet(key) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get([key], (data) => resolve(data ? data[key] : undefined));
      } catch {
        resolve(undefined);
      }
    });
  }

  function storageSet(entries) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.set(entries, () => resolve());
      } catch {
        resolve();
      }
    });
  }

  function newId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    return `cw-${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
  }

  /** Return this install's stable client id, generating + persisting it once. */
  async function getClientId() {
    if (cachedId) return cachedId;
    let id = await storageGet(STORAGE_KEY);
    if (!id) {
      id = newId();
      await storageSet({ [STORAGE_KEY]: id });
    }
    cachedId = id;
    return id;
  }

  /**
   * Upsert the user's profile on the backend. Resolves to the saved profile,
   * or null if the backend is unreachable / persistence is disabled — callers
   * treat this as best-effort.
   */
  async function saveProfile(profile) {
    const clientId = await getClientId();
    try {
      const res = await fetch(ConsentWise.API.users, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: clientId, ...profile }),
      });
      return res.ok ? await res.json() : null;
    } catch {
      return null;
    }
  }

  /** Fetch the stored profile + recent history, or null if unavailable. */
  async function fetchProfile() {
    const clientId = await getClientId();
    try {
      const res = await fetch(`${ConsentWise.API.users}/${clientId}`);
      return res.ok ? await res.json() : null;
    } catch {
      return null;
    }
  }

  root.ConsentWiseIdentity = { getClientId, saveProfile, fetchProfile };
})(typeof globalThis !== "undefined" ? globalThis : self);
