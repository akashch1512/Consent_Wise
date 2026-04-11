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

const openLatestBtn = document.getElementById("open-latest");
const analyzeCurrentBtn = document.getElementById("analyze-current");
const statBlocked = document.getElementById("stat-blocked");
const statTabs = document.getElementById("stat-tabs");
const protectionToggle = document.getElementById("protection-toggle");
const protectionLabel = document.getElementById("protection-label");
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
const chatMicBtn = document.getElementById("chat-mic-btn");
const openDashboardBtn = document.getElementById("open-dashboard");
const footerLink = document.getElementById("footer-link");

const quizSection = document.getElementById("quiz-section");
const quizLang = document.getElementById("quiz-lang");
const quizGenerateBtn = document.getElementById("quiz-generate-btn");
const quizContainer = document.getElementById("quiz-container");
const quizQuestionText = document.getElementById("quiz-question-text");
const quizOptA = document.getElementById("quiz-opt-a");
const quizOptB = document.getElementById("quiz-opt-b");
const quizExplanationBox = document.getElementById("quiz-explanation-box");
const quizNextBtn = document.getElementById("quiz-next-btn");
const globalLang = document.getElementById("global-lang");

let chatHistory = [];
let currentQuizData = [];
let currentQuizIndex = 0;
let latestOriginalText = "";
let isListening = false;
let speechBaseValue = "";

function applyProtectionUI(enabled) {
  if (!protectionToggle || !protectionLabel) return;
  protectionToggle.classList.toggle("is-on", enabled);
  protectionToggle.setAttribute("aria-pressed", enabled ? "true" : "false");
  protectionLabel.classList.toggle("off", !enabled);
  protectionLabel.textContent = enabled ? t("protectionOn") : t("protectionOff");
}

function loadProtectionState() {
  chrome.storage.local.get(["protectionEnabled"], (data) => {
    applyProtectionUI(data.protectionEnabled !== false);
  });
}

function toggleProtection() {
  chrome.storage.local.get(["protectionEnabled"], (data) => {
    const next = data.protectionEnabled === false;
    chrome.storage.local.set({ protectionEnabled: next }, () => {
      applyProtectionUI(next);
    });
  });
}

// Speech-to-text is handled via an offscreen document (Chrome MV3)
// to work around the popup's sandbox restrictions on mic access.

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
      console.warn("[ConsentWise Popup] Storage error:", chrome.runtime.lastError.message);
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
// hello
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
  loginBadge.textContent = normalized === "safe" ? t("safe") : normalized === "unsafe" ? t("unsafe") : t("caution");
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
    dangerTitle.textContent = t("scanning");
    dangerCopy.textContent = t("waitingAnalysis");
    reputationTitle.textContent = t("checkingSite");
    reputationCopy.textContent = t("waitingAnalysis");
    updateRing(reputationRing, reputationValue, undefined);
    setLoginSafety("Caution", t("analyzeSite"));
    renderPointList(summaryPoints, [], t("preparing") + "...", "chip");
    renderPointList(reputationExamples, [], t("checkingSite") + "...", "list-item");
    if (ttsControls) ttsControls.style.display = "none";
    if (chatSection) chatSection.style.display = "none";
    if (quizSection) quizSection.style.display = "none";
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
  renderPointList(summaryPoints, keyPoints, t("noKeyPoints"), "chip");
  renderPointList(reputationExamples, badExamples, t("noBadHistory"), "list-item");

  // Use the i18n key as sentinel — compare against ALL placeholder translations
  const placeholderKey = "analyzePlaceholder";
  const isPlaceholder = !summary || Object.values(I18N).some((d) => d[placeholderKey] === summary);
  if (!isPlaceholder) {
    if (ttsControls) ttsControls.style.display = "flex";
    if (chatSection) chatSection.style.display = "block";
    if (quizSection) quizSection.style.display = "block";
    if (chatSection) resetChat();
  } else {
    if (ttsControls) ttsControls.style.display = "none";
    if (chatSection) chatSection.style.display = "none";
    if (quizSection) quizSection.style.display = "none";
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
  console.log("[ConsentWise Popup] Content script not found — injecting now into tab", tab.id);
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"],
    });
    await wait(300); // let the script initialise
    const payload = await sendMessageToTab(tab.id, { action: "getPolicyText" });
    if (payload && typeof payload.text === "string") return payload;
  } catch (injectErr) {
    console.warn("[ConsentWise Popup] Script injection failed:", injectErr.message);
  }

  // ── Last-resort: extract text directly via one-shot executeScript ──────────
  console.log("[ConsentWise Popup] Falling back to direct text extraction.");
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
  const originalLabel = analyzeCurrentBtn ? analyzeCurrentBtn.textContent : t("analyzeBtn");
  analyzeCurrentBtn.disabled = true;
  analyzeCurrentBtn.textContent = t("analyzingBtn");
  setAnalysisState({
    meta: t("preparing"),
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

    if (!response) {
      throw new Error("No response from analysis service.");
    }

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
    const rawMessage = (error && error.message ? error.message : "Analysis failed.").trim();
    let message = rawMessage;

    if (/Failed to fetch|NetworkError|fetch/i.test(rawMessage)) {
      message = "Could not reach the local backend at http://localhost:8000. Start the backend server, then try again.";
    } else if (/Cannot access contents of url|Cannot access a chrome:|Missing host permission/i.test(rawMessage)) {
      message = "This tab cannot be scanned right now. Refresh the page or switch to a normal website tab.";
    }

    console.warn("[ConsentWise Popup] Analysis failed:", message);
    setAnalysisState({
      meta: t("scanBlocked"),
      intent: "Unavailable",
      summary: message,
      reputation: t("reputationPlaceholder"),
      reputationExamples: [],
      loginSafety: "Caution",
      loginSafetyText: t("analyzeSite"),
    });
    alert(message);
  } finally {
    analyzeCurrentBtn.disabled = false;
    analyzeCurrentBtn.textContent = originalLabel;
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
  if (!chatWindow || !chatInput) return;
  chatHistory = [];
  chatWindow.innerHTML = `<div class="chat-message chat-ai">${t("chatWelcome")}</div>`;
  chatInput.value = "";
  speechBaseValue = "";
}

function appendMessage(role, text) {
  if (!chatWindow) return;
  const msgDiv = document.createElement("div");
  msgDiv.className = `chat-message ${role === "user" ? "chat-user" : "chat-ai"}`;
  msgDiv.textContent = text;
  chatWindow.appendChild(msgDiv);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function setMicState(state) {
  // state: false | true | "recording"
  isListening = !!state;

  if (!chatMicBtn) return;

  chatMicBtn.classList.toggle("listening", !!state);
  chatMicBtn.classList.toggle("recording", state === "recording");
  chatMicBtn.disabled = false;

  if (state === "recording") {
    chatMicBtn.title = "Recording… click to stop";
    chatMicBtn.setAttribute("aria-label", "Recording — click to stop");
  } else if (state) {
    chatMicBtn.title = "Stop listening";
    chatMicBtn.setAttribute("aria-label", "Stop listening");
  } else {
    chatMicBtn.title = "Speak your question";
    chatMicBtn.setAttribute("aria-label", "Speak your question");
  }
}

function stopSpeechRecognition() {
  if (isListening) {
    chrome.runtime.sendMessage({ type: "stt-stop" }).catch(() => { });
  }
}

function setupSpeechRecognition() {
  if (!chatMicBtn) return;

  // Listen for results relayed from the offscreen document via the background
  chrome.runtime.onMessage.addListener((message) => {
    if (message.target !== "popup") return;

    if (message.type === "stt-started") {
      speechBaseValue = chatInput.value.trim();
      setMicState("recording");  // show pulsing red state while recording
    }

    if (message.type === "stt-result") {
      const spokenText = message.transcript;
      if (spokenText) {
        chatInput.value = [speechBaseValue, spokenText]
          .filter(Boolean)
          .join(speechBaseValue && spokenText ? " " : "");
      }
    }

    if (message.type === "stt-error") {
      setMicState(false);
      if (message.error === "not-allowed") {
        appendMessage(
          "model",
          "🎤 Microphone access was denied. Please go to chrome://extensions, find ConsentWise AI, click \"Details\", then allow the Microphone permission. Reload the extension after."
        );
      } else if (message.error === "not-supported") {
        if (chatMicBtn) {
          chatMicBtn.disabled = true;
          chatMicBtn.title = "Speech input is not supported in this browser";
        }
      } else if (message.error === "network") {
        appendMessage("model", "⚠️ Could not reach the transcription server. Make sure the backend is running and try again.");
      } else if (message.error !== "no-speech" && message.error !== "aborted") {
        appendMessage("model", "Speech input encountered an error. Please try again.");
      }
    }

    if (message.type === "stt-ended") {
      setMicState(false);
      speechBaseValue = chatInput.value.trim();
    }
  });

  chatMicBtn.addEventListener("click", () => {
    if (isListening) {
      stopSpeechRecognition();
      return;
    }

    // Optimistic UI — offscreen confirms via stt-started
    chatMicBtn.disabled = true;
    chatMicBtn.title = "Starting…";

    chrome.runtime.sendMessage({
      type: "stt-start",
      lang: chatLang?.value || "en-IN",
    }).then(() => {
      chatMicBtn.disabled = false;
      chatInput.focus();
    }).catch(() => {
      setMicState(false);
      appendMessage("model", "Couldn't start audio capture. Make sure the backend is running.");
    });
  });
}

if (chatSendBtn && chatInput && chatWindow) {
  chatSendBtn.addEventListener("click", async () => {
    const text = chatInput.value.trim();
    if (!text) return;

    stopSpeechRecognition();

    appendMessage("user", text);
    chatInput.value = "";
    speechBaseValue = "";
    chatSendBtn.disabled = true;

    const thinkingDiv = document.createElement("div");
    thinkingDiv.className = "chat-message chat-ai";
    thinkingDiv.textContent = t("thinkingMsg");
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
      appendMessage("model", t("chatErrorMsg"));
    } finally {
      chatSendBtn.disabled = false;
    }
  });

  chatInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") chatSendBtn.click();
  });
}

/* ── i18n Translation Engine ───────────────────────────────────────────── */

