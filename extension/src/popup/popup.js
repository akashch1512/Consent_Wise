"use strict";

/**
 * ConsentWise AI — popup (orchestrator)
 * Storage schema in state.js · network in api.js · strings in i18n.js.
 */
(function () {
  const { TRUSTED_ORIGINS, API } = ConsentWise;
  const { KEYS } = CWState;
  const I18N = ConsentWiseI18n.dictionaries;
  const INTERNAL = ["chrome://", "chrome-extension://", "edge://", "about:", "view-source:"];

  const $ = (id) => document.getElementById(id);
  const on = (el, ev, fn, opts) => el && el.addEventListener(ev, fn, opts);

  // ── i18n ────────────────────────────────────────────────────────────────
  const langSelect = $("global-lang");
  const currentLang = () => (langSelect && langSelect.value) || ConsentWiseI18n.FALLBACK_LANG;
  const t = (key) => ConsentWiseI18n.translate(currentLang(), key);

  const DEVANAGARI = new Set(["hi-IN", "mr-IN"]);
  function applyLang(lang) {
    document.documentElement.lang = lang.split("-")[0];
    document.body.style.fontWeight = DEVANAGARI.has(lang) ? "500" : "";
    ConsentWiseI18n.apply(lang);
    // Elements with on/off variants are re-synced by their owners.
    syncProtectionLabel();
    if (lastRecord) renderAnalysis(lastRecord.data, lastRecord.meta);
    else renderNotScanned();
  }

  // ── Banner (replaces alert — UX-5) ──────────────────────────────────────
  const banner = $("banner");
  const bannerText = $("banner-text");
  let bannerTimer = 0;
  function showBanner(msg, kind = "info") {
    if (!banner) return;
    bannerText.textContent = msg;
    banner.classList.toggle("err", kind === "error");
    banner.classList.add("show");
    clearTimeout(bannerTimer);
    if (kind !== "error") bannerTimer = setTimeout(hideBanner, 6000);
  }
  function hideBanner() {
    if (banner) banner.classList.remove("show");
  }
  on($("banner-close"), "click", hideBanner);

  // ── Tabs (roving focus, aria — D2) ─────────────────────────────────────
  const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
  const panels = Array.from(document.querySelectorAll('[role="tabpanel"]'));
  function showTab(name, focus) {
    tabs.forEach((tab) => {
      const sel = tab.dataset.tab === name;
      tab.setAttribute("aria-selected", sel ? "true" : "false");
      tab.tabIndex = sel ? 0 : -1;
      if (sel && focus) tab.focus();
    });
    panels.forEach((p) => p.classList.toggle("active", p.dataset.panel === name));
    hideBanner();
  }
  tabs.forEach((tab, i) => {
    on(tab, "click", () => showTab(tab.dataset.tab));
    on(tab, "keydown", (e) => {
      const dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      if (!dir) return;
      e.preventDefault();
      showTab(tabs[(i + dir + tabs.length) % tabs.length].dataset.tab, true);
    });
  });

  // ── Feature lock (Chat / Quiz need an analysis) ────────────────────────
  let documentContext = "";
  function setFeatureAccess(ready) {
    document.querySelectorAll("[data-needs-analysis]").forEach((el) => (el.hidden = !ready));
    document.querySelectorAll("[data-locked]").forEach((el) => (el.hidden = ready));
    if (ttsBtn) ttsBtn.disabled = !ready;
  }

  // ── Verdict + summary + accordions (Scan — C3, D3) ─────────────────────
  const verdict = $("verdict");
  const vGlyph = $("verdict-glyph");
  const vWord = $("verdict-word");
  const vScore = $("verdict-score");
  const vFill = $("verdict-fill");
  const vTick = $("verdict-tick");
  const vHint = $("verdict-hint");
  const vMeta = $("verdict-meta");
  const vTrust = $("verdict-trust");
  const vSource = $("verdict-source");
  const summaryCard = $("summary");
  const summaryBody = $("summary-body");
  const summaryMore = $("summary-more");
  const accPoints = $("acc-points");
  const pointsList = $("points-list");
  const pointsCount = $("points-count");
  const accRep = $("acc-reputation");
  const repBody = $("rep-body");
  const repList = $("rep-list");
  const repBadge = $("rep-badge");
  const accLogin = $("acc-login");
  const loginBody = $("login-body");
  const loginBadge = $("login-badge");
  const fullReport = $("full-report-link");

  let lastRecord = null; // { data, meta }
  let lastRecordAt = 0;
  const clampScore = (v) =>
    typeof v === "number" && !Number.isNaN(v) ? Math.max(0, Math.min(100, Math.round(v))) : null;

  function riskBand(score) {
    if (score >= 75) return { cls: "high", glyph: "▲", word: t("verdictHigh") };
    if (score >= 40) return { cls: "mid", glyph: "▲", word: t("verdictMid") };
    return { cls: "low", glyph: "▲", word: t("verdictLow") };
  }
  function trustBand(score) {
    if (score >= 75) return { cls: "low", word: t("trustStrong") };
    if (score >= 40) return { cls: "mid", word: t("trustMixed") };
    return { cls: "high", word: t("trustWeak") };
  }
  function relativeTime(ts) {
    if (!ts) return "";
    const s = Math.round((Date.now() - ts) / 1000);
    if (s < 60) return t("justNow");
    const m = Math.round(s / 60);
    if (m < 60) return `${m} ${t("minAgo")}`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h} ${t("hrAgo")}`;
    return `${Math.round(h / 24)} ${t("dayAgo")}`;
  }
  function hostOf(url) {
    try { return new URL(url).host; } catch { return url || ""; }
  }

  function fillList(ul, items, emptyKey, cap = 6) {
    ul.textContent = "";
    const values = (Array.isArray(items) ? items : []).map((x) => String(x || "").trim()).filter(Boolean);
    if (!values.length) {
      const li = document.createElement("li");
      li.className = "empty";
      li.textContent = t(emptyKey);
      ul.appendChild(li);
      return 0;
    }
    values.slice(0, cap).forEach((v) => {
      const li = document.createElement("li");
      li.textContent = v;
      ul.appendChild(li);
    });
    return values.length;
  }

  function setAccordionOpen(el, key) {
    on(el, "toggle", () => {
      if (el.open) CWState.set({ [KEYS.openAccordion]: key });
    });
  }
  setAccordionOpen(accPoints, "points");
  setAccordionOpen(accRep, "reputation");
  setAccordionOpen(accLogin, "login");

  function renderNotScanned() {
    verdict.className = "verdict";
    vGlyph.textContent = "○";
    vWord.textContent = t("notScanned");
    vScore.textContent = "";
    vFill.style.width = "0%";
    vTick.hidden = true;
    vHint.textContent = t("notScannedHint");
    vMeta.hidden = true;
    summaryCard.hidden = true;
    [accPoints, accRep, accLogin].forEach((a) => (a.hidden = true));
    fullReport.hidden = true;
    setFeatureAccess(false);
  }

  function renderSkeleton() {
    verdict.className = "verdict skeleton";
    vGlyph.textContent = "○";
    vWord.textContent = t("scanning");
    vScore.textContent = "";
    vFill.style.width = "100%";
    vTick.hidden = true;
    vHint.textContent = t("scanning");
    vMeta.hidden = true;
  }

  function renderAnalysis(data, meta) {
    lastRecord = { data, meta };
    const danger = clampScore(data.danger_score);
    const rep = clampScore(data.reputation_score);
    const band = riskBand(danger ?? 0);

    verdict.className = `verdict ${band.cls}`;
    vGlyph.textContent = band.glyph;
    vWord.textContent = band.word;
    vScore.textContent = danger == null ? "" : `${danger}/100`;
    vHint.textContent = t("verdictHint");
    if (danger != null) {
      vFill.style.width = `${danger}%`;
      vTick.style.left = `${danger}%`;
      vTick.hidden = false;
    } else {
      vFill.style.width = "0%";
      vTick.hidden = true;
    }

    const url = data.url || (meta && meta.url) || "";
    vMeta.hidden = false;
    if (rep != null) {
      const tb = trustBand(rep);
      vTrust.textContent = `${t("siteTrust")}: ${tb.word} · ${rep}/100`;
    } else {
      vTrust.textContent = "";
    }
    const host = hostOf(url);
    const when = relativeTime((meta && meta.at) || (lastRecordAt || Date.now()));
    vSource.textContent = [host, when].filter(Boolean).join(" · ");

    // Summary
    const summary = String(data.summary || "").trim();
    if (summary) {
      summaryCard.hidden = false;
      summaryBody.textContent = summary;
      summaryBody.classList.add("clamp");
      requestAnimationFrame(() => {
        const clipped = summaryBody.scrollHeight - summaryBody.clientHeight > 4;
        summaryMore.hidden = !clipped;
        summaryMore.textContent = t("showMore");
      });
    } else {
      summaryCard.hidden = true;
    }

    // Accordions
    const nPoints = fillList(pointsList, data.key_points, "noKeyPoints");
    accPoints.hidden = false;
    pointsCount.textContent = nPoints ? String(nPoints) : "";

    const repText = String(data.reputation_summary || "").trim();
    repBody.textContent = repText || t("noReputation");
    fillList(repList, data.reputation_examples, "noBadHistory");
    accRep.hidden = false;
    const tb = rep != null ? trustBand(rep) : null;
    repBadge.textContent = tb ? tb.word : "";
    repBadge.className = "acc__badge " + (tb ? tb.cls : "");

    const loginSafety = String(data.login_safety || "Caution").trim();
    loginBody.textContent = data.login_guidance || t("analyzeSite");
    accLogin.hidden = false;
    const ls = loginSafety.toLowerCase();
    loginBadge.textContent = ls === "safe" ? t("safe") : ls === "unsafe" ? t("unsafe") : t("caution");
    loginBadge.className = "acc__badge " + (ls === "safe" ? "low" : ls === "unsafe" ? "high" : "mid");

    if (data.dashboard_url) {
      fullReport.hidden = false;
      fullReport.textContent = t("openFullReport");
      fullReport.dataset.href = data.dashboard_url;
    } else {
      fullReport.hidden = true;
    }

    documentContext = data.original_text_excerpt || summary || "";
    setFeatureAccess(Boolean(documentContext));

    // Restore remembered accordion
    CWState.get([KEYS.openAccordion]).then((d) => {
      const which = d[KEYS.openAccordion];
      if (which === "points") accPoints.open = true;
      else if (which === "reputation") accRep.open = true;
      else if (which === "login") accLogin.open = true;
    });
  }

  on(summaryMore, "click", () => {
    const clamped = summaryBody.classList.toggle("clamp");
    summaryMore.textContent = clamped ? t("showMore") : t("showLess");
  });
  on(fullReport, "click", (e) => {
    e.preventDefault();
    const href = fullReport.dataset.href;
    if (href) chrome.tabs.create({ url: href, active: true });
  });

  // ── Analyze (abort + skeleton — D4) ───────────────────────────────────
  const analyzeBtn = $("analyze-btn");
  let analyzeCtrl = null;

  const isRestricted = (u = "") => INTERNAL.some((p) => u.startsWith(p));
  const isOwnApp = (u = "") => {
    try { return TRUSTED_ORIGINS.includes(new URL(u).origin); } catch { return false; }
  };

  async function getTabText(tab) {
    try {
      const r = await sendToTab(tab.id, { action: "getPolicyText" });
      if (r && typeof r.text === "string") return r;
    } catch (err) {
      if (!/Receiving end does not exist|Could not establish connection|No tab with id/.test(err.message || "")) throw err;
    }
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["src/config/config.js", "src/shared/identity.js", "src/content/detect.js", "src/content/content.js"],
    });
    await new Promise((r) => setTimeout(r, 250));
    try {
      const r = await sendToTab(tab.id, { action: "getPolicyText" });
      if (r && typeof r.text === "string") return r;
    } catch { /* fall through */ }
    const [res] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => ({ text: (document.body ? document.body.innerText : "").slice(0, 5000).trim(), title: document.title || "", url: location.href }),
    });
    if (!res || !res.result) throw new Error(t("cannotRead"));
    return res.result;
  }
  function sendToTab(tabId, message) {
    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, message, (r) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(r);
      });
    });
  }

  function setAnalyzeMode(loading) {
    if (loading) {
      analyzeBtn.textContent = t("cancel");
      analyzeBtn.classList.add("btn--secondary");
    } else {
      analyzeBtn.textContent = t("analyzeBtn");
      analyzeBtn.classList.remove("btn--secondary");
    }
  }

  async function analyzeCurrentTab() {
    if (analyzeCtrl) { analyzeCtrl.abort(); return; }
    analyzeCtrl = new AbortController();
    setAnalyzeMode(true);
    renderSkeleton();
    hideBanner();

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id) throw new Error(t("noTab"));
      if (isRestricted(tab.url || "")) throw new Error(t("restrictedPage"));
      if (isOwnApp(tab.url || "")) throw new Error(t("ownAppPage"));

      const payload = await getTabText(tab);
      const text = (payload.text || "").trim();
      if (!text) throw new Error(t("noText"));

      const clientId = await ConsentWiseIdentity.getClientId().catch(() => null);
      const data = await CWApi.analyzePage(
        { text, title: payload.title || tab.title || "", url: payload.url || tab.url || "", source: "extension-popup", client_id: clientId },
        { signal: analyzeCtrl.signal }
      );

      const meta = { url: payload.url || tab.url || "", at: Date.now() };
      lastRecordAt = meta.at;
      renderAnalysis(data, meta);
      resetChat();
      await CWState.saveLastAnalysis(data, meta);
      CWState.bumpCounter(KEYS.tabsOpened).then(refreshStats);
    } catch (err) {
      if (CWApi.isAbort(err)) {
        if (lastRecord) renderAnalysis(lastRecord.data, lastRecord.meta);
        else renderNotScanned();
      } else {
        renderNotScanned();
        showBanner(friendlyError(err), "error");
      }
    } finally {
      analyzeCtrl = null;
      setAnalyzeMode(false);
    }
  }
  function friendlyError(err) {
    const m = (err && err.message) || "";
    if (/Failed to fetch|NetworkError|Timed out/i.test(m)) return t("backendUnreachable");
    if (/Cannot access|Missing host permission/i.test(m)) return t("restrictedPage");
    return m || t("analysisFailed");
  }
  on(analyzeBtn, "click", analyzeCurrentTab);

  // ── TTS ───────────────────────────────────────────────────────────────
  const ttsBtn = $("tts-btn");
  const ttsLabel = $("tts-label");
  const ttsAudio = $("tts-audio");
  let ttsPlaying = false;
  on(ttsBtn, "click", async () => {
    if (ttsPlaying) {
      ttsAudio.pause();
      ttsPlaying = false;
      ttsLabel.textContent = t("listenBtn");
      return;
    }
    const text = summaryBody.textContent.trim();
    if (!text) return;
    ttsBtn.disabled = true;
    ttsLabel.textContent = t("loadingBtn");
    try {
      const data = await CWApi.tts({ text, language_code: currentLang(), voice_name: "alloy" });
      ttsAudio.src = `data:${data.mime_type};base64,${data.audio_base64}`;
      await ttsAudio.play();
      ttsPlaying = true;
      ttsLabel.textContent = t("stopBtn");
      ttsAudio.onended = () => { ttsPlaying = false; ttsLabel.textContent = t("listenBtn"); };
    } catch {
      showBanner(t("ttsFailed"), "error");
      ttsLabel.textContent = t("listenBtn");
    } finally {
      ttsBtn.disabled = false;
    }
  });

  // ── Chat (C2, UX-10) ─────────────────────────────────────────────────
  const chatWindow = $("chat-window");
  const chatInput = $("chat-input");
  const chatSend = $("chat-send");
  const chatMic = $("chat-mic");
  const MAX_HISTORY_TURNS = 8;
  let chatHistory = [];
  let micListening = false;
  let micBase = "";

  function resetChat() {
    chatHistory = [];
    chatWindow.textContent = "";
    const welcome = document.createElement("div");
    welcome.className = "chat-msg ai";
    welcome.textContent = t("chatWelcome");
    chatWindow.appendChild(welcome);
    chatInput.value = "";
    autoGrow();
  }
  function addMsg(role, text) {
    const div = document.createElement("div");
    div.className = `chat-msg ${role}`;
    div.textContent = text;
    chatWindow.appendChild(div);
    chatWindow.scrollTop = chatWindow.scrollHeight;
    return div;
  }
  function autoGrow() {
    chatInput.style.height = "auto";
    chatInput.style.height = Math.min(chatInput.scrollHeight, 96) + "px";
  }
  on(chatInput, "input", autoGrow);
  on(chatInput, "keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendChat();
    }
  });

  async function sendChat(retryText) {
    const text = (retryText || chatInput.value).trim();
    if (!text) return;
    stopMic();
    if (!retryText) {
      addMsg("user", text);
      chatInput.value = "";
      autoGrow();
    }
    chatSend.disabled = true;
    const thinking = addMsg("ai", t("thinkingMsg"));

    const langName = (langSelect.selectedOptions[0] || {}).text || "English";
    try {
      const data = await CWApi.chat({
        document_context: documentContext,
        question: `[Answer in ${langName}] ${text}`,
        history: chatHistory,
      });
      thinking.remove();
      addMsg("ai", data.answer);
      chatHistory.push({ role: "user", text }, { role: "model", text: data.answer });
      if (chatHistory.length > MAX_HISTORY_TURNS * 2) chatHistory = chatHistory.slice(-MAX_HISTORY_TURNS * 2);
    } catch {
      thinking.remove();
      const errBubble = addMsg("ai", t("chatErrorMsg"));
      const retry = document.createElement("button");
      retry.className = "btn--quiet";
      retry.textContent = t("retry");
      retry.style.marginTop = "4px";
      on(retry, "click", () => { errBubble.remove(); retry.remove(); sendChat(text); });
      errBubble.appendChild(document.createElement("br"));
      errBubble.appendChild(retry);
    } finally {
      chatSend.disabled = false;
    }
  }
  on(chatSend, "click", () => sendChat());

  // ── Speech-to-text ────────────────────────────────────────────────────
  function setMicUI(state) {
    micListening = Boolean(state);
    chatMic.classList.toggle("rec", state === "recording");
    chatMic.disabled = false;
  }
  function stopMic() {
    if (micListening) chrome.runtime.sendMessage({ type: "stt-stop" }).catch(() => {});
  }
  chrome.runtime.onMessage.addListener((message, sender) => {
    if (!sender || sender.id !== chrome.runtime.id || message.target !== "popup") return;
    if (message.type === "stt-started") { micBase = chatInput.value.trim(); setMicUI("recording"); }
    else if (message.type === "stt-result" && message.transcript) {
      chatInput.value = [micBase, message.transcript].filter(Boolean).join(" ");
      autoGrow();
    } else if (message.type === "stt-error") {
      setMicUI(false);
      if (message.error === "not-allowed") showBanner(t("micDenied"), "error");
      else if (message.error === "network") showBanner(t("micNetwork"), "error");
    } else if (message.type === "stt-ended") {
      setMicUI(false);
      micBase = chatInput.value.trim();
    }
  });
  on(chatMic, "click", () => {
    if (micListening) return stopMic();
    chatMic.disabled = true;
    chrome.runtime.sendMessage({ type: "stt-start", lang: currentLang() })
      .then(() => { chatMic.disabled = false; chatInput.focus(); })
      .catch(() => { setMicUI(false); showBanner(t("micNetwork"), "error"); });
  });

  // ── Quiz (BUG-3: index-based) ─────────────────────────────────────────
  const quizGenerate = $("quiz-generate");
  const quizRun = $("quiz-run");
  const quizCount = $("quiz-count");
  const quizBar = $("quiz-bar");
  const quizQ = $("quiz-q");
  const quizA = $("quiz-a");
  const quizB = $("quiz-b");
  const quizExplain = $("quiz-explain");
  const quizNext = $("quiz-next");
  let quizData = [];
  let quizIndex = 0;

  function renderQuizQuestion() {
    if (quizIndex >= quizData.length) {
      quizQ.textContent = t("quizCompleteMsg");
      [quizA, quizB, quizExplain, quizNext].forEach((el) => (el.hidden = true));
      quizBar.style.width = "100%";
      quizCount.textContent = `${quizData.length} / ${quizData.length}`;
      return;
    }
    const q = quizData[quizIndex];
    quizCount.textContent = `${quizIndex + 1} / ${quizData.length}`;
    quizBar.style.width = `${(quizIndex / quizData.length) * 100}%`;
    quizQ.textContent = q.question;
    [
      [quizA, `A · ${q.option_a}`],
      [quizB, `B · ${q.option_b}`],
    ].forEach(([el, label]) => {
      el.hidden = false;
      el.textContent = label;
      el.disabled = false;
      el.className = "quiz-opt";
    });
    quizExplain.hidden = true;
    quizNext.hidden = true;
  }
  function answerQuiz(choice, el) {
    const q = quizData[quizIndex];
    quizA.disabled = true;
    quizB.disabled = true;
    const correctEl = q.correct_option === "A" ? quizA : quizB;
    correctEl.classList.add("correct");
    if (el !== correctEl) el.classList.add("wrong");
    quizExplain.textContent = q.explanation;
    quizExplain.hidden = false;
    quizNext.hidden = false;
    quizNext.textContent = quizIndex < quizData.length - 1 ? t("nextQuestion") : t("finishQuiz");
  }
  on(quizA, "click", () => answerQuiz("A", quizA));
  on(quizB, "click", () => answerQuiz("B", quizB));
  on(quizNext, "click", () => { quizIndex += 1; renderQuizQuestion(); });

  on(quizGenerate, "click", async () => {
    if (!documentContext) { showBanner(t("analyzeFirstMsg"), "error"); return; }
    quizGenerate.disabled = true;
    quizGenerate.textContent = t("generatingQuiz");
    try {
      const data = await CWApi.quiz({ document_context: documentContext, language_code: currentLang() });
      if (!data.questions || !data.questions.length) throw new Error("empty");
      quizData = data.questions;
      quizIndex = 0;
      quizRun.hidden = false;
      renderQuizQuestion();
    } catch {
      showBanner(t("quizFailedMsg"), "error");
    } finally {
      quizGenerate.disabled = false;
      quizGenerate.textContent = t("generateQuiz");
    }
  });

  // ── Document upload ───────────────────────────────────────────────────
  const dropZone = $("drop-zone");
  const docFile = $("doc-file");
  const docStatus = $("doc-status");
  const docAnalyze = $("doc-analyze");
  const docResults = $("doc-results");
  const docLabel = $("doc-label");
  const docRawToggle = $("doc-raw-toggle");
  const docRaw = $("doc-raw");
  let selectedFile = null;
  const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"];

  function setDocStatus(msg, kind = "") {
    docStatus.textContent = msg;
    docStatus.className = "doc-status" + (kind ? ` ${kind}` : "");
  }
  function pickFile(file) {
    if (!file) return;
    if (!ALLOWED.includes(file.type)) return setDocStatus(t("docBadType"), "err");
    if (file.size > 20 * 1024 * 1024) return setDocStatus(t("docTooBig"), "err");
    selectedFile = file;
    setDocStatus("");
    docResults.classList.remove("show");
    dropZone.classList.add("compact");
    docLabel.textContent = file.name;
    docAnalyze.disabled = false;
  }
  ["dragover", "dragenter"].forEach((ev) => on(dropZone, ev, (e) => { e.preventDefault(); dropZone.classList.add("drag"); }));
  ["dragleave", "dragend"].forEach((ev) => on(dropZone, ev, () => dropZone.classList.remove("drag")));
  on(dropZone, "drop", (e) => { e.preventDefault(); dropZone.classList.remove("drag"); pickFile(e.dataTransfer.files[0]); });
  on(docFile, "change", () => pickFile(docFile.files[0]));

  on(docAnalyze, "click", async () => {
    if (!selectedFile) return;
    docAnalyze.disabled = true;
    docAnalyze.textContent = t("analyzingBtn");
    setDocStatus(t("docSending"), "");
    try {
      const form = new FormData();
      form.append("file", selectedFile);
      const clientId = await ConsentWiseIdentity.getClientId().catch(() => null);
      if (clientId) form.append("client_id", clientId);
      const data = await CWApi.analyzeDocument(form);
      renderDocResults(data);
      setDocStatus("");
    } catch (err) {
      setDocStatus(`${t("analysisFailed")}: ${err.message}`, "err");
    } finally {
      docAnalyze.disabled = false;
      docAnalyze.textContent = t("analyzeDocBtn");
    }
  });

  function renderDocResults(data) {
    $("doc-summary").textContent = data.summary || "—";
    fillList($("doc-points"), data.key_points, "noKeyPoints");
    fillList($("doc-risks"), data.risks, "noBadHistory");
    $("doc-hint").textContent = data.accessibility_hint || "—";
    docRaw.textContent = data.extracted_text || "—";
    docRaw.classList.remove("open");
    docRawToggle.textContent = t("showRaw");
    docResults.classList.add("show");

    const text = (data.extracted_text || data.summary || "").trim();
    if (text) {
      documentContext = text;
      setFeatureAccess(true);
      resetChat();
      showBanner(t("docUnlocked"));
    }
  }
  on(docRawToggle, "click", () => {
    const open = docRaw.classList.toggle("open");
    docRawToggle.textContent = open ? t("hideRaw") : t("showRaw");
  });

  // ── Protection toggle (SEC-3: now real) ───────────────────────────────
  const protToggle = $("protection-toggle");
  const protSub = $("protection-sub");
  function syncProtectionLabel() {
    if (!protToggle || !protSub) return;
    const on_ = protToggle.getAttribute("aria-checked") === "true";
    protSub.textContent = on_ ? t("protectionOn") : t("protectionOff");
  }
  CWState.get([KEYS.protectionEnabled]).then((d) => {
    const enabled = d[KEYS.protectionEnabled] !== false;
    protToggle.setAttribute("aria-checked", String(enabled));
    protToggle.setAttribute("aria-pressed", String(enabled));
    syncProtectionLabel();
  });
  on(protToggle, "click", () => {
    const next = protToggle.getAttribute("aria-checked") !== "true";
    protToggle.setAttribute("aria-checked", String(next));
    protToggle.setAttribute("aria-pressed", String(next));
    CWState.set({ [KEYS.protectionEnabled]: next });
    syncProtectionLabel();
  });

  // ── Stats ─────────────────────────────────────────────────────────────
  function animateTo(el, to) {
    const from = Number(el.textContent) || 0;
    const start = performance.now();
    const step = (now) => {
      const p = Math.min((now - start) / 400, 1);
      el.textContent = String(Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3))));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  function refreshStats() {
    CWState.get([KEYS.interceptCount, KEYS.tabsOpened]).then((d) => {
      animateTo($("stat-intercepts"), d[KEYS.interceptCount] || 0);
      animateTo($("stat-analyses"), d[KEYS.tabsOpened] || 0);
    });
  }

  // ── Profile & settings sheet ─────────────────────────────────────────
  const sheet = $("sheet");
  const backdrop = $("sheet-backdrop");
  const chips = Array.from(document.querySelectorAll("#chips .chip"));
  const pfName = $("pf-name");
  const pfEmail = $("pf-email");
  const sheetAvatar = $("sheet-avatar");
  const avatarBtn = $("profile-btn");

  const initials = (name) => {
    const p = (name || "").trim().split(/\s+/).filter(Boolean);
    return p.length ? (p[0][0] + (p[1] ? p[1][0] : "")).toUpperCase() : "CW";
  };
  function applyProfile(profile) {
    pfName.value = profile.name || "";
    pfEmail.value = profile.email || "";
    const want = Array.isArray(profile.interests) ? profile.interests : [];
    chips.forEach((c) => c.classList.toggle("on", want.includes(c.dataset.chip)));
    const g = initials(profile.name);
    avatarBtn.textContent = g;
    sheetAvatar.textContent = g;
  }
  function openSheet() {
    CWState.get([KEYS.userProfile]).then((d) => applyProfile(d[KEYS.userProfile] || {}));
    refreshStats();
    ConsentWiseIdentity.getClientId().then((id) => {
      $("device-id").textContent = id ? id.slice(0, 8) + "…" : "—";
    });
    sheet.classList.add("open");
    backdrop.classList.add("open");
    sheet.setAttribute("aria-hidden", "false");
  }
  function closeSheet() {
    sheet.classList.remove("open");
    backdrop.classList.remove("open");
    sheet.setAttribute("aria-hidden", "true");
  }
  on(avatarBtn, "click", openSheet);
  on($("sheet-close"), "click", closeSheet);
  on(backdrop, "click", closeSheet);
  on(document, "keydown", (e) => { if (e.key === "Escape" && sheet.classList.contains("open")) closeSheet(); });
  chips.forEach((c) => on(c, "click", () => c.classList.toggle("on")));

  on($("save-btn"), "click", () => {
    const profile = {
      name: pfName.value.trim(),
      email: pfEmail.value.trim(),
      interests: chips.filter((c) => c.classList.contains("on")).map((c) => c.dataset.chip),
      language: currentLang(),
    };
    CWState.set({ [KEYS.userProfile]: profile });
    ConsentWiseIdentity.saveProfile(profile).catch(() => {});
    applyProfile(profile);
    closeSheet();
  });

  on($("device-copy"), "click", async () => {
    const id = await ConsentWiseIdentity.getClientId();
    navigator.clipboard.writeText(id).then(() => showBanner(t("copied")));
  });
  on($("device-reset"), "click", async () => {
    if (!confirm(t("resetIdConfirm"))) return;
    await CWState.remove(["clientId"]);
    location.reload();
  });
  on($("data-download"), "click", async () => {
    const id = await ConsentWiseIdentity.getClientId();
    try {
      const data = await CWApi.getUser(id);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "consentwise-data.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch {
      showBanner(t("noServerData"), "error");
    }
  });
  on($("data-delete"), "click", async () => {
    if (!confirm(t("deleteDataConfirm"))) return;
    const id = await ConsentWiseIdentity.getClientId();
    try { await CWApi.deleteUser(id); } catch { /* best effort */ }
    await chrome.storage.local.clear();
    location.reload();
  });
  on($("logout-btn"), "click", async () => {
    if (!confirm(t("logoutConfirm"))) return;
    await chrome.storage.local.clear();
    location.reload();
  });

  // ── Language ─────────────────────────────────────────────────────────
  on(langSelect, "change", () => {
    stopMic();
    applyLang(langSelect.value);
    CWState.set({ [KEYS.globalLang]: langSelect.value });
    ConsentWiseIdentity.saveProfile({ language: langSelect.value }).catch(() => {});
    CWState.get([KEYS.userProfile]).then((d) => {
      CWState.set({ [KEYS.userProfile]: { ...(d[KEYS.userProfile] || {}), language: langSelect.value } });
    });
  });

  // ── Welcome ──────────────────────────────────────────────────────────
  const welcome = $("welcome-screen");
  const mainApp = $("main-app");
  function showMain() {
    welcome.hidden = true;
    mainApp.hidden = false;
  }
  on($("get-started-btn"), "click", () => {
    CWState.set({ [KEYS.hasSeenWelcome]: true });
    showMain();
  });

  // ── Boot ─────────────────────────────────────────────────────────────
  async function boot() {
    const d = await CWState.get([KEYS.hasSeenWelcome, KEYS.globalLang]);
    if (d[KEYS.globalLang]) langSelect.value = d[KEYS.globalLang];
    applyLang(currentLang());

    if (d[KEYS.hasSeenWelcome]) showMain();
    else { welcome.hidden = false; mainApp.hidden = true; }

    renderNotScanned();
    refreshStats();

    const rec = await CWState.loadLastAnalysis();
    if (rec) {
      lastRecordAt = rec.at || 0;
      renderAnalysis(rec.data, rec.meta || {});
      documentContext = rec.data.original_text_excerpt || rec.data.summary || "";
      setFeatureAccess(Boolean(documentContext));
      resetChat();
    }
  }
  boot();
})();
