/**
 * ConsentGuard AI — popup.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Handles popup UI interactions:
 *   • Opens the web-app dashboard
 *   • Reads + displays intercept stats from chrome.storage
 *   • Pings the active tab's content script to confirm it's alive
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use strict";

const WEB_APP_URL = "http://localhost:3000";
const API_URL = "http://localhost:8000/api/summarize";

// ─── DOM refs ─────────────────────────────────────────────────────────────────
const openDashboardBtn = document.getElementById("open-dashboard");
const footerLink       = document.getElementById("footer-link");
const statBlocked      = document.getElementById("stat-blocked");
const statTabs         = document.getElementById("stat-tabs");
const analysisPanel    = document.getElementById("analysis-panel");
const analysisKicker   = document.getElementById("analysis-kicker");
const analysisCopy     = document.getElementById("analysis-copy");
const analysisMeta     = document.getElementById("analysis-meta");

// ─── Open dashboard ───────────────────────────────────────────────────────────
function openDashboard() {
  chrome.tabs.create({ url: WEB_APP_URL, active: true });
  console.log("[ConsentGuard Popup] 🚀 Opened dashboard:", WEB_APP_URL);
}

openDashboardBtn.addEventListener("click", openDashboard);
footerLink.addEventListener("click", (e) => {
  e.preventDefault();
  openDashboard();
});

// ─── Load stats from storage ──────────────────────────────────────────────────
function loadStats() {
  chrome.storage.local.get(["interceptCount", "tabsOpened"], (data) => {
    if (chrome.runtime.lastError) {
      console.warn("[ConsentGuard Popup] Storage error:", chrome.runtime.lastError.message);
      return;
    }
    animateNumber(statBlocked, 0, data.interceptCount || 0, 600);
    animateNumber(statTabs,    0, data.tabsOpened    || 0, 600);
  });
}

// ─── Utility: count-up animation ─────────────────────────────────────────────
function animateNumber(el, from, to, duration) {
  if (!el) return;
  const start = performance.now();
  function update(now) {
    const t = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - t, 3); // ease-out cubic
    el.textContent = Math.round(from + (to - from) * ease);
    if (t < 1) requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}

// ─── Ping content script to confirm it's active ───────────────────────────────
async function pingContentScript() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) return;

    chrome.tabs.sendMessage(tab.id, { action: "ping" }, (response) => {
      if (chrome.runtime.lastError) {
        // Content script may not be on this page — that's fine
        console.log("[ConsentGuard Popup] Content script not found on this tab:", chrome.runtime.lastError.message);
      } else {
        console.log("[ConsentGuard Popup] ✅ Content script alive:", response);
      }
    });
  } catch (err) {
    console.warn("[ConsentGuard Popup] Ping failed:", err.message);
  }
}

function showAnalysisState(copy, meta = "", options = {}) {
  if (!analysisPanel || !analysisCopy || !analysisMeta) return;

  analysisPanel.classList.add("visible");
  analysisPanel.classList.toggle("loading", Boolean(options.loading));
  analysisKicker.textContent = options.kicker || "Current Page";
  analysisCopy.textContent = copy;
  analysisMeta.textContent = meta;
}

function sendMessageToTab(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });
}

async function summarizeCurrentTab() {
  try {
    showAnalysisState("Checking this page for terms and privacy text...", "", {
      kicker: "Gemini Summary",
      loading: true,
    });

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) {
      showAnalysisState("Open a webpage with terms or a privacy policy to analyze it.");
      return;
    }

    const payload = await sendMessageToTab(tab.id, { action: "getPolicyText" });
    const text = (payload && payload.text ? payload.text : "").trim();

    if (!text) {
      showAnalysisState("No terms or privacy text was found on this page.");
      return;
    }

    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.detail || "Backend summarization failed.");
    }

    const meta = data.intent
      ? `Intent: ${data.intent}`
      : (payload.title || payload.url || "");

    showAnalysisState(
      data.summary || "Summary unavailable.",
      meta,
      { kicker: "Gemini Summary", loading: false }
    );
  } catch (err) {
    console.warn("[ConsentGuard Popup] Summary failed:", err.message);
    showAnalysisState(
      "Couldn't load the Gemini summary right now.",
      err.message === "Could not establish connection. Receiving end does not exist."
        ? "Refresh the page once so the extension content script can attach."
        : err.message,
      { kicker: "Gemini Summary", loading: false }
    );
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────
loadStats();
pingContentScript();
summarizeCurrentTab();