const I18N = {
  "en-IN": {
    title: "Policy Reader",
    langLabel: "Language",
    protectionOn: "Protection On",
    protectionOff: "Protection Off",
    heroCopy: "Scan the current page or upload a document for a quick, readable safety check.",
    analyzeBtn: "Analyze This Page",
    latestBtn: "Open Latest Report",
    dangerScore: "Danger Score",
    risk: "Risk",
    readyToScan: "Ready to Scan",
    waitingAnalysis: "Waiting for analysis.",
    reputationScore: "Reputation Score",
    trust: "Trust",
    awaitingSite: "Awaiting Site Check",
    noReputation: "No reputation assessment yet.",
    loginSafety: "Login Safety",
    analyzeSite: "Analyze a site before entering credentials.",
    caution: "Caution",
    safe: "Safe",
    unsafe: "Unsafe",
    protected: "Protected",
    analyzed: "Analyzed",
    docImage: "Document / Image",
    dashboardTool: "Dashboard Tool",
    uploadToAnalyze: "Upload to analyze",
    dropLabel: "Drop image or PDF here",
    dropHint: "Or click to browse",
    analyzeDocBtn: "Analyze Document",
    summary: "Summary",
    keyPoints: "Key Points",
    risks: "Risks",
    accessibilityHint: "Accessibility Hint",
    docIntent: "Document Intent",
    extractedText: "Extracted Text",
    showRaw: "Show raw text ▾",
    hideRaw: "Hide raw text ▴",
    pageSummary: "Page Summary",
    waitingForScan: "Waiting for scan",
    analyzePlaceholder: "Analyze a page with terms, sign-in, consent, or payment language to populate this summary.",
    listenBtn: "Listen",
    stopBtn: "Stop",
    loadingBtn: "Loading...",
    siteReputation: "Site Reputation",
    noSiteClassified: "No site classified",
    reputationPlaceholder: "Reputation details will appear here after a scan.",
    askDoc: "Ask the Document",
    aiAssistant: "AI Assistant",
    chatWelcome: "Ask me anything about this agreement. You can ask in English, Hindi, or any supported Indian language!",
    chatPlaceholder: "Type your question...",
    testKnowledge: "Test Your Knowledge",
    quizMeta: "Quiz",
    generateQuiz: "Generate Quiz",
    generatingQuiz: "Generating...",
    nextQuestion: "Next Question",
    finishQuiz: "Finish",
    analyzingBtn: "Analyzing...",
    scanBlocked: "Scan blocked",
    preparing: "Preparing scan",
    scanning: "Scanning",
    checkingSite: "Checking site",
    noKeyPoints: "No key points extracted yet.",
    noBadHistory: "No verified bad history was identified from this analysis.",
    thinkingMsg: "Thinking...",
    chatErrorMsg: "Sorry, I couldn't process your request right now.",
    quizLoadingMsg: "Loading engaging quiz locally formatted for you...",
    quizFailedMsg: "Failed to generate quiz. Please try again.",
    analyzeFirstMsg: "Please analyze a document first!",
    quizCompleteMsg: "Great job! You've completed the quiz.",
  },
  "hi-IN": {
    title: "नीति पाठक",
    langLabel: "भाषा",
    protectionOn: "सुरक्षा चालू",
    protectionOff: "सुरक्षा बंद",
    heroCopy: "त्वरित सुरक्षा जाँच के लिए वर्तमान पृष्ठ स्कैन करें या दस्तावेज़ अपलोड करें।",
    analyzeBtn: "यह पृष्ठ विश्लेषण करें",
    latestBtn: "नवीनतम रिपोर्ट खोलें",
    dangerScore: "खतरा स्कोर",
    risk: "जोखिम",
    readyToScan: "स्कैन के लिए तैयार",
    waitingAnalysis: "विश्लेषण की प्रतीक्षा।",
    reputationScore: "प्रतिष्ठा स्कोर",
    trust: "विश्वास",
    awaitingSite: "साइट जाँच की प्रतीक्षा",
    noReputation: "अभी तक कोई प्रतिष्ठा मूल्यांकन नहीं।",
    loginSafety: "लॉगिन सुरक्षा",
    analyzeSite: "क्रेडेंशियल डालने से पहले साइट का विश्लेषण करें।",
    caution: "सावधानी",
    safe: "सुरक्षित",
    unsafe: "असुरक्षित",
    protected: "सुरक्षित",
    analyzed: "विश्लेषित",
    docImage: "दस्तावेज़ / छवि",
    dashboardTool: "डैशबोर्ड टूल",
    uploadToAnalyze: "विश्लेषण के लिए अपलोड करें",
    dropLabel: "यहाँ छवि या PDF छोड़ें",
    dropHint: "या ब्राउज़ करने के लिए क्लिक करें",
    analyzeDocBtn: "दस्तावेज़ विश्लेषण करें",
    summary: "सारांश",
    keyPoints: "मुख्य बिंदु",
    risks: "जोखिम",
    accessibilityHint: "पहुँच संकेत",
    docIntent: "दस्तावेज़ का उद्देश्य",
    extractedText: "निकाला गया पाठ",
    showRaw: "मूल पाठ दिखाएँ ▾",
    hideRaw: "मूल पाठ छिपाएँ ▴",
    pageSummary: "पृष्ठ सारांश",
    waitingForScan: "स्कैन की प्रतीक्षा",
    analyzePlaceholder: "सारांश देखने के लिए ऐसे पृष्ठ का विश्लेषण करें जिसमें नीति, लॉगिन, सहमति या भुगतान भाषा हो।",
    listenBtn: "सुनें",
    stopBtn: "रोकें",
    loadingBtn: "लोड हो रहा है...",
    siteReputation: "साइट प्रतिष्ठा",
    noSiteClassified: "कोई साइट वर्गीकृत नहीं",
    reputationPlaceholder: "स्कैन के बाद प्रतिष्ठा विवरण यहाँ दिखेगा।",
    askDoc: "दस्तावेज़ से पूछें",
    aiAssistant: "AI सहायक",
    chatWelcome: "इस समझौते के बारे में कुछ भी पूछें। आप हिंदी, अंग्रेज़ी या किसी भी भारतीय भाषा में पूछ सकते हैं!",
    chatPlaceholder: "अपना प्रश्न टाइप करें...",
    testKnowledge: "अपनी समझ जाँचें",
    quizMeta: "प्रश्नोत्तरी",
    generateQuiz: "प्रश्नोत्तरी बनाएँ",
    generatingQuiz: "बन रही है...",
    nextQuestion: "अगला प्रश्न",
    finishQuiz: "समाप्त करें",
    analyzingBtn: "विश्लेषण हो रहा है...",
    scanBlocked: "स्कैन अवरुद्ध",
    preparing: "स्कैन तैयार हो रही है",
    scanning: "स्कैन हो रही है",
    checkingSite: "साइट जाँच रहे हैं",
    noKeyPoints: "अभी तक कोई मुख्य बिंदु नहीं।",
    noBadHistory: "इस विश्लेषण में कोई ज्ञात नकारात्मक इतिहास नहीं मिला।",
    thinkingMsg: "सोच रहे हैं...",
    chatErrorMsg: "क्षमा करें, अभी आपका अनुरोध संसाधित नहीं हो सका।",
    quizLoadingMsg: "आपके लिए प्रश्नोत्तरी तैयार हो रही है...",
    quizFailedMsg: "प्रश्नोत्तरी बनाने में विफल। कृपया पुनः प्रयास करें।",
    analyzeFirstMsg: "पहले कोई दस्तावेज़ विश्लेषण करें!",
    quizCompleteMsg: "शाबाश! आपने प्रश्नोत्तरी पूरी कर ली।",
  },
  "mr-IN": {
    title: "धोरण वाचक",
    langLabel: "भाषा",
    protectionOn: "संरक्षण चालू",
    protectionOff: "संरक्षण बंद",
    heroCopy: "जलद सुरक्षा तपासणीसाठी सध्याचे पृष्ठ स्कॅन करा किंवा दस्तऐवज अपलोड करा.",
    analyzeBtn: "हे पृष्ठ तपासा",
    latestBtn: "नवीनतम अहवाल उघडा",
    dangerScore: "धोका गुण",
    risk: "धोका",
    readyToScan: "स्कॅनसाठी तयार",
    waitingAnalysis: "विश्लेषणाची प्रतीक्षा.",
    reputationScore: "प्रतिष्ठा गुण",
    trust: "विश्वास",
    awaitingSite: "साइट तपासणीची प्रतीक्षा",
    noReputation: "अद्याप कोणतेही प्रतिष्ठा मूल्यांकन नाही.",
    loginSafety: "लॉगिन सुरक्षा",
    analyzeSite: "क्रेडेन्शियल टाकण्यापूर्वी साइट तपासा.",
    caution: "सावधगिरी",
    safe: "सुरक्षित",
    unsafe: "असुरक्षित",
    protected: "संरक्षित",
    analyzed: "विश्लेषित",
    docImage: "दस्तऐवज / प्रतिमा",
    dashboardTool: "डॅशबोर्ड साधन",
    uploadToAnalyze: "तपासणीसाठी अपलोड करा",
    dropLabel: "येथे प्रतिमा किंवा PDF टाका",
    dropHint: "किंवा ब्राउझ करण्यासाठी क्लिक करा",
    analyzeDocBtn: "दस्तऐवज तपासा",
    summary: "सारांश",
    keyPoints: "मुख्य मुद्दे",
    risks: "धोके",
    accessibilityHint: "प्रवेशयोग्यता संकेत",
    docIntent: "दस्तऐवजाचा उद्देश",
    extractedText: "काढलेला मजकूर",
    showRaw: "मूळ मजकूर दाखवा ▾",
    hideRaw: "मूळ मजकूर लपवा ▴",
    pageSummary: "पृष्ठ सारांश",
    waitingForScan: "स्कॅनची प्रतीक्षा",
    analyzePlaceholder: "सारांश पाहण्यासाठी धोरण, लॉगिन किंवा सहमती असलेल्या पृष्ठाचे विश्लेषण करा.",
    listenBtn: "ऐका",
    stopBtn: "थांबवा",
    loadingBtn: "लोड होत आहे...",
    siteReputation: "साइट प्रतिष्ठा",
    noSiteClassified: "कोणतीही साइट वर्गीकृत नाही",
    reputationPlaceholder: "स्कॅननंतर प्रतिष्ठा तपशील येथे दिसेल.",
    askDoc: "दस्तऐवजाला विचारा",
    aiAssistant: "AI सहाय्यक",
    chatWelcome: "या करारासंबंधी काहीही विचारा. तुम्ही मराठी, हिंदी किंवा कोणत्याही भारतीय भाषेत विचारू शकता!",
    chatPlaceholder: "तुमचा प्रश्न टाइप करा...",
    testKnowledge: "तुमचे ज्ञान तपासा",
    quizMeta: "प्रश्नमंजुषा",
    generateQuiz: "प्रश्नमंजुषा तयार करा",
    generatingQuiz: "तयार होत आहे...",
    nextQuestion: "पुढील प्रश्न",
    finishQuiz: "संपवा",
    analyzingBtn: "विश्लेषण होत आहे...",
    scanBlocked: "स्कॅन अवरोधित",
    preparing: "स्कॅन तयार होत आहे",
    scanning: "स्कॅन होत आहे",
    checkingSite: "साइट तपासत आहे",
    noKeyPoints: "अद्याप कोणते मुख्य मुद्दे नाहीत.",
    noBadHistory: "या विश्लेषणात कोणताही नकारात्मक इतिहास आढळला नाही.",
    thinkingMsg: "विचार करत आहे...",
    chatErrorMsg: "क्षमस्व, आपली विनंती आत्ता प्रक्रिया करता येत नाही.",
    quizLoadingMsg: "तुमच्यासाठी प्रश्नमंजुषा तयार होत आहे...",
    quizFailedMsg: "प्रश्नमंजुषा तयार होऊ शकली नाही. पुन्हा प्रयत्न करा.",
    analyzeFirstMsg: "आधी एखादा दस्तऐवज विश्लेषित करा!",
    quizCompleteMsg: "शाबास! तुम्ही प्रश्नमंजुषा पूर्ण केली.",
  },
  "ta-IN": {
    title: "கொள்கை வாசிப்பான்",
    langLabel: "மொழி",
    protectionOn: "பாதுகாப்பு இயக்கத்தில்",
    protectionOff: "பாதுகாப்பு நிறுத்தத்தில்",
    heroCopy: "விரைவான பாதுகாப்பு சோதனைக்கு தற்போதைய பக்கத்தை ஸ்கேன் செய்யுங்கள் அல்லது ஆவணம் பதிவேற்றுங்கள்.",
    analyzeBtn: "இந்தப் பக்கத்தை பகுப்பாய்வு செய்",
    latestBtn: "சமீபத்திய அறிக்கையை திற",
    dangerScore: "அபாய மதிப்பெண்",
    risk: "அபாயம்",
    readyToScan: "ஸ்கேன் செய்ய தயார்",
    waitingAnalysis: "பகுப்பாய்வுக்காக காத்திருக்கிறது.",
    reputationScore: "நற்பெயர் மதிப்பெண்",
    trust: "நம்பகம்",
    awaitingSite: "தள சோதனைக்காக காத்திருக்கிறது",
    noReputation: "இன்னும் நற்பெயர் மதிப்பீடு இல்லை.",
    loginSafety: "உள்நுழைவு பாதுகாப்பு",
    analyzeSite: "நற்பெயர் சான்றுகளை உள்ளிடுவதற்கு முன் தளத்தை பகுப்பாய்வு செய்யுங்கள்.",
    caution: "எச்சரிக்கை",
    safe: "பாதுகாப்பானது",
    unsafe: "பாதுகாப்பற்றது",
    protected: "பாதுகாக்கப்பட்டது",
    analyzed: "பகுப்பாய்வு செய்யப்பட்டது",
    docImage: "ஆவணம் / படம்",
    dashboardTool: "டாஷ்போர்டு கருவி",
    uploadToAnalyze: "பகுப்பாய்வுக்கு பதிவேற்று",
    dropLabel: "படம் அல்லது PDF இங்கே இடுங்கள்",
    dropHint: "அல்லது உலாவ கிளிக் செய்யுங்கள்",
    analyzeDocBtn: "ஆவணத்தை பகுப்பாய்வு செய்",
    summary: "சுருக்கம்",
    keyPoints: "முக்கிய புள்ளிகள்",
    risks: "அபாயங்கள்",
    accessibilityHint: "அணுகல் குறிப்பு",
    docIntent: "ஆவண நோக்கம்",
    extractedText: "பிரித்தெடுக்கப்பட்ட உரை",
    showRaw: "மூல உரை காட்டு ▾",
    hideRaw: "மூல உரை மறை ▴",
    pageSummary: "பக்க சுருக்கம்",
    waitingForScan: "ஸ்கேனுக்காக காத்திருக்கிறது",
    analyzePlaceholder: "சுருக்கத்தை காண, விதிமுறை அல்லது ஒப்புதல் மொழி உள்ள பக்கத்தை பகுப்பாய்வு செய்யுங்கள்.",
    listenBtn: "கேளுங்கள்",
    stopBtn: "நிறுத்து",
    loadingBtn: "ஏற்றுகிறது...",
    siteReputation: "தள நற்பெயர்",
    noSiteClassified: "எந்த தளமும் வகைப்படுத்தப்படவில்லை",
    reputationPlaceholder: "ஸ்கேனுக்கு பிறகு நற்பெயர் விவரங்கள் இங்கே தோன்றும்.",
    askDoc: "ஆவணத்தை கேளுங்கள்",
    aiAssistant: "AI உதவியாளர்",
    chatWelcome: "இந்த ஒப்பந்தம் பற்றி எதுவும் கேளுங்கள். தமிழ், ஹிந்தி அல்லது எந்த இந்திய மொழியிலும் கேட்கலாம்!",
    chatPlaceholder: "உங்கள் கேள்வியை தட்டச்சு செய்யுங்கள்...",
    testKnowledge: "உங்கள் அறிவை சோதியுங்கள்",
    quizMeta: "வினாடி வினா",
    generateQuiz: "வினாடி வினா உருவாக்கு",
    generatingQuiz: "உருவாக்குகிறது...",
    nextQuestion: "அடுத்த கேள்வி",
    finishQuiz: "முடி",
    analyzingBtn: "பகுப்பாய்வு செய்கிறது...",
    scanBlocked: "ஸ்கேன் தடுக்கப்பட்டது",
    preparing: "ஸ்கேன் தயாரிக்கிறது",
    scanning: "ஸ்கேன் செய்கிறது",
    checkingSite: "தளத்தை சோதிக்கிறது",
    noKeyPoints: "இன்னும் முக்கிய புள்ளிகள் இல்லை.",
    noBadHistory: "இந்த பகுப்பாய்வில் மோசமான வரலாறு எதுவும் கண்டறியப்படவில்லை.",
    thinkingMsg: "யோசிக்கிறது...",
    chatErrorMsg: "மன்னிக்கவும், தற்போது உங்கள் கோரிக்கையை செயலாக்க முடியவில்லை.",
    quizLoadingMsg: "உங்களுக்காக வினாடி வினா தயாரிக்கிறது...",
    quizFailedMsg: "வினாடி வினா உருவாக்க முடியவில்லை. மீண்டும் முயற்சிக்கவும்.",
    analyzeFirstMsg: "முதலில் ஒரு ஆவணத்தை பகுப்பாய்வு செய்யுங்கள்!",
    quizCompleteMsg: "சபாஷ்! வினாடி வினாவை முடித்தீர்கள்.",
  },
  "te-IN": {
    title: "విధాన పాఠకుడు",
    langLabel: "భాష",
    protectionOn: "రక్షణ ఆన్",
    protectionOff: "రక్షణ ఆఫ్",
    heroCopy: "త్వరిత భద్రతా తనిఖీ కోసం ప్రస్తుత పేజీని స్కాన్ చేయండి లేదా పత్రాన్ని అప్‌లోడ్ చేయండి.",
    analyzeBtn: "ఈ పేజీని విశ్లేషించు",
    latestBtn: "తాజా నివేదికను తెరవు",
    dangerScore: "ప్రమాద స్కోరు",
    risk: "ప్రమాదం",
    readyToScan: "స్కాన్ చేయడానికి సిద్ధం",
    waitingAnalysis: "విశ్లేషణ కోసం వేచి ఉంది.",
    reputationScore: "ప్రతిష్ఠా స్కోరు",
    trust: "నమ్మకం",
    awaitingSite: "సైట్ తనిఖీ కోసం వేచి ఉంది",
    noReputation: "ఇంకా ప్రతిష్ఠా మూల్యాంకనం లేదు.",
    loginSafety: "లాగిన్ భద్రత",
    analyzeSite: "ఆధారపత్రాలు నమోదు చేయడానికి ముందు సైట్‌ని విశ్లేషించండి.",
    caution: "జాగ్రత్త",
    safe: "సురక్షితం",
    unsafe: "అసురక్షితం",
    protected: "రక్షించబడింది",
    analyzed: "విశ్లేషించబడింది",
    docImage: "పత్రం / చిత్రం",
    dashboardTool: "డాష్‌బోర్డ్ సాధనం",
    uploadToAnalyze: "విశ్లేషణ కోసం అప్‌లోడ్ చేయండి",
    dropLabel: "ఇక్కడ చిత్రం లేదా PDF వదలండి",
    dropHint: "లేదా బ్రౌజ్ చేయడానికి క్లిక్ చేయండి",
    analyzeDocBtn: "పత్రాన్ని విశ్లేషించు",
    summary: "సారాంశం",
    keyPoints: "ముఖ్య అంశాలు",
    risks: "ప్రమాదాలు",
    accessibilityHint: "యాక్సెసిబిలిటీ సూచన",
    docIntent: "పత్రం ఉద్దేశ్యం",
    extractedText: "సేకరించిన వచనం",
    showRaw: "మూల వచనం చూపు ▾",
    hideRaw: "మూల వచనం దాచు ▴",
    pageSummary: "పేజీ సారాంశం",
    waitingForScan: "స్కాన్ కోసం వేచి ఉంది",
    analyzePlaceholder: "సారాంశం చూడడానికి నిబంధనలు లేదా సమ్మతి భాష ఉన్న పేజీని విశ్లేషించండి.",
    listenBtn: "వినండి",
    stopBtn: "ఆపు",
    loadingBtn: "లోడ్ అవుతోంది...",
    siteReputation: "సైట్ ప్రతిష్ఠ",
    noSiteClassified: "సైట్ వర్గీకరించబడలేదు",
    reputationPlaceholder: "స్కాన్ తర్వాత ప్రతిష్ఠా వివరాలు ఇక్కడ కనిపిస్తాయి.",
    askDoc: "పత్రాన్ని అడగండి",
    aiAssistant: "AI సహాయకుడు",
    chatWelcome: "ఈ ఒప్పందం గురించి ఏదైనా అడగండి. తెలుగు, హిందీ లేదా ఏ భారతీయ భాషలోనైనా అడగవచ్చు!",
    chatPlaceholder: "మీ ప్రశ్నను టైప్ చేయండి...",
    testKnowledge: "మీ పరిజ్ఞానాన్ని పరీక్షించండి",
    quizMeta: "క్విజ్",
    generateQuiz: "క్విజ్ రూపొందించు",
    generatingQuiz: "రూపొందిస్తోంది...",
    nextQuestion: "తదుపరి ప్రశ్న",
    finishQuiz: "ముగించు",
    analyzingBtn: "విశ్లేషిస్తోంది...",
    scanBlocked: "స్కాన్ నిరోధించబడింది",
    preparing: "స్కాన్ సిద్ధమవుతోంది",
    scanning: "స్కాన్ చేస్తోంది",
    checkingSite: "సైట్ తనిఖీ చేస్తోంది",
    noKeyPoints: "ఇంకా ముఖ్య అంశాలు లేవు.",
    noBadHistory: "ఈ విశ్లేషణలో చెడు చరిత్ర ఏదీ కనుగొనబడలేదు.",
    thinkingMsg: "ఆలోచిస్తోంది...",
    chatErrorMsg: "క్షమించండి, మీ అభ్యర్థనను ప్రాసెస్ చేయలేకపోయాం.",
    quizLoadingMsg: "మీ కోసం క్విజ్ తయారవుతోంది...",
    quizFailedMsg: "క్విజ్ రూపొందించలేకపోయాం. దయచేసి మళ్ళీ ప్రయత్నించండి.",
    analyzeFirstMsg: "ముందు ఒక పత్రాన్ని విశ్లేషించండి!",
    quizCompleteMsg: "చాలా బాగు! క్విజ్ పూర్తి చేసారు.",
  },
  "bn-IN": {
    title: "নীতি পাঠক",
    langLabel: "ভাষা",
    protectionOn: "সুরক্ষা চালু",
    protectionOff: "সুরক্ষা বন্ধ",
    heroCopy: "দ্রুত নিরাপত্তা পরীক্ষার জন্য বর্তমান পৃষ্ঠা স্ক্যান করুন বা নথি আপলোড করুন।",
    analyzeBtn: "এই পৃষ্ঠা বিশ্লেষণ করুন",
    latestBtn: "সর্বশেষ প্রতিবেদন খুলুন",
    dangerScore: "বিপদ স্কোর",
    risk: "ঝুঁকি",
    readyToScan: "স্ক্যানের জন্য প্রস্তুত",
    waitingAnalysis: "বিশ্লেষণের অপেক্ষায়।",
    reputationScore: "সুনাম স্কোর",
    trust: "বিশ্বাস",
    awaitingSite: "সাইট পরীক্ষার অপেক্ষায়",
    noReputation: "এখনও কোনো সুনাম মূল্যায়ন নেই।",
    loginSafety: "লগইন নিরাপত্তা",
    analyzeSite: "পরিচয়পত্র প্রবেশের আগে সাইট বিশ্লেষণ করুন।",
    caution: "সতর্কতা",
    safe: "নিরাপদ",
    unsafe: "অনিরাপদ",
    protected: "সুরক্ষিত",
    analyzed: "বিশ্লেষিত",
    docImage: "নথি / ছবি",
    dashboardTool: "ড্যাশবোর্ড সরঞ্জাম",
    uploadToAnalyze: "বিশ্লেষণের জন্য আপলোড করুন",
    dropLabel: "এখানে ছবি বা PDF ফেলুন",
    dropHint: "অথবা ব্রাউজ করতে ক্লিক করুন",
    analyzeDocBtn: "নথি বিশ্লেষণ করুন",
    summary: "সারসংক্ষেপ",
    keyPoints: "মূল বিষয়",
    risks: "ঝুঁকি",
    accessibilityHint: "অ্যাক্সেসযোগ্যতা ইঙ্গিত",
    docIntent: "নথির উদ্দেশ্য",
    extractedText: "বের করা পাঠ্য",
    showRaw: "মূল পাঠ্য দেখান ▾",
    hideRaw: "মূল পাঠ্য গোপন করুন ▴",
    pageSummary: "পৃষ্ঠা সারসংক্ষেপ",
    waitingForScan: "স্ক্যানের অপেক্ষায়",
    analyzePlaceholder: "সারসংক্ষেপ দেখতে নীতি বা সম্মতি ভাষা সম্বলিত পৃষ্ঠা বিশ্লেষণ করুন।",
    listenBtn: "শুনুন",
    stopBtn: "থামুন",
    loadingBtn: "লোড হচ্ছে...",
    siteReputation: "সাইট সুনাম",
    noSiteClassified: "কোনো সাইট শ্রেণীভুক্ত নয়",
    reputationPlaceholder: "স্ক্যানের পরে সুনামের বিবরণ এখানে দেখাবে।",
    askDoc: "নথিকে জিজ্ঞাসা করুন",
    aiAssistant: "AI সহকারী",
    chatWelcome: "এই চুক্তি সম্পর্কে যেকোনো কিছু জিজ্ঞাসা করুন। বাংলা, হিন্দি বা যেকোনো ভারতীয় ভাষায় জিজ্ঞাসা করতে পারেন!",
    chatPlaceholder: "আপনার প্রশ্ন টাইপ করুন...",
    testKnowledge: "আপনার জ্ঞান পরীক্ষা করুন",
    quizMeta: "কুইজ",
    generateQuiz: "কুইজ তৈরি করুন",
    generatingQuiz: "তৈরি হচ্ছে...",
    nextQuestion: "পরবর্তী প্রশ্ন",
    finishQuiz: "শেষ করুন",
    analyzingBtn: "বিশ্লেষণ হচ্ছে...",
    scanBlocked: "স্ক্যান বাধাপ্রাপ্ত",
    preparing: "স্ক্যান প্রস্তুত হচ্ছে",
    scanning: "স্ক্যান হচ্ছে",
    checkingSite: "সাইট পরীক্ষা করছে",
    noKeyPoints: "এখনও কোনো মূল বিষয় নেই।",
    noBadHistory: "এই বিশ্লেষণে কোনো খারাপ ইতিহাস পাওয়া যায়নি।",
    thinkingMsg: "ভাবছে...",
    chatErrorMsg: "দুঃখিত, এই মুহূর্তে আপনার অনুরোধ প্রক্রিয়া করা সম্ভব নয়।",
    quizLoadingMsg: "আপনার জন্য কুইজ তৈরি হচ্ছে...",
    quizFailedMsg: "কুইজ তৈরি করা সম্ভব হয়নি। আবার চেষ্টা করুন।",
    analyzeFirstMsg: "প্রথমে একটি নথি বিশ্লেষণ করুন!",
    quizCompleteMsg: "চমৎকার! কুইজ সম্পন্ন হয়েছে।",
  },
  "gu-IN": {
    title: "નીતિ વાચક",
    langLabel: "ભાષા",
    protectionOn: "સુરક્ષા ચાલુ",
    protectionOff: "સુરક્ષા બંધ",
    heroCopy: "ઝડપી સલામતી તપાસ માટે વર્તમાન પૃષ્ઠ સ્કેન કરો અથવા દસ્તાવેજ અપલોડ કરો.",
    analyzeBtn: "આ પૃષ્ઠ વિશ્લેષણ કરો",
    latestBtn: "તાજો અહેવાલ ખોલો",
    dangerScore: "ભય સ્કોર",
    risk: "જોખમ",
    readyToScan: "સ્કેન માટે તૈયાર",
    waitingAnalysis: "વિશ્લેષણની રાહ.",
    reputationScore: "પ્રતિષ્ઠા સ્કોર",
    trust: "વિશ્વાસ",
    awaitingSite: "સાઇટ તપાસની રાહ",
    noReputation: "હજુ સુધી કોઈ પ્રતિષ્ઠા મૂલ્યાંકન નથી.",
    loginSafety: "લૉગિન સલામતી",
    analyzeSite: "ઓળખપત્ર દાખલ કરતા પહેલા સાઇટ વિશ્લેષણ કરો.",
    caution: "સાવધાની",
    safe: "સલામત",
    unsafe: "અસુરક્ષિત",
    protected: "સુરક્ષિત",
    analyzed: "વિશ્લેષિત",
    docImage: "દસ્તાવેજ / છબી",
    dashboardTool: "ડૅશબોર્ડ સાધન",
    uploadToAnalyze: "વિશ્લેષણ માટે અપલોડ કરો",
    dropLabel: "અહીં છબી અથવા PDF મૂકો",
    dropHint: "અથવા બ્રાઉઝ કરવા ક્લિક કરો",
    analyzeDocBtn: "દસ્તાવેજ વિશ્લેષણ કરો",
    summary: "સારાંશ",
    keyPoints: "મુખ્ય મુદ્દા",
    risks: "જોખમો",
    accessibilityHint: "સુલભતા સૂચન",
    docIntent: "દસ્તાવેજ હેતુ",
    extractedText: "કાઢેલ ટેક્સ્ટ",
    showRaw: "મૂળ ટેક્સ્ટ બતાવો ▾",
    hideRaw: "મૂળ ટેક્સ્ટ છુપાવો ▴",
    pageSummary: "પૃષ્ઠ સારાંશ",
    waitingForScan: "સ્કેનની રાહ",
    analyzePlaceholder: "સારાંશ જોવા, નિયમ અથવા સંમતિ ભાષા ધરાવતા પૃષ્ઠ વિશ્લેષણ કરો.",
    listenBtn: "સાંભળો",
    stopBtn: "રોકો",
    loadingBtn: "લોડ થઈ રહ્યું છે...",
    siteReputation: "સાઇટ પ્રતિષ્ઠા",
    noSiteClassified: "કોઈ સાઇટ વર્ગીકૃત નહીં",
    reputationPlaceholder: "સ્કેન પછી પ્રતિષ્ઠા વિગત અહીં દેખાશે.",
    askDoc: "દસ્તાવેજને પૂછો",
    aiAssistant: "AI સહાયક",
    chatWelcome: "આ કરાર વિશે ગમે તે પૂછો. ગુજરાતી, હિન્દી અથવા કોઈ પણ ભારતીય ભાષામાં પૂછી શકાય!",
    chatPlaceholder: "તમારો પ્રશ્ન ટાઇપ કરો...",
    testKnowledge: "તમારું જ્ઞાન ચકાસો",
    quizMeta: "ક્વિઝ",
    generateQuiz: "ક્વિઝ બનાવો",
    generatingQuiz: "બની રહ્યું છે...",
    nextQuestion: "આગળનો પ્રશ્ન",
    finishQuiz: "સમાપ્ત કરો",
    analyzingBtn: "વિશ્લેષણ થઈ રહ્યું છે...",
    scanBlocked: "સ્કેન અવરોધિત",
    preparing: "સ્કેન તૈયાર થઈ રહ્યું છે",
    scanning: "સ્કેન થઈ રહ્યું છે",
    checkingSite: "સાઇટ ચકાસી રહ્યું છે",
    noKeyPoints: "હજુ સુધી કોઈ મુખ્ય મુદ્દા નહીં.",
    noBadHistory: "આ વિશ્લેષણમાં કોઈ ખરાબ ઇતિહાસ મળ્યો નહીં.",
    thinkingMsg: "વિચારી રહ્યા છે...",
    chatErrorMsg: "માફ કરો, અત્યારે તમારી વિનંતી પ્રોસેસ કરી શકાઈ નહીં.",
    quizLoadingMsg: "તમારા માટે ક્વિઝ તૈયાર થઈ રહ્યું છે...",
    quizFailedMsg: "ક્વિઝ બનાવી ન શકાઈ. ફરી પ્રયાસ કરો.",
    analyzeFirstMsg: "પહેલા કોઈ દસ્તાવેજ વિશ્લેષણ કરો!",
    quizCompleteMsg: "શાબ્બાશ! ક્વિઝ પૂર્ણ થઈ.",
  },
  "kn-IN": {
    title: "ನೀತಿ ಓದುಗ",
    langLabel: "ಭಾಷೆ",
    protectionOn: "ರಕ್ಷಣೆ ಆನ್",
    protectionOff: "ರಕ್ಷಣೆ ಆಫ್",
    heroCopy: "ತ್ವರಿತ ಭದ್ರತಾ ಪರಿಶೀಲನೆಗಾಗಿ ಪ್ರಸ್ತುತ ಪುಟವನ್ನು ಸ್ಕ್ಯಾನ್ ಮಾಡಿ ಅಥವಾ ದಾಖಲೆ ಅಪ್‌ಲೋಡ್ ಮಾಡಿ.",
    analyzeBtn: "ಈ ಪುಟ ವಿಶ್ಲೇಷಿಸಿ",
    latestBtn: "ಇತ್ತೀಚಿನ ವರದಿ ತೆರೆಯಿರಿ",
    dangerScore: "ಅಪಾಯ ಸ್ಕೋರ್",
    risk: "ಅಪಾಯ",
    readyToScan: "ಸ್ಕ್ಯಾನ್‌ಗೆ ಸಿದ್ಧ",
    waitingAnalysis: "ವಿಶ್ಲೇಷಣೆಗಾಗಿ ಕಾಯುತ್ತಿದ್ದೇನೆ.",
    reputationScore: "ಖ್ಯಾತಿ ಸ್ಕೋರ್",
    trust: "ನಂಬಿಕೆ",
    awaitingSite: "ಸೈಟ್ ಪರಿಶೀಲನೆಗಾಗಿ ಕಾಯುತ್ತಿದ್ದೇನೆ",
    noReputation: "ಇನ್ನೂ ಯಾವುದೇ ಖ್ಯಾತಿ ಮೌಲ್ಯಮಾಪನ ಇಲ್ಲ.",
    loginSafety: "ಲಾಗಿನ್ ಭದ್ರತೆ",
    analyzeSite: "ರುಜುವಾತುಗಳನ್ನು ನಮೂದಿಸುವ ಮೊದಲು ಸೈಟ್ ವಿಶ್ಲೇಷಿಸಿ.",
    caution: "ಎಚ್ಚರಿಕೆ",
    safe: "ಸುರಕ್ಷಿತ",
    unsafe: "ಅಸುರಕ್ಷಿತ",
    protected: "ರಕ್ಷಿಸಲಾಗಿದೆ",
    analyzed: "ವಿಶ್ಲೇಷಿಸಲಾಗಿದೆ",
    docImage: "ದಾಖಲೆ / ಚಿತ್ರ",
    dashboardTool: "ಡ್ಯಾಶ್‌ಬೋರ್ಡ್ ಸಾಧನ",
    uploadToAnalyze: "ವಿಶ್ಲೇಷಣೆಗಾಗಿ ಅಪ್‌ಲೋಡ್ ಮಾಡಿ",
    dropLabel: "ಇಲ್ಲಿ ಚಿತ್ರ ಅಥವಾ PDF ಹಾಕಿ",
    dropHint: "ಅಥವಾ ಬ್ರೌಸ್ ಮಾಡಲು ಕ್ಲಿಕ್ ಮಾಡಿ",
    analyzeDocBtn: "ದಾಖಲೆ ವಿಶ್ಲೇಷಿಸಿ",
    summary: "ಸಾರಾಂಶ",
    keyPoints: "ಮುಖ್ಯ ಅಂಶಗಳು",
    risks: "ಅಪಾಯಗಳು",
    accessibilityHint: "ಪ್ರವೇಶ ಸೂಚನೆ",
    docIntent: "ದಾಖಲೆ ಉದ್ದೇಶ",
    extractedText: "ಹೊರತೆಗೆದ ಪಠ್ಯ",
    showRaw: "ಮೂಲ ಪಠ್ಯ ತೋರಿಸಿ ▾",
    hideRaw: "ಮೂಲ ಪಠ್ಯ ಮರೆಮಾಡಿ ▴",
    pageSummary: "ಪುಟ ಸಾರಾಂಶ",
    waitingForScan: "ಸ್ಕ್ಯಾನ್‌ಗಾಗಿ ಕಾಯುತ್ತಿದ್ದೇನೆ",
    analyzePlaceholder: "ಸಾರಾಂಶ ನೋಡಲು ನಿಯಮಗಳು ಅಥವಾ ಸಮ್ಮತಿ ಭಾಷೆ ಇರುವ ಪುಟ ವಿಶ್ಲೇಷಿಸಿ.",
    listenBtn: "ಆಲಿಸಿ",
    stopBtn: "ನಿಲ್ಲಿಸಿ",
    loadingBtn: "ಲೋಡ್ ಆಗುತ್ತಿದೆ...",
    siteReputation: "ಸೈಟ್ ಖ್ಯಾತಿ",
    noSiteClassified: "ಯಾವ ಸೈಟ್ ವರ್ಗೀಕರಿಸಲಾಗಿಲ್ಲ",
    reputationPlaceholder: "ಸ್ಕ್ಯಾನ್ ನಂತರ ಖ್ಯಾತಿ ವಿವರಗಳು ಇಲ್ಲಿ ಕಾಣಿಸುತ್ತವೆ.",
    askDoc: "ದಾಖಲೆಯನ್ನು ಕೇಳಿ",
    aiAssistant: "AI ಸಹಾಯಕ",
    chatWelcome: "ಈ ಒಪ್ಪಂದದ ಬಗ್ಗೆ ಏನಾದರು ಕೇಳಿ. ಕನ್ನಡ, ಹಿಂದಿ ಅಥವಾ ಯಾವುದೇ ಭಾರತೀಯ ಭಾಷೆಯಲ್ಲಿ ಕೇಳಬಹುದು!",
    chatPlaceholder: "ನಿಮ್ಮ ಪ್ರಶ್ನೆ ಟೈಪ್ ಮಾಡಿ...",
    testKnowledge: "ನಿಮ್ಮ ಜ್ಞಾನ ಪರೀಕ್ಷಿಸಿ",
    quizMeta: "ಕ್ವಿಜ್",
    generateQuiz: "ಕ್ವಿಜ್ ರಚಿಸಿ",
    generatingQuiz: "ರಚಿಸಲಾಗುತ್ತಿದೆ...",
    nextQuestion: "ಮುಂದಿನ ಪ್ರಶ್ನೆ",
    finishQuiz: "ಮುಗಿಸಿ",
    analyzingBtn: "ವಿಶ್ಲೇಷಿಸಲಾಗುತ್ತಿದೆ...",
    scanBlocked: "ಸ್ಕ್ಯಾನ್ ನಿರ್ಬಂಧಿಸಲಾಗಿದೆ",
    preparing: "ಸ್ಕ್ಯಾನ್ ತಯಾರಾಗುತ್ತಿದೆ",
    scanning: "ಸ್ಕ್ಯಾನ್ ಆಗುತ್ತಿದೆ",
    checkingSite: "ಸೈಟ್ ಪರಿಶೀಲಿಸಲಾಗುತ್ತಿದೆ",
    noKeyPoints: "ಇನ್ನೂ ಯಾವ ಮುಖ್ಯ ಅಂಶಗಳಿಲ್ಲ.",
    noBadHistory: "ಈ ವಿಶ್ಲೇಷಣೆಯಲ್ಲಿ ಕೆಟ್ಟ ಇತಿಹಾಸ ಕಂಡುಬಂದಿಲ್ಲ.",
    thinkingMsg: "ಯೋಚಿಸುತ್ತಿದ್ದೇನೆ...",
    chatErrorMsg: "ಕ್ಷಮಿಸಿ, ಈಗ ನಿಮ್ಮ ವಿನಂತಿ ಪ್ರಕ್ರಿಯೆ ಮಾಡಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ.",
    quizLoadingMsg: "ನಿಮಗಾಗಿ ಕ್ವಿಜ್ ತಯಾರಾಗುತ್ತಿದೆ...",
    quizFailedMsg: "ಕ್ವಿಜ್ ರಚಿಸಲು ವಿಫಲವಾಯಿತು. ದಯವಿಟ್ಟು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
    analyzeFirstMsg: "ಮೊದಲು ಒಂದು ದಾಖಲೆ ವಿಶ್ಲೇಷಿಸಿ!",
    quizCompleteMsg: "ಭೇಷ್! ಕ್ವಿಜ್ ಪೂರ್ಣಗೊಂಡಿದೆ.",
  },
  "ml-IN": {
    title: "നയം വായനക്കാരൻ",
    langLabel: "ഭാഷ",
    protectionOn: "സംരക്ഷണം ഓൺ",
    protectionOff: "സംരക്ഷണം ഓഫ്",
    heroCopy: "ദ്രുത സുരക്ഷാ പരിശോധനയ്ക്ക് നിലവിലെ പേജ് സ്കാൻ ചെയ്യുക അല്ലെങ്കിൽ പ്രമാണം അപ്‌ലോഡ് ചെയ്യുക.",
    analyzeBtn: "ഈ പേജ് വിശകലനം ചെയ്യുക",
    latestBtn: "ഏറ്റവും പുതിയ റിപ്പോർട്ട് തുറക്കുക",
    dangerScore: "അപകട സ്കോർ",
    risk: "അപകടം",
    readyToScan: "സ്കാൻ ചെയ്യാൻ തയ്യാർ",
    waitingAnalysis: "വിശകലനത്തിനായി കാത്തിരിക്കുന്നു.",
    reputationScore: "പ്രശസ്തി സ്കോർ",
    trust: "വിശ്വാസം",
    awaitingSite: "സൈറ്റ് പരിശോധനയ്ക്കായി കാത്തിരിക്കുന്നു",
    noReputation: "ഇതുവരെ പ്രശസ്തി വിലയിരുത്തൽ ഇല്ല.",
    loginSafety: "ലോഗിൻ സുരക്ഷ",
    analyzeSite: "ക്രെഡൻഷ്യൽ നൽകുന്നതിന് മുമ്പ് സൈറ്റ് വിശകലനം ചെയ്യുക.",
    caution: "ജാഗ്രത",
    safe: "സുരക്ഷിതം",
    unsafe: "അസുരക്ഷിതം",
    protected: "സംരക്ഷിതം",
    analyzed: "വിശകലനം ചെയ്തത്",
    docImage: "പ്രമാണം / ചിത്രം",
    dashboardTool: "ഡാഷ്‌ബോർഡ് ഉപകരണം",
    uploadToAnalyze: "വിശകലനത്തിനായി അപ്‌ലോഡ് ചെയ്യുക",
    dropLabel: "ഇവിടെ ചിത്രമോ PDF ഇടുക",
    dropHint: "അല്ലെങ്കിൽ ബ്രൗസ് ചെയ്യാൻ ക്ലിക്ക് ചെയ്യുക",
    analyzeDocBtn: "പ്രമാണം വിശകലനം ചെയ്യുക",
    summary: "സംക്ഷേപം",
    keyPoints: "മുഖ്യ കാര്യങ്ങൾ",
    risks: "അപകടങ്ങൾ",
    accessibilityHint: "പ്രവേശനക്ഷമതാ സൂചന",
    docIntent: "പ്രമാണ ഉദ്ദേശ്യം",
    extractedText: "വേർതിരിച്ച വാചകം",
    showRaw: "മൂല വാചകം കാണിക്കുക ▾",
    hideRaw: "മൂല വാചകം മറയ്ക്കുക ▴",
    pageSummary: "പേജ് സംക്ഷേപം",
    waitingForScan: "സ്കാനിനായി കാത്തിരിക്കുന്നു",
    analyzePlaceholder: "സംക്ഷേപം കാണാൻ നിബന്ധനകൾ അല്ലെങ്കിൽ സമ്മതഭാഷ ഉള്ള പേജ് വിശകലനം ചെയ്യുക.",
    listenBtn: "കേൾക്കുക",
    stopBtn: "നിർത്തുക",
    loadingBtn: "ലോഡ് ആകുന്നു...",
    siteReputation: "സൈറ്റ് പ്രശസ്തി",
    noSiteClassified: "ഒരു സൈറ്റും തരംതിരിച്ചിട്ടില്ല",
    reputationPlaceholder: "സ്കാനിന് ശേഷം പ്രശസ്തി വിശദാംശങ്ങൾ ഇവിടെ കാണിക്കും.",
    askDoc: "പ്രമാണം ചോദിക്കുക",
    aiAssistant: "AI സഹായി",
    chatWelcome: "ഈ കരാറിനെ കുറിച്ച് എന്തും ചോദിക്കുക. മലയാളം, ഹിന്ദി അല്ലെങ്കിൽ ഏത് ഇന്ത്യൻ ഭാഷയിലും ചോദിക്കാം!",
    chatPlaceholder: "നിങ്ങളുടെ ചോദ്യം ടൈപ്പ് ചെയ്യുക...",
    testKnowledge: "നിങ്ങളുടെ അറിവ് പരീക്ഷിക്കുക",
    quizMeta: "ക്വിസ്",
    generateQuiz: "ക്വിസ് ഉണ്ടാക്കുക",
    generatingQuiz: "ഉണ്ടാക്കുന്നു...",
    nextQuestion: "അടുത്ത ചോദ്യം",
    finishQuiz: "അവസാനിപ്പിക്കുക",
    analyzingBtn: "വിശകലനം ചെയ്യുന്നു...",
    scanBlocked: "സ്കാൻ തടഞ്ഞു",
    preparing: "സ്കാൻ തയ്യാറാകുന്നു",
    scanning: "സ്കാൻ ചെയ്യുന്നു",
    checkingSite: "സൈറ്റ് പരിശോധിക്കുന്നു",
    noKeyPoints: "ഇതുവരെ മുഖ്യ കാര്യങ്ങൾ ഇല്ല.",
    noBadHistory: "ഈ വിശകലനത്തിൽ മോശം ചരിത്രം കണ്ടെത്തിയില്ല.",
    thinkingMsg: "ചിന്തിക്കുന്നു...",
    chatErrorMsg: "ക്ഷമിക്കണം, ഇപ്പോൾ നിങ്ങളുടെ അഭ്യർത്ഥന പ്രോസസ് ചെയ്യാൻ കഴിഞ്ഞില്ല.",
    quizLoadingMsg: "നിങ്ങൾക്കായി ക്വിസ് തയ്യാറാകുന്നു...",
    quizFailedMsg: "ക്വിസ് ഉണ്ടാക്കാൻ കഴിഞ്ഞില്ല. വീണ്ടും ശ്രമിക്കുക.",
    analyzeFirstMsg: "ആദ്യം ഒരു പ്രമാണം വിശകലനം ചെയ്യുക!",
    quizCompleteMsg: "ഗംഭീരം! ക്വിസ് പൂർത്തിയായി.",
  },
  "pa-IN": {
    title: "ਨੀਤੀ ਪਾਠਕ",
    langLabel: "ਭਾਸ਼ਾ",
    protectionOn: "ਸੁਰੱਖਿਆ ਚਾਲੂ",
    protectionOff: "ਸੁਰੱਖਿਆ ਬੰਦ",
    heroCopy: "ਤੇਜ਼ ਸੁਰੱਖਿਆ ਜਾਂਚ ਲਈ ਮੌਜੂਦਾ ਪੰਨਾ ਸਕੈਨ ਕਰੋ ਜਾਂ ਦਸਤਾਵੇਜ਼ ਅਪਲੋਡ ਕਰੋ।",
    analyzeBtn: "ਇਹ ਪੰਨਾ ਵਿਸ਼ਲੇਸ਼ਣ ਕਰੋ",
    latestBtn: "ਤਾਜ਼ੀ ਰਿਪੋਰਟ ਖੋਲ੍ਹੋ",
    dangerScore: "ਖਤਰਾ ਸਕੋਰ",
    risk: "ਖਤਰਾ",
    readyToScan: "ਸਕੈਨ ਲਈ ਤਿਆਰ",
    waitingAnalysis: "ਵਿਸ਼ਲੇਸ਼ਣ ਦੀ ਉਡੀਕ।",
    reputationScore: "ਪ੍ਰਤਿਸ਼ਠਾ ਸਕੋਰ",
    trust: "ਭਰੋਸਾ",
    awaitingSite: "ਸਾਈਟ ਜਾਂਚ ਦੀ ਉਡੀਕ",
    noReputation: "ਅਜੇ ਕੋਈ ਪ੍ਰਤਿਸ਼ਠਾ ਮੁਲਾਂਕਣ ਨਹੀਂ।",
    loginSafety: "ਲੌਗਇਨ ਸੁਰੱਖਿਆ",
    analyzeSite: "ਪ੍ਰਮਾਣ ਪੱਤਰ ਦਾਖਲ ਕਰਨ ਤੋਂ ਪਹਿਲਾਂ ਸਾਈਟ ਵਿਸ਼ਲੇਸ਼ਣ ਕਰੋ।",
    caution: "ਸਾਵਧਾਨੀ",
    safe: "ਸੁਰੱਖਿਅਤ",
    unsafe: "ਅਸੁਰੱਖਿਅਤ",
    protected: "ਸੁਰੱਖਿਅਤ",
    analyzed: "ਵਿਸ਼ਲੇਸ਼ਣ ਕੀਤਾ",
    docImage: "ਦਸਤਾਵੇਜ਼ / ਚਿੱਤਰ",
    dashboardTool: "ਡੈਸ਼ਬੋਰਡ ਸੰਦ",
    uploadToAnalyze: "ਵਿਸ਼ਲੇਸ਼ਣ ਲਈ ਅਪਲੋਡ ਕਰੋ",
    dropLabel: "ਇੱਥੇ ਚਿੱਤਰ ਜਾਂ PDF ਸੁੱਟੋ",
    dropHint: "ਜਾਂ ਬ੍ਰਾਊਜ਼ ਕਰਨ ਲਈ ਕਲਿੱਕ ਕਰੋ",
    analyzeDocBtn: "ਦਸਤਾਵੇਜ਼ ਵਿਸ਼ਲੇਸ਼ਣ ਕਰੋ",
    summary: "ਸੰਖੇਪ",
    keyPoints: "ਮੁੱਖ ਨੁਕਤੇ",
    risks: "ਖਤਰੇ",
    accessibilityHint: "ਪਹੁੰਚਯੋਗਤਾ ਸੰਕੇਤ",
    docIntent: "ਦਸਤਾਵੇਜ਼ ਦਾ ਉਦੇਸ਼",
    extractedText: "ਕੱਢਿਆ ਗਿਆ ਪਾਠ",
    showRaw: "ਮੂਲ ਪਾਠ ਦਿਖਾਓ ▾",
    hideRaw: "ਮੂਲ ਪਾਠ ਛੁਪਾਓ ▴",
    pageSummary: "ਪੰਨਾ ਸੰਖੇਪ",
    waitingForScan: "ਸਕੈਨ ਦੀ ਉਡੀਕ",
    analyzePlaceholder: "ਸੰਖੇਪ ਦੇਖਣ ਲਈ ਨਿਯਮ ਜਾਂ ਸਹਿਮਤੀ ਭਾਸ਼ਾ ਵਾਲੇ ਪੰਨੇ ਦਾ ਵਿਸ਼ਲੇਸ਼ਣ ਕਰੋ।",
    listenBtn: "ਸੁਣੋ",
    stopBtn: "ਰੋਕੋ",
    loadingBtn: "ਲੋਡ ਹੋ ਰਿਹਾ ਹੈ...",
    siteReputation: "ਸਾਈਟ ਪ੍ਰਤਿਸ਼ਠਾ",
    noSiteClassified: "ਕੋਈ ਸਾਈਟ ਸ਼੍ਰੇਣੀਬੱਧ ਨਹੀਂ",
    reputationPlaceholder: "ਸਕੈਨ ਤੋਂ ਬਾਅਦ ਪ੍ਰਤਿਸ਼ਠਾ ਵੇਰਵਾ ਇੱਥੇ ਦਿਖੇਗਾ।",
    askDoc: "ਦਸਤਾਵੇਜ਼ ਤੋਂ ਪੁੱਛੋ",
    aiAssistant: "AI ਸਹਾਇਕ",
    chatWelcome: "ਇਸ ਸਮਝੌਤੇ ਬਾਰੇ ਕੁਝ ਵੀ ਪੁੱਛੋ। ਪੰਜਾਬੀ, ਹਿੰਦੀ ਜਾਂ ਕਿਸੇ ਵੀ ਭਾਰਤੀ ਭਾਸ਼ਾ ਵਿੱਚ ਪੁੱਛੋ!",
    chatPlaceholder: "ਆਪਣਾ ਸਵਾਲ ਟਾਈਪ ਕਰੋ...",
    testKnowledge: "ਆਪਣਾ ਗਿਆਨ ਜਾਂਚੋ",
    quizMeta: "ਕੁਇਜ਼",
    generateQuiz: "ਕੁਇਜ਼ ਬਣਾਓ",
    generatingQuiz: "ਬਣਾਇਆ ਜਾ ਰਿਹਾ ਹੈ...",
    nextQuestion: "ਅਗਲਾ ਸਵਾਲ",
    finishQuiz: "ਸਮਾਪਤ ਕਰੋ",
    analyzingBtn: "ਵਿਸ਼ਲੇਸ਼ਣ ਹੋ ਰਿਹਾ ਹੈ...",
    scanBlocked: "ਸਕੈਨ ਰੋਕਿਆ ਗਿਆ",
    preparing: "ਸਕੈਨ ਤਿਆਰ ਹੋ ਰਿਹਾ ਹੈ",
    scanning: "ਸਕੈਨ ਹੋ ਰਿਹਾ ਹੈ",
    checkingSite: "ਸਾਈਟ ਜਾਂਚ ਰਿਹਾ ਹੈ",
    noKeyPoints: "ਅਜੇ ਕੋਈ ਮੁੱਖ ਨੁਕਤੇ ਨਹੀਂ।",
    noBadHistory: "ਇਸ ਵਿਸ਼ਲੇਸ਼ਣ ਵਿੱਚ ਕੋਈ ਮਾੜਾ ਇਤਿਹਾਸ ਨਹੀਂ ਮਿਲਿਆ।",
    thinkingMsg: "ਸੋਚ ਰਿਹਾ ਹੈ...",
    chatErrorMsg: "ਮਾਫ਼ ਕਰਨਾ, ਹੁਣੇ ਤੁਹਾਡੀ ਬੇਨਤੀ ਪ੍ਰਕਿਰਿਆ ਨਹੀਂ ਕਰ ਸਕੇ।",
    quizLoadingMsg: "ਤੁਹਾਡੇ ਲਈ ਕੁਇਜ਼ ਤਿਆਰ ਹੋ ਰਿਹਾ ਹੈ...",
    quizFailedMsg: "ਕੁਇਜ਼ ਨਹੀਂ ਬਣ ਸਕੀ। ਦੁਬਾਰਾ ਕੋਸ਼ਿਸ਼ ਕਰੋ।",
    analyzeFirstMsg: "ਪਹਿਲਾਂ ਕੋਈ ਦਸਤਾਵੇਜ਼ ਵਿਸ਼ਲੇਸ਼ਣ ਕਰੋ!",
    quizCompleteMsg: "ਸ਼ਾਬਾਸ਼! ਕੁਇਜ਼ ਮੁਕੰਮਲ ਹੋ ਗਈ।",
  },
};

