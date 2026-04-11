"use strict";

const WEB_APP_URL = "http://localhost:3000";
const BACKEND_URL = "http://localhost:8000";
const ANALYZE_API_URL = `${BACKEND_URL}/api/extension/analyze`;
const FALLBACK_REPORT_URL = `${BACKEND_URL}/dashboard`;
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
      color: "#ef4444",
      copy: "This page contains risky or harmful language.",
    };
  }
  if (score >= 40) {
    return {
      title: "Use caution",
      color: "#f59e0b",
      copy: "Important terms need a careful read before you proceed.",
    };
  }
  return {
    title: "Lower danger",
    color: "#22c55e",
    copy: "No major risk signals were found in the visible text.",
  };
}

function getReputationTheme(score) {
  if (score >= 75) {
    return {
      title: "Strong reputation",
      color: "#22c55e",
      copy: "The site appears more trustworthy overall.",
    };
  }
  if (score >= 40) {
    return {
      title: "Mixed reputation",
      color: "#f59e0b",
      copy: "The site may be acceptable, but it deserves extra review.",
    };
  }
  return {
    title: "Poor reputation",
    color: "#ef4444",
    copy: "The site shows weak trust signals or concerning patterns.",
  };
}

function updateRing(ring, valueEl, score, color) {
  if (!ring || !valueEl || typeof score !== "number" || Number.isNaN(score)) {
    if (valueEl) valueEl.textContent = "--";
    if (ring) {
      ring.style.setProperty("--ring-angle", "8deg");
      ring.style.setProperty("--ring-color", "#38bdf8");
    }
    return;
  }

  const clamped = Math.max(0, Math.min(100, score));
  valueEl.textContent = String(clamped);
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
    updateRing(dangerRing, dangerValue, undefined);
    updateRing(reputationRing, reputationValue, undefined);
    setLoginSafety("Caution", "Hold on while the site is being analyzed.");
    renderPointList(summaryPoints, [], "Preparing a readable summary...", "chip");
    renderPointList(reputationExamples, [], "Checking for known reputation concerns...", "list-item");
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

function getLoginSafetyText(data) {
  const safety = (data.login_safety || "").toLowerCase();
  if (safety === "unsafe") {
    return "Not safe to log in right now. Avoid entering credentials until the site is verified.";
  }
  if (safety === "safe") {
    return "Looks reasonably safe for login, but still verify the domain before signing in.";
  }
  return "Use caution before logging in. Check the domain, terms, and data practices first.";
}

function renderAnalysis(data, sourceMeta) {
  setAnalysisState({
    meta: sourceMeta,
    intent: data.intent || "Unknown intent",
    summary: data.summary || "Summary unavailable.",
    keyPoints: data.key_points || [],
    dangerScore: data.danger_score,
    reputationScore: data.reputation_score,
    reputation: data.reputation_summary || "No reputation summary available.",
    reputationExamples: data.reputation_examples || [],
    loginSafety: data.login_safety || "Caution",
    loginSafetyText: getLoginSafetyText(data),
  });

  chrome.storage.local.set({
    latestDashboardUrl: data.dashboard_url,
    latestSummary: data.summary || "",
    latestIntent: data.intent || "",
    latestDangerScore: data.danger_score,
    latestReputationScore: data.reputation_score,
    latestReputationSummary: data.reputation_summary || "",
    latestReputationExamples: data.reputation_examples || [],
    latestLoginSafety: data.login_safety || "Caution",
    latestKeyPoints: data.key_points || [],
    latestMeta: sourceMeta,
  });

  openLatestBtn.disabled = false;
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

    const payload = await sendMessageToTab(tab.id, { action: "getPolicyText" });
    const text = (payload && payload.text ? payload.text : "").trim();
    if (!text) {
      throw new Error("No policy, login, or consent text was found on this page.");
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
    chrome.storage.local.get(["tabsOpened"], (storage) => {
      chrome.storage.local.set({ tabsOpened: (storage.tabsOpened || 0) + 1 });
      loadStats();
    });
  } catch (error) {
    console.warn("[ConsentGuard Popup] Analysis failed:", error.message);
    setAnalysisState({
      meta: "Scan blocked",
      intent: "Unavailable",
      summary: error.message === "Could not establish connection. Receiving end does not exist."
        ? "Refresh the current page once so the content script can attach, then analyze again."
        : error.message,
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
      "latestSummary",
      "latestIntent",
      "latestDangerScore",
      "latestReputationScore",
      "latestReputationSummary",
      "latestReputationExamples",
      "latestLoginSafety",
      "latestKeyPoints",
      "latestMeta",
    ],
    (data) => {
      if (!data.latestSummary) return;
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
          key_points: data.latestKeyPoints || [],
        },
        data.latestMeta || "Latest saved report"
      );
    }
  );
}

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
