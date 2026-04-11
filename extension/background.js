/**
 * ConsentWise AI — background.js (Service Worker)
 * ─────────────────────────────────────────────────────────────────────────────
 * Listens for messages from content.js and opens the analysis tab.
 * Manages the offscreen document for Speech-to-Text (mic access).
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use strict";

// ─── State ────────────────────────────────────────────────────────────────────
let lastAnalysisTabId = null;
let offscreenCreating = false;

// ─── Offscreen document helpers ───────────────────────────────────────────────
const OFFSCREEN_URL = chrome.runtime.getURL("offscreen.html");

async function hasOffscreenDocument() {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
    documentUrls: [OFFSCREEN_URL],
  });
  return contexts.length > 0;
}

async function ensureOffscreenDocument() {
  if (await hasOffscreenDocument()) return;
  if (offscreenCreating) {
    // Wait until the ongoing creation finishes
    await new Promise((resolve) => setTimeout(resolve, 500));
    return;
  }
  offscreenCreating = true;
  try {
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: ["USER_MEDIA"],
      justification: "Speech-to-text recognition requires microphone access.",
    });
  } finally {
    offscreenCreating = false;
  }
}

async function closeOffscreenDocument() {
  if (await hasOffscreenDocument()) {
    await chrome.offscreen.closeDocument();
  }
}

// ─── Message listener ─────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("[ConsentWise BG] 📩 Message received:", message.action || message.type);

  // ── Tab opening ─────────────────────────────────────────────────────────────
  if (message.action === "openTab" && message.url) {
    handleOpenTab(message.url, sendResponse);
    return true;
  }

  if (message.action === "ping") {
    sendResponse({ status: "alive" });
    return false;
  }

  // ── STT: popup → offscreen ─────────────────────────────────────────────────
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

  // ── STT: offscreen → popup (relay) ─────────────────────────────────────────
  if (message.target === "popup") {
    // Forward to all extension pages (the popup will receive it)
    chrome.runtime.sendMessage(message).catch(() => {
      // Popup may have closed — ignore
    });

    // Auto-close offscreen when recognition ends or errors
    if (message.type === "stt-ended" || message.type === "stt-error") {
      closeOffscreenDocument().catch(() => {});
    }
    return false;
  }
});

// ─── Open / focus analysis tab ────────────────────────────────────────────────
async function handleOpenTab(url, sendResponse) {
  try {
    if (lastAnalysisTabId !== null) {
      const existingTab = await getTab(lastAnalysisTabId);
      if (existingTab) {
        await chrome.tabs.update(lastAnalysisTabId, { active: true, url });
        await chrome.windows.update(existingTab.windowId, { focused: true });
        console.log("[ConsentWise BG] ♻️  Reused existing analysis tab:", lastAnalysisTabId);
        sendResponse({ success: true, tabId: lastAnalysisTabId, reused: true });
        return;
      }
    }

    const tab = await chrome.tabs.create({ url, active: true });
    lastAnalysisTabId = tab.id;
    console.log("[ConsentWise BG] ✅ New analysis tab created:", tab.id);
    sendResponse({ success: true, tabId: tab.id, reused: false });

  } catch (err) {
    console.error("[ConsentWise BG] ❌ Error opening tab:", err.message);
    sendResponse({ success: false, error: err.message });
  }
}

// ─── Helper: safely get a tab (returns null if it no longer exists) ───────────
async function getTab(tabId) {
  try {
    return await chrome.tabs.get(tabId);
  } catch {
    return null;
  }
}

// ─── Clean up stale tab reference when a tab is closed ───────────────────────
chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === lastAnalysisTabId) {
    lastAnalysisTabId = null;
    console.log("[ConsentWise BG] 🗑️  Analysis tab closed — reference cleared.");
  }
});

// ─── Installation / update hooks ──────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(({ reason }) => {
  console.log(`[ConsentWise BG] 🚀 Extension ${reason}. ConsentWise AI is active.`);
});

console.log("[ConsentWise BG] 🛡️  Service worker loaded.");

