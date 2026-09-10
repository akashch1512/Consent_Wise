"use strict";

/**
 * ConsentWise AI — popup storage schema
 * ─────────────────────────────────────────────────────────────────────────────
 * Every `chrome.storage.local` key the popup touches, in one place (MNT-8).
 * Exposed as `globalThis.CWState`.
 * ─────────────────────────────────────────────────────────────────────────────
 */
(function (root) {
  const KEYS = {
    hasSeenWelcome: "hasSeenWelcome",
    protectionEnabled: "protectionEnabled",
    globalLang: "globalLangCode",
    userProfile: "userProfile",
    interceptCount: "interceptCount",
    tabsOpened: "tabsOpened",
    lastAnalysis: "cw:lastAnalysis",
    openAccordion: "cw:openAccordion",
  };

  const ANALYSIS_VERSION = 3;

  const get = (keys) => new Promise((res) => chrome.storage.local.get(keys, (d) => res(d || {})));
  const set = (obj) => new Promise((res) => chrome.storage.local.set(obj, res));
  const remove = (keys) => new Promise((res) => chrome.storage.local.remove(keys, res));

  /** The persisted last analysis, or null when absent / stale. */
  async function loadLastAnalysis() {
    const d = await get([KEYS.lastAnalysis, "latestStorageVersion"]);
    const rec = d[KEYS.lastAnalysis];
    if (rec && rec.v === ANALYSIS_VERSION && rec.data) return rec;
    // Drop any pre-v3 keys left by older builds.
    if (d.latestStorageVersion || rec) {
      await remove([
        KEYS.lastAnalysis, "latestStorageVersion", "latestSummary", "latestIntent",
        "latestDangerScore", "latestReputationScore", "latestReputationSummary",
        "latestReputationExamples", "latestLoginSafety", "latestLoginGuidance",
        "latestKeyPoints", "latestMeta", "latestOriginalText", "latestDashboardUrl",
      ]);
    }
    return null;
  }

  async function saveLastAnalysis(data, meta) {
    await set({ [KEYS.lastAnalysis]: { v: ANALYSIS_VERSION, data, meta, at: Date.now() } });
  }

  async function bumpCounter(key, by = 1) {
    const d = await get([key]);
    await set({ [key]: (typeof d[key] === "number" ? d[key] : 0) + by });
    return d[key] + by;
  }

  root.CWState = {
    KEYS,
    ANALYSIS_VERSION,
    get,
    set,
    remove,
    loadLastAnalysis,
    saveLastAnalysis,
    bumpCounter,
  };
})(typeof globalThis !== "undefined" ? globalThis : self);