/**
 * Returns the active i18n strings for a given language code.
 * Falls back to English if the language is not found.
 */
function t(key) {
  const lang = globalLang ? globalLang.value : "en-IN";
  const dict = I18N[lang] || I18N["en-IN"];
  return dict[key] || I18N["en-IN"][key] || key;
}

/**
 * Walk the DOM and swap all data-i18n / data-i18n-placeholder elements.
 * Elements with data-i18n-on / data-i18n-off are skipped (handled by applyProtectionUI).
 */
function applyI18n() {
  // Standard text nodes
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    // Skip the protection-label — it has its own on/off logic
    if (el.hasAttribute("data-i18n-on")) return;
    el.textContent = t(el.getAttribute("data-i18n"));
  });

  // Input placeholders
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    el.placeholder = t(el.getAttribute("data-i18n-placeholder"));
  });

  // Re-sync protection label text based on its current state
  if (protectionLabel) {
    const isOn = protectionToggle && protectionToggle.classList.contains("is-on");
    protectionLabel.textContent = isOn ? t("protectionOn") : t("protectionOff");
  }
}

/* ── Global Language Selector ──────────────────────────────────────────── */

/**
 * Apply a language value: sync service selects, fonts, i18n, and persist.
 */
function applyGlobalLang(langValue) {
  // Sync all hidden service selects
  [ttsLang, chatLang, quizLang].forEach((sel) => {
    if (sel) sel.value = langValue;
  });

  // Font adjustment for scripts using Devanagari or other Indian scripts
  const devanagariLangs = ["hi-IN", "mr-IN"];
  if (devanagariLangs.includes(langValue)) {
    document.body.style.fontFamily = "'Noto Sans Devanagari', 'Space Grotesk', sans-serif";
    document.body.style.fontWeight = "500";
  } else {
    document.body.style.fontFamily = "'Space Grotesk', sans-serif";
    document.body.style.fontWeight = "400";
  }

  // Apply full UI translation
  applyI18n();

  // Persist to storage
  chrome.storage.local.set({ globalLangCode: langValue });
}

