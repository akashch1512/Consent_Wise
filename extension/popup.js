"use strict";

const WEB_APP_URL = "http://localhost:3000";
const BACKEND_URL = "http://localhost:8000";
const ANALYZE_API_URL = `${BACKEND_URL}/api/extension/analyze`;
const FALLBACK_REPORT_URL = `${BACKEND_URL}/dashboard`;
const STORAGE_VERSION = 2;
const INTERNAL_PREFIXES = ["chrome://", "chrome-extension://", "edge://", "about:"];
const TRUSTED_APP_ORIGINS = new Set([
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
]);

const openDashboardBtn = document.getElementById("open-dashboard");
const openLatestBtn = document.getElementById("open-latest");
const analyzeCurrentBtn = document.getElementById("analyze-current");
const footerLink = document.getElementById("footer-link");
const statBlocked = document.getElementById("stat-blocked");
const statTabs = document.getElementById("stat-tabs");
const dangerRing = document.getElementById("danger-ring");
const dangerValue = document.getElementById("danger-value");
const dangerTitle = document.getElementById("danger-title");
const dangerCopy = document.getElementById("danger-copy");
const reputationRing = document.getElementById("reputation-ring");
const reputationValue = document.getElementById("reputation-value");
const reputationTitle = document.getElementById("reputation-title");
const reputationCopy = document.getElementById("reputation-copy");
const loginBadge = document.getElementById("login-badge");
const loginCopy = document.getElementById("login-copy");
const analysisMeta = document.getElementById("analysis-meta");
const analysisIntent = document.getElementById("analysis-intent");
const analysisSummary = document.getElementById("analysis-summary");
const summaryPoints = document.getElementById("summary-points");
const reputationSummary = document.getElementById("reputation-summary");
const reputationExamples = document.getElementById("reputation-examples");
const ttsControls = document.getElementById("tts-controls");
const ttsLang = document.getElementById("tts-lang");
const ttsPlayBtn = document.getElementById("tts-play-btn");
const ttsAudio = document.getElementById("tts-audio");
const chatSection = document.getElementById("chat-section");
const chatWindow = document.getElementById("chat-window");
const chatInput = document.getElementById("chat-input");
const chatSendBtn = document.getElementById("chat-send-btn");
const chatLang = document.getElementById("chat-lang");

let chatHistory = [];
let latestOriginalText = "";
function animateNumber(el, from, to, duration) {
  if (!el) return;
  const start = performance.now();
  function update(now) {
    const t = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - t, 3);
    el.textContent = Math.round(from + (to - from) * ease);
    if (t < 1) requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}

function loadStats() {
  chrome.storage.local.get(["interceptCount", "tabsOpened"], (data) => {
    if (chrome.runtime.lastError) {
      console.warn("[ConsentGuard Popup] Storage error:", chrome.runtime.lastError.message);
      return;
    }
    animateNumber(statBlocked, 0, data.interceptCount || 0, 500);
    animateNumber(statTabs, 0, data.tabsOpened || 0, 500);
  });
}

function openUrl(url) {
  chrome.tabs.create({ url, active: true });
}

function openDashboard() {
  openUrl(WEB_APP_URL);
}

function openLatestReport() {
  chrome.storage.local.get(["latestDashboardUrl"], (data) => {
    openUrl(data.latestDashboardUrl || FALLBACK_REPORT_URL);
  });
}

function getDangerTheme(score) {
  if (score >= 75) {
    return {
      title: "High danger",
      color: "#dc2626",
      copy: "This page contains risky or harmful language.",
    };
  }
  if (score >= 40) {
    return {
      title: "Use caution",
      color: "#d97706",
      copy: "Important terms need a careful read before you proceed.",
    };
  }
  return {
    title: "Lower danger",
    color: "#16a34a",
    copy: "No major risk signals were found in the visible text.",
  };
}

function getReputationTheme(score) {
  if (score >= 75) {
    return {
      title: "Strong reputation",
      color: "#16a34a",
      copy: "The site appears more trustworthy overall.",
    };
  }
  if (score >= 40) {
    return {
      title: "Mixed reputation",
      color: "#d97706",
      copy: "The site may be acceptable, but it deserves extra review.",
    };
  }
  return {
    title: "Poor reputation",
    color: "#dc2626",
    copy: "The site shows weak trust signals or concerning patterns.",
  };
}

