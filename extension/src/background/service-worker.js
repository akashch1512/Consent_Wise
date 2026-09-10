/**
 * ConsentWise AI — service worker
 * ─────────────────────────────────────────────────────────────────────────────
 * Opens/reuses the analysis tab (only for backend-origin URLs) and manages the
 * offscreen document used for speech-to-text.
 * ─────────────────────────────────────────────────────────────────────────────
 */
"use strict";

importScripts("../config/config.js");

const { BACKEND_URL } = ConsentWise;
const BACKEND_ORIGIN = new URL(BACKEND_URL).origin;
const OFFSCREEN_URL = chrome.runtime.getURL("src/offscreen/offscreen.html");
const EXTENSION_ID = chrome.runtime.id;

let offscreenReady = null; // Promise while creation is in flight (BUG-6)

// ── Offscreen document ───────────────────────────────────────────────────────
async function hasOffscreenDocument() {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
    documentUrls: [OFFSCREEN_URL],
  });
  return contexts.length > 0;
}

async function ensureOffscreenDocument() {
  if (await hasOffscreenDocument()) return;
  if (offscreenReady) return offscreenReady;
  offscreenReady = chrome.offscreen
    .createDocument({
      url: OFFSCREEN_URL,
      reasons: ["USER_MEDIA"],
      justification: "Speech-to-text needs microphone access from a document context.",
    })
    .catch((err) => {
      if (!String(err && err.message).includes("Only a single offscreen")) throw err;
    })
    .finally(() => {
      offscreenReady = null;
    });
  return offscreenReady;
}

async function closeOffscreenDocument() {
  if (await hasOffscreenDocument()) await chrome.offscreen.closeDocument();
}

// ── Analysis tab (BUG-7: id survives worker restarts) ────────────────────────
async function getLastTabId() {
  const { lastAnalysisTabId } = await chrome.storage.session.get("lastAnalysisTabId");
  return typeof lastAnalysisTabId === "number" ? lastAnalysisTabId : null;
}
async function setLastTabId(id) {
  await chrome.storage.session.set({ lastAnalysisTabId: id });
}

function isAllowedTarget(url) {
  try {
    return new URL(url).origin === BACKEND_ORIGIN;
  } catch {
    return false;
  }
}

async function handleOpenTab(url, sendResponse) {
  if (!isAllowedTarget(url)) {
    console.warn("[ConsentWise] Refused openTab for non-backend URL:", url);
    sendResponse({ success: false, error: "blocked" });
    return;
  }
  try {
    const lastId = await getLastTabId();
    if (lastId !== null) {
      const existing = await chrome.tabs.get(lastId).catch(() => null);
      if (existing) {
        await chrome.tabs.update(lastId, { active: true, url });
        await chrome.windows.update(existing.windowId, { focused: true });
        sendResponse({ success: true, tabId: lastId, reused: true });
        return;
      }
    }
    const tab = await chrome.tabs.create({ url, active: true });
    await setLastTabId(tab.id);
    sendResponse({ success: true, tabId: tab.id, reused: false });
  } catch (err) {
    console.error("[ConsentWise] openTab failed:", err && err.message);
    sendResponse({ success: false, error: String(err && err.message) });
  }
}

// ── Messages (SEC-5) ─────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!sender || sender.id !== EXTENSION_ID) return;

  if (message.action === "openTab" && message.url) {
    handleOpenTab(message.url, sendResponse);
    return true;
  }
  if (message.action === "ping") {
    sendResponse({ status: "alive" });
    return false;
  }
  if (message.type === "stt-start") {
    (async () => {
      await ensureOffscreenDocument();
      chrome.runtime.sendMessage({ target: "offscreen", type: "stt-start", lang: message.lang });
      sendResponse({ ok: true });
    })();
    return true;
  }
  if (message.type === "stt-stop") {
    (async () => {
      if (await hasOffscreenDocument()) {
        chrome.runtime.sendMessage({ target: "offscreen", type: "stt-stop" });
      }
      sendResponse({ ok: true });
    })();
    return true;
  }
  if (message.target === "popup") {
    chrome.runtime.sendMessage(message).catch(() => {});
    if (message.type === "stt-ended" || message.type === "stt-error") {
      closeOffscreenDocument().catch(() => {});
    }
    return false;
  }
  return false;
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  if ((await getLastTabId()) === tabId) await setLastTabId(null);
});