function setupGlobalLang() {
  if (!globalLang) return;

  // Restore saved language preference
  chrome.storage.local.get(["globalLangCode"], (data) => {
    if (data.globalLangCode) {
      globalLang.value = data.globalLangCode;
      applyGlobalLang(data.globalLangCode);
    }
  });

  globalLang.addEventListener("change", () => {
    if (isListening) stopSpeechRecognition();
    applyGlobalLang(globalLang.value);
  });
}


let isPlaying = false;
if (ttsPlayBtn) {
  ttsPlayBtn.addEventListener("click", async () => {
  if (isPlaying) {
    ttsAudio.pause();
    isPlaying = false;
    ttsPlayBtn.textContent = t("listenBtn");
    return;
  }

  const textToSay = analysisSummary.textContent;
  // Guard: don't TTS the placeholder text (check all language variants)
  const isPlaceholder = !textToSay || Object.values(I18N).some((d) => d["analyzePlaceholder"] === textToSay);
  if (isPlaceholder) return;

  ttsPlayBtn.disabled = true;
  ttsPlayBtn.textContent = t("loadingBtn");

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
    ttsPlayBtn.textContent = t("stopBtn");

    ttsAudio.onended = () => {
      isPlaying = false;
      ttsPlayBtn.textContent = t("listenBtn");
    };
  } catch (err) {
    console.error(err);
    alert("Could not load audio. Try again.");
  } finally {
    ttsPlayBtn.disabled = false;
    if (!isPlaying) ttsPlayBtn.textContent = t("listenBtn");
  }
  });
}