function updateRing(ring, valueEl, score, color) {
  if (!ring || !valueEl || typeof score !== "number" || Number.isNaN(score)) {
    if (valueEl) valueEl.textContent = "--";
    if (ring) {
      ring.style.setProperty("--ring-angle", "8deg");
      ring.style.setProperty("--ring-color", "#6366f1");
    }
    return;
  }

  const clamped = Math.max(0, Math.min(100, score));
  animateNumber(valueEl, 0, clamped, 700);
  ring.style.setProperty("--ring-angle", `${Math.max(8, clamped * 3.6)}deg`);
  ring.style.setProperty("--ring-color", color);
}

function setLoginSafety(safety, copy) {
  const normalized = (safety || "Caution").toLowerCase();
  const className = normalized === "safe" ? "safe" : normalized === "unsafe" ? "unsafe" : "caution";
  loginBadge.className = `badge ${className}`;
  loginBadge.textContent = normalized === "safe" ? "Safe" : normalized === "unsafe" ? "Unsafe" : "Caution";
  loginCopy.textContent = copy;
}

function renderPointList(container, items, emptyLabel, className) {
  container.innerHTML = "";
  const values = Array.isArray(items) ? items.filter(Boolean) : [];
  if (!values.length) {
    const fallback = document.createElement("div");
    fallback.className = className;
    fallback.textContent = emptyLabel;
    container.appendChild(fallback);
    return;
  }

  values.slice(0, 4).forEach((item) => {
    const el = document.createElement("div");
    el.className = className;
    el.textContent = item;
    container.appendChild(el);
  });
}

function looksLikeRawEnvelope(text) {
  const value = String(text || "").trim();
  return value.startsWith("{") && value.includes("\"candidates\"") && value.includes("\"usageMetadata\"");
}

function extractLikelySummary(text) {
  const value = String(text || "").trim();
  if (!value) return "";

  if (looksLikeRawEnvelope(value)) {
    return "A previous cached analysis used an unreadable model response. Run Analyze Current Page again to refresh it.";
  }

  const summaryMatch = value.match(/"summary"\s*:\s*"([^"]+)/i);
  if (summaryMatch && summaryMatch[1]) {
    return summaryMatch[1].trim();
  }

  return value;
}

function sanitizeAnalysisPayload(data) {
  const summary = extractLikelySummary(data.summary || "");
  const keyPoints = Array.isArray(data.key_points)
    ? data.key_points
        .map((item) => extractLikelySummary(item))
        .filter(Boolean)
        .filter((item) => !looksLikeRawEnvelope(item))
    : [];

  return {
    ...data,
    summary: summary || "Summary unavailable.",
    reputation_summary: extractLikelySummary(data.reputation_summary || "") || "No reputation summary available.",
    key_points: keyPoints,
    reputation_examples: Array.isArray(data.reputation_examples)
      ? data.reputation_examples.map((item) => extractLikelySummary(item)).filter(Boolean)
      : [],
  };
}

