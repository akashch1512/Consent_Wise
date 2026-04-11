/**
 * ConsentGuard AI — background.js (Service Worker)
 * ─────────────────────────────────────────────────────────────────────────────
 * Listens for messages from content.js and opens the analysis tab.
 * Keeps track of the last-opened analysis tab so it can be reused / focused.
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use strict";

// ─── State ────────────────────────────────────────────────────────────────────
let lastAnalysisTabId = null;

// ─── Message listener ─────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("[ConsentGuard BG] 📩 Message received:", message.action);

  if (message.action === "openTab" && message.url) {
    handleOpenTab(message.url, sendResponse);
    // Return true to keep the message channel open for async response
    return true;
  }

  if (message.action === "ping") {
    sendResponse({ status: "alive" });
    return false;
  }
});

// ─── Open / focus analysis tab ────────────────────────────────────────────────
async function handleOpenTab(url, sendResponse) {
  try {
    // If we already have an analysis tab, try to reuse it
    if (lastAnalysisTabId !== null) {
      const existingTab = await getTab(lastAnalysisTabId);
      if (existingTab) {
        await chrome.tabs.update(lastAnalysisTabId, { active: true, url });
        await chrome.windows.update(existingTab.windowId, { focused: true });
        console.log("[ConsentGuard BG] ♻️  Reused existing analysis tab:", lastAnalysisTabId);
        sendResponse({ success: true, tabId: lastAnalysisTabId, reused: true });
        return;
      }
    }

    // Create a new tab
    const tab = await chrome.tabs.create({ url, active: true });
    lastAnalysisTabId = tab.id;
    console.log("[ConsentGuard BG] ✅ New analysis tab created:", tab.id);
    sendResponse({ success: true, tabId: tab.id, reused: false });

  } catch (err) {
    console.error("[ConsentGuard BG] ❌ Error opening tab:", err.message);
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
    console.log("[ConsentGuard BG] 🗑️  Analysis tab closed — reference cleared.");
  }
});

// ─── Installation / update hooks ──────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(({ reason }) => {
  console.log(`[ConsentGuard BG] 🚀 Extension ${reason}. ConsentGuard AI is active.`);
});

console.log("[ConsentGuard BG] 🛡️  Service worker loaded.");