if (protectionToggle) protectionToggle.addEventListener("click", toggleProtection);
if (openLatestBtn) openLatestBtn.addEventListener("click", openLatestReport);
if (analyzeCurrentBtn) analyzeCurrentBtn.addEventListener("click", analyzeCurrentTab);

/* ── Interactive Quiz Logic ────────────────────────────────────────── */
function renderQuizQuestion(index) {
  if (!currentQuizData || currentQuizData.length === 0) return;
  if (index >= currentQuizData.length) {
    quizQuestionText.textContent = t("quizCompleteMsg");
    quizOptA.style.display = "none";
    quizOptB.style.display = "none";
    quizExplanationBox.style.display = "none";
    quizNextBtn.style.display = "none";
    return;
  }

  const q = currentQuizData[index];
  quizQuestionText.textContent = `Q${index + 1}: ${q.question}`;
  quizOptA.textContent = `A) ${q.option_a}`;
  quizOptB.textContent = `B) ${q.option_b}`;

  // Reset states
  quizOptA.style.display = "block";
  quizOptB.style.display = "block";
  quizOptA.style.borderColor = "#e2e8f0";
  quizOptA.style.background = "#fff";
  quizOptA.style.color = "#334155";
  quizOptA.disabled = false;

  quizOptB.style.borderColor = "#e2e8f0";
  quizOptB.style.background = "#fff";
  quizOptB.style.color = "#334155";
  quizOptB.disabled = false;

  quizExplanationBox.style.display = "none";
  quizNextBtn.style.display = "none";
}