function setAnalysisState({
  meta = "Waiting for scan",
  intent = "No site classified",
  summary = "Analyze a page with terms, sign-in, consent, or payment language to populate this summary.",
  keyPoints = [],
  dangerScore,
  reputationScore,
  reputation = "Reputation details will appear here after a scan.",
  reputationExamples: badExamples = [],
  loginSafety = "Caution",
  loginSafetyText = "Analyze a site before entering credentials.",
  loading = false,
}) {
  analysisMeta.textContent = meta;
  analysisIntent.textContent = intent;
  analysisSummary.textContent = summary;
  reputationSummary.textContent = reputation;

  if (loading) {
    dangerTitle.textContent = "Scanning";
    dangerCopy.textContent = "Reviewing the visible agreement text now.";
    reputationTitle.textContent = "Checking site";
    reputationCopy.textContent = "Estimating trust and login safety.";
    updateRing(reputationRing, reputationValue, undefined);
    setLoginSafety("Caution", "Hold on while the site is being analyzed.");
    renderPointList(summaryPoints, [], "Preparing a readable summary...", "chip");
    renderPointList(reputationExamples, [], "Checking for known reputation concerns...", "list-item");
    ttsControls.style.display = "none";
    chatSection.style.display = "none";
    return;
  }

  const hasDangerScore = typeof dangerScore === "number" && !Number.isNaN(dangerScore);
  const hasReputationScore = typeof reputationScore === "number" && !Number.isNaN(reputationScore);
  const dangerTheme = getDangerTheme(hasDangerScore ? dangerScore : 0);
  const reputationTheme = getReputationTheme(hasReputationScore ? reputationScore : 0);

  updateRing(dangerRing, dangerValue, hasDangerScore ? dangerScore : undefined, dangerTheme.color);
  updateRing(reputationRing, reputationValue, hasReputationScore ? reputationScore : undefined, reputationTheme.color);

  dangerTitle.textContent = hasDangerScore ? `${dangerTheme.title} · ${dangerScore}/100` : "Ready to Scan";
  dangerCopy.textContent = hasDangerScore ? dangerTheme.copy : "Analyze a page to generate a risk score.";
  reputationTitle.textContent = hasReputationScore ? `${reputationTheme.title} · ${reputationScore}/100` : "Awaiting Site Check";
  reputationCopy.textContent = hasReputationScore ? reputationTheme.copy : "Analyze a page to estimate site reputation.";

  setLoginSafety(loginSafety, loginSafetyText);
  renderPointList(summaryPoints, keyPoints, "No key points extracted yet.", "chip");
  renderPointList(reputationExamples, badExamples, "No verified bad history was identified from this analysis.", "list-item");
  
  if (summary && summary !== "Analyze a page with terms, sign-in, consent, or payment language to populate this summary.") {
    ttsControls.style.display = "flex";
    chatSection.style.display = "block";
    resetChat();
  } else {
    ttsControls.style.display = "none";
    chatSection.style.display = "none";
  }
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

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Extract policy text from a tab — injects content script first if needed.
 * Returns { text, title, url } or throws a user-friendly Error.
 */
async function ensureContentScriptAndGetText(tab) {
  // ── Fast path: content script already running ──────────────────────────────
  try {
    const payload = await sendMessageToTab(tab.id, { action: "getPolicyText" });
    if (payload && typeof payload.text === "string") return payload;
  } catch (firstErr) {
    const msg = firstErr.message || "";
    const isConnectionErr =
      msg.includes("Receiving end does not exist") ||
      msg.includes("Could not establish connection") ||
      msg.includes("No tab with id");

    if (!isConnectionErr) throw firstErr; // some other error — propagate
  }

  // ── Inject content script programmatically then retry ──────────────────────
  console.log("[ConsentGuard Popup] Content script not found — injecting now into tab", tab.id);
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"],
    });
    await wait(300); // let the script initialise
    const payload = await sendMessageToTab(tab.id, { action: "getPolicyText" });
    if (payload && typeof payload.text === "string") return payload;
  } catch (injectErr) {
    console.warn("[ConsentGuard Popup] Script injection failed:", injectErr.message);
  }

  // ── Last-resort: extract text directly via one-shot executeScript ──────────
  console.log("[ConsentGuard Popup] Falling back to direct text extraction.");
  const [result] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => ({
      text: (document.body ? document.body.innerText : "").slice(0, 5000).trim(),
      title: document.title || "",
      url: window.location.href,
    }),
  });

  if (!result || !result.result) {
    throw new Error("Could not read page content. Try refreshing the page.");
  }
  return result.result;
}

function isRestrictedUrl(url = "") {
  return INTERNAL_PREFIXES.some((prefix) => url.startsWith(prefix));
}

function isTrustedAppUrl(url = "") {
  try {
    return TRUSTED_APP_ORIGINS.has(new URL(url).origin);
  } catch {
    return false;
  }
}