function handleQuizAnswer(selectedOpt, btnEl) {
  const q = currentQuizData[currentQuizIndex];
  const isCorrect = (selectedOpt === q.correct_option);

  quizOptA.disabled = true;
  quizOptB.disabled = true;

  if (isCorrect) {
    btnEl.style.borderColor = "#16a34a";
    btnEl.style.background = "#dcfce7";
    btnEl.style.color = "#166534";
  } else {
    btnEl.style.borderColor = "#dc2626";
    btnEl.style.background = "#fee2e2";
    btnEl.style.color = "#991b1b";

    const correctBtn = (q.correct_option === "A") ? quizOptA : quizOptB;
    correctBtn.style.borderColor = "#16a34a";
  }

  quizExplanationBox.textContent = q.explanation;
  quizExplanationBox.style.display = "block";

  if (currentQuizIndex < currentQuizData.length - 1) {
    quizNextBtn.style.display = "block";
  } else {
    quizNextBtn.textContent = t("finishQuiz");
    quizNextBtn.style.display = "block";
    quizNextBtn.onclick = () => { renderQuizQuestion(999); };
  }
}

if (quizGenerateBtn) {
  quizGenerateBtn.addEventListener("click", async () => {
    if (!latestOriginalText) {
      alert(t("analyzeFirstMsg"));
      return;
    }

    quizContainer.style.display = "flex";
    quizQuestionText.textContent = t("quizLoadingMsg");
    quizOptA.style.display = "none";
    quizOptB.style.display = "none";
    quizExplanationBox.style.display = "none";
    quizNextBtn.style.display = "none";
    quizGenerateBtn.disabled = true;
    quizGenerateBtn.textContent = t("generatingQuiz");

    try {
      const res = await fetch(`${BACKEND_URL}/api/generate-quiz`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          document_context: latestOriginalText,
          language_code: quizLang.value
        })
      });
      if (!res.ok) throw new Error("Quiz generation failed.");

      const data = await res.json();
      if (data && data.questions && data.questions.length > 0) {
        currentQuizData = data.questions;
        currentQuizIndex = 0;
        renderQuizQuestion(0);
      } else {
        throw new Error("No questions retrieved.");
      }
    } catch (err) {
      console.error(err);
      quizQuestionText.textContent = t("quizFailedMsg");
    } finally {
      quizGenerateBtn.disabled = false;
      quizGenerateBtn.textContent = t("generateQuiz");
    }
  });
}

if (quizOptA) quizOptA.addEventListener("click", () => handleQuizAnswer("A", quizOptA));
if (quizOptB) quizOptB.addEventListener("click", () => handleQuizAnswer("B", quizOptB));

if (quizNextBtn) {
  quizNextBtn.addEventListener("click", () => {
    if (quizNextBtn.textContent === "Finish") return;
    currentQuizIndex++;
    renderQuizQuestion(currentQuizIndex);
  });
}

if (openDashboardBtn) openDashboardBtn.addEventListener("click", openDashboard);
if (openLatestBtn) openLatestBtn.addEventListener("click", openLatestReport);
if (analyzeCurrentBtn) analyzeCurrentBtn.addEventListener("click", analyzeCurrentTab);
if (footerLink) {
  footerLink.addEventListener("click", (event) => {
    event.preventDefault();
    openDashboard();
  });
}

loadProtectionState();
loadStats();
setAnalysisState({});
restoreLatestAnalysis();
setupSpeechRecognition();
setupGlobalLang();

// ── Document / Image Upload Feature ───────────────────────────────────────────

(function initDocUpload() {
  const VISION_API_URL = `${BACKEND_URL}/api/analyze-document`;

  const dropZone = document.getElementById("drop-zone");
  const fileInput = document.getElementById("doc-file-input");
  const filePreview = document.getElementById("doc-file-preview");
  const previewImg = document.getElementById("doc-preview-img");
  const fileNameEl = document.getElementById("doc-file-name");
  const docStatus = document.getElementById("doc-status");
  const analyzeBtn = document.getElementById("doc-analyze-btn");
  const docResults = document.getElementById("doc-results");
  const docSummary = document.getElementById("doc-summary");
  const docKeyPoints = document.getElementById("doc-key-points");
  const docRisks = document.getElementById("doc-risks");
  const docHint = document.getElementById("doc-hint");
  const docIntent = document.getElementById("doc-intent");
  const extractedText = document.getElementById("doc-extracted-text");
  const extractedToggle = document.getElementById("doc-extracted-toggle");

  if (!dropZone || !fileInput || !filePreview || !previewImg || !fileNameEl || !docStatus || !analyzeBtn || !docResults || !docSummary || !docKeyPoints || !docRisks || !docHint || !docIntent || !extractedText || !extractedToggle) {
    return;
  }

  let selectedFile = null;

  // ── Drag-and-drop visual feedback ──────────────────────────────────
  dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.classList.add("drag-over");
  });

  dropZone.addEventListener("dragleave", () => {
    dropZone.classList.remove("drag-over");
  });

  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.classList.remove("drag-over");
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelected(file);
  });

  // ── File input change ───────────────────────────────────────────────
  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    if (file) handleFileSelected(file);
  });

  // ── Handle a selected file ──────────────────────────────────────────
  function handleFileSelected(file) {
    const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"];
    if (!ALLOWED.includes(file.type)) {
      setStatus("Unsupported file type. Use JPG, PNG, WEBP, HEIC, or PDF.", "error");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setStatus("File too large (max 20 MB).", "error");
      return;
    }

    selectedFile = file;
    setStatus("");

    // Reset previous results
    docResults.classList.remove("visible");

    // Show file name
    fileNameEl.textContent = file.name;
    filePreview.style.display = "block";

    // Show image preview or PDF icon
    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (e) => { previewImg.src = e.target.result; previewImg.style.display = "block"; };
      reader.readAsDataURL(file);
    } else {
      previewImg.style.display = "none";
    }

    analyzeBtn.disabled = false;
  }

  // ── Analyze button click ────────────────────────────────────────────
  analyzeBtn.addEventListener("click", async () => {
    if (!selectedFile) return;

    analyzeBtn.disabled = true;
    analyzeBtn.textContent = t("analyzingBtn");
    setStatus("Sending to Vision AI — this may take a few seconds…", "loading");
    docResults.classList.remove("visible");

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const response = await fetch(VISION_API_URL, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        let detail = `Error ${response.status}`;
        try { const j = await response.json(); detail = j.detail || detail; } catch (_) { }
        throw new Error(detail);
      }

      const data = await response.json();
      renderResults(data);
      setStatus("");
    } catch (err) {
      setStatus(`Analysis failed: ${err.message}`, "error");
    } finally {
      analyzeBtn.disabled = false;
      analyzeBtn.textContent = t("analyzeDocBtn");
    }
  });

  // ── Render analysis results ─────────────────────────────────────────
  function renderResults(data) {
    docSummary.textContent = data.summary || "—";

    renderList(docKeyPoints, data.key_points || [], false);
    renderList(docRisks, data.risks || [], true);

    docHint.textContent = data.accessibility_hint || "—";
    docIntent.textContent = data.intent || "—";

    extractedText.textContent = data.extracted_text || "—";
    extractedText.classList.remove("open");
    extractedToggle.textContent = "Show raw text ▾";

    docResults.classList.add("visible");

    // Scroll section into view
    docResults.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function renderList(ulEl, items, isRisk) {
    ulEl.innerHTML = "";
    if (!items.length) {
      const li = document.createElement("li");
      li.textContent = isRisk ? t("noBadHistory") : t("noKeyPoints");
      ulEl.appendChild(li);
      return;
    }
    items.forEach((text) => {
      const li = document.createElement("li");
      li.textContent = text;
      ulEl.appendChild(li);
    });
  }

  // ── Extracted text toggle ───────────────────────────────────────────
  extractedToggle.addEventListener("click", () => {
    const open = extractedText.classList.toggle("open");
    extractedToggle.textContent = open ? t("hideRaw") : t("showRaw");
  });

  // ── Status helper ───────────────────────────────────────────────────
  function setStatus(msg, type = "") {
    docStatus.textContent = msg;
    docStatus.className = "doc-status" + (type ? ` ${type}` : "");
  }
})();