function renderAnalysis(data, sourceMeta) {
  const normalized = sanitizeAnalysisPayload(data);
  setAnalysisState({
    meta: sourceMeta,
    intent: normalized.intent || "Unknown intent",
    summary: normalized.summary,
    keyPoints: normalized.key_points || [],
    dangerScore: normalized.danger_score,
    reputationScore: normalized.reputation_score,
    reputation: normalized.reputation_summary,
    reputationExamples: normalized.reputation_examples || [],
    loginSafety: normalized.login_safety || "Caution",
    loginSafetyText: normalized.login_guidance || "Use caution before logging in. Check the domain first.",
  });

  chrome.storage.local.set({
    latestStorageVersion: STORAGE_VERSION,
    latestDashboardUrl: normalized.dashboard_url,
    latestSummary: normalized.summary || "",
    latestIntent: normalized.intent || "",
    latestDangerScore: normalized.danger_score,
    latestReputationScore: normalized.reputation_score,
    latestReputationSummary: normalized.reputation_summary || "",
    latestReputationExamples: normalized.reputation_examples || [],
    latestLoginSafety: normalized.login_safety || "Caution",
    latestLoginGuidance: normalized.login_guidance || "",
    latestKeyPoints: normalized.key_points || [],
    latestMeta: sourceMeta,
    latestOriginalText: data.original_text_excerpt || "",
  });
  latestOriginalText = data.original_text_excerpt || "";

  if (openLatestBtn) openLatestBtn.disabled = false;
}

async function analyzeCurrentTab() {
  analyzeCurrentBtn.disabled = true;
  setAnalysisState({
    meta: "Preparing scan",
    loading: true,
  });

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) {
      throw new Error("No active tab found.");
    }

    if (isRestrictedUrl(tab.url || "")) {
      throw new Error("This browser page cannot be scanned. Open a normal website tab first.");
    }

    if (isTrustedAppUrl(tab.url || "")) {
      throw new Error("Login and dashboard pages are intentionally excluded from interception. Open the target website you want to review.");
    }

    const payload = await ensureContentScriptAndGetText(tab);
    const text = (payload && payload.text ? payload.text : "").trim();
    if (!text) {
      throw new Error("No readable text was found on this page. Make sure the page has finished loading.");
    }

    const response = await fetch(ANALYZE_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        title: payload.title || tab.title || "",
        url: payload.url || tab.url || "",
        source: "extension-popup",
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.detail || "Backend analysis failed.");
    }

    const sourceMeta = [
      payload.title || tab.title || "",
      `Danger ${data.danger_score}/100`,
      `Reputation ${data.reputation_score}/100`,
    ].filter(Boolean).join(" · ");

    renderAnalysis(data, sourceMeta);
    chrome.storage.local.get(["tabsOpened", "interceptCount"], (storage) => {
      chrome.storage.local.set({
        tabsOpened: (storage.tabsOpened || 0) + 1,
        interceptCount: (storage.interceptCount || 0) + 1,
      });
      loadStats();
    });
  } catch (error) {
    console.warn("[ConsentGuard Popup] Analysis failed:", error.message);
    setAnalysisState({
      meta: "Scan blocked",
      intent: "Unavailable",
      summary: error.message,
      reputation: "No reputation scan could be completed.",
      reputationExamples: [],
      loginSafety: "Caution",
      loginSafetyText: "The site could not be analyzed yet.",
    });
  } finally {
    analyzeCurrentBtn.disabled = false;
  }
}

function restoreLatestAnalysis() {
  chrome.storage.local.get(
    [
      "latestDashboardUrl",
      "latestStorageVersion",
      "latestSummary",
      "latestIntent",
      "latestDangerScore",
      "latestReputationScore",
      "latestReputationSummary",
      "latestReputationExamples",
      "latestLoginSafety",
      "latestLoginGuidance",
      "latestKeyPoints",
      "latestMeta",
      "latestOriginalText",
    ],
    (data) => {
      if (!data.latestSummary) return;
      if ((data.latestStorageVersion || 0) < STORAGE_VERSION) {
        chrome.storage.local.remove([
          "latestDashboardUrl",
          "latestStorageVersion",
          "latestSummary",
          "latestIntent",
          "latestDangerScore",
          "latestReputationScore",
          "latestReputationSummary",
          "latestReputationExamples",
          "latestLoginSafety",
          "latestLoginGuidance",
          "latestKeyPoints",
          "latestMeta",
          "latestOriginalText",
        ]);
        return;
      }
      latestOriginalText = data.latestOriginalText || "";
      renderAnalysis(
        {
          dashboard_url: data.latestDashboardUrl,
          summary: data.latestSummary,
          intent: data.latestIntent,
          danger_score: data.latestDangerScore,
          reputation_score: data.latestReputationScore,
          reputation_summary: data.latestReputationSummary,
          reputation_examples: data.latestReputationExamples || [],
          login_safety: data.latestLoginSafety,
          login_guidance: data.latestLoginGuidance,
          key_points: data.latestKeyPoints || [],
        },
        data.latestMeta || "Latest saved report"
      );
    }
  );
}