// ── Welcome & Onboarding Logic ─────────────────────────────────────────
(function initWelcome() {
  const welcomeScreen = document.getElementById("welcome-screen");
  const onboardScreen = document.getElementById("onboarding-screen");
  const mainApp = document.getElementById("main-app");
  const getStartedBtn = document.getElementById("get-started-btn");
  const finishSetupBtn = document.getElementById("finish-setup-btn");
  const chips = document.querySelectorAll(".onboard-chip");

  if (welcomeScreen && onboardScreen && mainApp && getStartedBtn && finishSetupBtn) {
    chrome.storage.local.get(["hasSeenWelcome"], (data) => {
      if (data.hasSeenWelcome) {
        welcomeScreen.style.display = "none";
        onboardScreen.style.display = "none";
        mainApp.style.display = "block";
      } else {
        welcomeScreen.style.display = "flex";
        onboardScreen.style.display = "none";
        mainApp.style.display = "none";
      }
    });

    getStartedBtn.addEventListener("click", () => {
      welcomeScreen.style.display = "none";
      onboardScreen.style.display = "flex";
    });

    finishSetupBtn.addEventListener("click", () => {
      // Dummy step: no need to save name/email/selections for now.
      chrome.storage.local.set({ hasSeenWelcome: true });
      onboardScreen.style.display = "none";
      mainApp.style.display = "block";
    });

    // Chip toggling
    chips.forEach(chip => {
      chip.addEventListener("click", () => {
        // Toggle this chip
        chip.classList.toggle("selected");

        // If they select "Equal Importance", maybe deselect others, but for a dummy form it's fine just to toggle.
        if (chip.textContent === "Equal Importance" && chip.classList.contains("selected")) {
          chips.forEach(c => { if (c !== chip) c.classList.remove("selected"); });
        } else if (chip.classList.contains("selected")) {
          // If they select anything else, remove Equal Importance
          const equalChip = Array.from(chips).find(c => c.textContent === "Equal Importance");
          if (equalChip) equalChip.classList.remove("selected");
        }
      });
    });
  }
})();