function resetChat() {
  chatHistory = [];
  chatWindow.innerHTML = '<div class="chat-message chat-ai">Ask me anything about this agreement. You can ask in English, Hindi, or any supported Indian language!</div>';
  chatInput.value = "";
}

function appendMessage(role, text) {
  const msgDiv = document.createElement("div");
  msgDiv.className = `chat-message ${role === "user" ? "chat-user" : "chat-ai"}`;
  msgDiv.textContent = text;
  chatWindow.appendChild(msgDiv);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

chatSendBtn.addEventListener("click", async () => {
  const text = chatInput.value.trim();
  if (!text) return;
  
  appendMessage("user", text);
  chatInput.value = "";
  chatSendBtn.disabled = true;

  const thinkingDiv = document.createElement("div");
  thinkingDiv.className = "chat-message chat-ai";
  thinkingDiv.textContent = "Thinking...";
  chatWindow.appendChild(thinkingDiv);
  chatWindow.scrollTop = chatWindow.scrollHeight;

  let currentLang = "Indian English";
  if (chatLang && chatLang.options) {
    currentLang = chatLang.options[chatLang.selectedIndex].text;
  }
  const questionWithLang = `[Please answer in ${currentLang}] ${text}`;

  try {
    const res = await fetch(`${BACKEND_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        document_context: latestOriginalText || analysisSummary.textContent,
        question: questionWithLang,
        history: chatHistory
      })
    });
    
    if (!res.ok) throw new Error("Chat failed.");
    const data = await res.json();
    chatHistory.push({ role: "user", text: questionWithLang });
    chatHistory.push({ role: "model", text: data.answer });
    
    chatWindow.removeChild(thinkingDiv);
    appendMessage("model", data.answer);
  } catch (err) {
    chatWindow.removeChild(thinkingDiv);
    appendMessage("model", "Sorry, I couldn't process your request right now.");
  } finally {
    chatSendBtn.disabled = false;
  }
});

chatInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") chatSendBtn.click();
});

if (chatLang) {
  chatLang.addEventListener("change", () => {
    if (chatLang.value === "hi-IN" || chatLang.value === "mr-IN") {
      document.body.style.fontFamily = "'Noto Sans Devanagari', 'Space Grotesk', sans-serif";
      document.body.style.fontWeight = "500";
    } else {
      document.body.style.fontFamily = "'Space Grotesk', sans-serif";
      document.body.style.fontWeight = "400";
    }
  });
}

let isPlaying = false;
ttsPlayBtn.addEventListener("click", async () => {
  if (isPlaying) {
    ttsAudio.pause();
    isPlaying = false;
    ttsPlayBtn.textContent = "Listen";
    return;
  }
  
  const textToSay = analysisSummary.textContent;
  if (!textToSay || textToSay.includes("Analyze a page")) return;
  
  ttsPlayBtn.disabled = true;
  ttsPlayBtn.textContent = "Loading...";
  
  try {
    const res = await fetch(`${BACKEND_URL}/api/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: textToSay,
        language_code: ttsLang.value,
        voice_name: "Kore"
      })
    });
    
    if (!res.ok) throw new Error("TTS failed");
    const data = await res.json();
    ttsAudio.src = `data:${data.mime_type};base64,${data.audio_base64}`;
    await ttsAudio.play();
    isPlaying = true;
    ttsPlayBtn.textContent = "Stop";
    
    ttsAudio.onended = () => {
      isPlaying = false;
      ttsPlayBtn.textContent = "Listen";
    };
  } catch (err) {
    console.error(err);
    alert("Could not load audio. Try again.");
  } finally {
    ttsPlayBtn.disabled = false;
    if (!isPlaying) ttsPlayBtn.textContent = "Listen";
  }
});

openDashboardBtn.addEventListener("click", openDashboard);
openLatestBtn.addEventListener("click", openLatestReport);
analyzeCurrentBtn.addEventListener("click", analyzeCurrentTab);
footerLink.addEventListener("click", (event) => {
  event.preventDefault();
  openDashboard();
});

loadStats();
setAnalysisState({});
restoreLatestAnalysis();
