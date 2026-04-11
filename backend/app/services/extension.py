import html
import uuid
from typing import Dict

from app.api.schemas import (
    AnalysisPageResponse,
    AnalysisRecord,
    ExtensionAnalyzeRequest,
    ExtensionAnalyzeResponse,
    ExtensionConfigResponse,
    ExtensionFeature,
    RiskSignal,
)
from app.services.gemini import generate_summary

_ANALYSIS_STORE: Dict[str, AnalysisRecord] = {}


def get_extension_config(base_url: str) -> ExtensionConfigResponse:
    dashboard_url = f"{base_url}/dashboard"
    return ExtensionConfigResponse(
        product_name="ConsentWise AI",
        tagline="Understand before you agree",
        status_text="Protection Active",
        status_badge="Live",
        dashboard_label="Open Dashboard",
        dashboard_url=dashboard_url,
        panel_title="Current Page",
        panel_loading_copy="Checking this page for terms and privacy text...",
        panel_empty_copy="Open a webpage with terms or a privacy policy to analyze it.",
        footer_text="Built for Hackathon",
        features=[
            ExtensionFeature(
                title="Consent Detection",
                description="Monitors checkboxes and agreement buttons in real time.",
            ),
            ExtensionFeature(
                title="Blind Agreement Prevention",
                description="Intercepts high-risk clicks before submission happens.",
            ),
            ExtensionFeature(
                title="Safe Analysis Redirect",
                description="Opens a backend dashboard with the latest analysis result.",
            ),
        ],
    )


def _build_risk_signals(text: str, intent: str) -> list[RiskSignal]:
    lower_text = text.lower()
    signals: list[RiskSignal] = []

    if any(keyword in lower_text for keyword in ["double every second", "urgent", "immediately", "now"]):
        signals.append(
            RiskSignal(
                label="Pressure tactic",
                severity="high",
                explanation="The language uses urgency or extreme pressure to force a quick decision.",
            )
        )

    if any(keyword in lower_text for keyword in ["owe", "debt", "pay", "payment", "subscribe", "buy"]):
        signals.append(
            RiskSignal(
                label="Financial commitment",
                severity="medium",
                explanation="The page appears to involve a money-related obligation or payment step.",
            )
        )

    if "threat" in intent.lower() or "extortion" in intent.lower() or "scam" in intent.lower():
        signals.append(
            RiskSignal(
                label="Possible scam pattern",
                severity="high",
                explanation="The intent suggests intimidation, coercion, or fraudulent behavior.",
            )
        )

    if not signals:
        signals.append(
            RiskSignal(
                label="Manual review recommended",
                severity="low",
                explanation="Placeholder backend logic did not find a strong pattern, so manual review is safest.",
            )
        )

    return signals


def _severity_from_score(score: int) -> str:
    if score >= 75:
        return "high"
    if score >= 40:
        return "medium"
    return "low"


def _build_recommended_action(danger_score: int, risk_signals: list[RiskSignal]) -> str:
    if danger_score >= 75 or any(signal.severity == "high" for signal in risk_signals):
        return "Do not agree yet. Pause, verify the request, and review the full text carefully."
    if danger_score >= 40:
        return "Proceed carefully. Review fees, obligations, and data-sharing terms before continuing."
    return "Review the highlighted terms before continuing."


def _build_login_guidance(login_safety: str, reputation_score: int, danger_score: int) -> str:
    normalized = (login_safety or "").strip().lower()
    if normalized == "unsafe" or reputation_score < 40 or danger_score >= 75:
        return "Not safe to log in right now. Avoid entering credentials until the site is verified."
    if normalized == "caution" or reputation_score < 70 or danger_score >= 40:
        return "Use caution before logging in. Double-check the domain, terms, and data practices first."
    return "This looks reasonably safe for login, but still confirm the domain and review sensitive permissions."


async def analyze_extension_payload(
    request: ExtensionAnalyzeRequest,
    base_url: str,
) -> ExtensionAnalyzeResponse:
    summary = await generate_summary(
        request.text.strip(),
        title=request.title.strip(),
        url=request.url.strip(),
    )
    analysis_id = uuid.uuid4().hex
    risk_signals = _build_risk_signals(request.text, summary.intent)
    score_severity = _severity_from_score(summary.danger_score)
    if not any(signal.severity == "high" for signal in risk_signals) and summary.danger_score >= 75:
        risk_signals.insert(
            0,
            RiskSignal(
                label="High model danger score",
                severity=score_severity,
                explanation="The model found multiple signals that this agreement may be risky or harmful to accept quickly.",
            ),
        )
    elif summary.danger_score >= 40:
        risk_signals.insert(
            0,
            RiskSignal(
                label="Elevated caution",
                severity=score_severity,
                explanation="The model detected terms that deserve a careful review before the user agrees.",
            ),
        )
    record = AnalysisRecord(
        analysis_id=analysis_id,
        source=request.source,
        title=request.title.strip(),
        url=request.url.strip(),
        danger_score=summary.danger_score,
        reputation_score=summary.reputation_score,
        login_safety=summary.login_safety,
        login_guidance=_build_login_guidance(
            summary.login_safety,
            summary.reputation_score,
            summary.danger_score,
        ),
        reputation_summary=summary.reputation_summary,
        reputation_examples=summary.reputation_examples,
        summary=summary.summary,
        key_points=summary.key_points,
        accessibility_hint=summary.accessibility_hint,
        intent=summary.intent,
        risk_signals=risk_signals,
        recommended_action=_build_recommended_action(summary.danger_score, risk_signals),
        original_text_excerpt=request.text.strip()[:2000],
    )
    _ANALYSIS_STORE[analysis_id] = record

    panel_meta = summary.intent
    if record.title:
        panel_meta = f"{record.title} | Intent: {summary.intent}"
    elif record.url:
        panel_meta = f"{record.url} | Intent: {summary.intent}"

    return ExtensionAnalyzeResponse(
        **record.model_dump(),
        dashboard_url=f"{base_url}/dashboard/{analysis_id}",
        panel_kicker="Danger Score",
        panel_meta=panel_meta,
    )


def get_analysis(analysis_id: str) -> AnalysisRecord | None:
    return _ANALYSIS_STORE.get(analysis_id)


def build_analysis_page_payload(analysis_id: str) -> AnalysisPageResponse | None:
    record = get_analysis(analysis_id)
    if record is None:
        return None
    return AnalysisPageResponse(
        product_name="ConsentWise AI",
        dashboard_heading="Analysis Dashboard",
        dashboard_subheading=(
            f"Danger {record.danger_score}/100 · Reputation {record.reputation_score}/100 · "
            f"Login: {record.login_safety}"
        ),
        analysis=record,
    )


def build_dashboard_html(analysis_id: str) -> str:
    safe_analysis_id = html.escape(analysis_id)
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>ConsentWise AI Dashboard</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Noto+Sans+Devanagari:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    @property --gauge-angle {{
      syntax: "<angle>";
      inherits: false;
      initial-value: 8deg;
    }}
    @property --gauge-color {{
      syntax: "<color>";
      inherits: false;
      initial-value: #6366f1;
    }}
    :root {{
      --bg:      #f1f5f9;
      --surface: #ffffff;
      --line:    rgba(99, 102, 241, 0.12);
      --text:    #0f172a;
      --muted:   #64748b;
      --good:    #16a34a;
      --warn:    #d97706;
      --bad:     #dc2626;
      --accent:  #6366f1;
      --accent2: #0ea5e9;
    }}
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{
      font-family: "Space Grotesk", "Segoe UI", Arial, sans-serif;
      color: var(--text);
      background:
        radial-gradient(ellipse at top left,  rgba(99,102,241,0.07), transparent 45%),
        radial-gradient(ellipse at top right, rgba(14,165,233,0.05), transparent 40%),
        var(--bg);
      min-height: 100vh;
    }}
    .shell {{ max-width: 1160px; margin: 0 auto; padding: 32px 20px 72px; }}
    .hero {{
      display: grid;
      grid-template-columns: 1.2fr 0.9fr;
      gap: 18px;
      margin-bottom: 20px;
    }}
    .hero-card, .meter-shell, .card {{
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: 22px;
      padding: 24px;
      box-shadow: 0 2px 14px rgba(99,102,241,0.07), 0 1px 4px rgba(0,0,0,0.04);
    }}
    .hero-card {{ position: relative; overflow: hidden; }}
    .hero-card::before {{
      content: "";
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 3px;
      background: linear-gradient(90deg, var(--accent), var(--accent2));
      border-radius: 22px 22px 0 0;
    }}
    .eyebrow {{
      color: var(--accent);
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.12em;
    }}
    h1 {{ margin: 10px 0 8px; font-size: 32px; font-weight: 700; line-height: 1.15; }}
    .sub {{ color: var(--muted); max-width: 680px; line-height: 1.65; font-size: 15px; }}
    .pill-row {{ display: flex; flex-wrap: wrap; gap: 8px; margin-top: 18px; }}
    .pill {{
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.07em;
      background: #f1f5f9;
      border: 1px solid #e2e8f0;
      color: #334155;
    }}
    .pill.high   {{ background: #fee2e2; color: #b91c1c; border-color: #fecaca; }}
    .pill.medium {{ background: #fef3c7; color: #b45309; border-color: #fde68a; }}
    .pill.low    {{ background: #dbeafe; color: #1d4ed8; border-color: #bfdbfe; }}
    .meter-grid {{ display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }}
    .meter-card {{
      padding: 16px;
      border-radius: 18px;
      background: #f8fafc;
      border: 1px solid rgba(99,102,241,0.08);
      text-align: center;
    }}
    .gauge {{
      position: relative;
      width: 160px;
      height: 160px;
      margin: 0 auto 10px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      transition: --gauge-angle 0.7s cubic-bezier(0.34,1.56,0.64,1), --gauge-color 0.5s ease;
      background:
        radial-gradient(circle at center, #ffffff 58%, transparent 59%),
        conic-gradient(var(--gauge-color) 0 var(--gauge-angle), #e2e8f0 var(--gauge-angle) 360deg);
    }}
    .gauge::after {{
      content: "";
      position: absolute;
      inset: 20px;
      border-radius: 50%;
      background: #ffffff;
      border: 1px solid rgba(99,102,241,0.08);
      box-shadow: inset 0 1px 6px rgba(0,0,0,0.04);
    }}
    .gauge-inner {{ position: relative; z-index: 1; }}
    .gauge-score {{ font-size: 42px; font-weight: 800; line-height: 1; text-align: center; color: var(--text); }}
    .gauge-label {{ margin-top: 6px; color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.12em; text-align: center; }}
    .meter-headline {{ font-size: 18px; font-weight: 700; color: var(--text); }}
    .meter-copy {{ color: var(--muted); line-height: 1.6; font-size: 13px; min-height: 40px; margin-top: 4px; }}
    .login-banner {{
      margin-top: 14px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 14px 16px;
      border-radius: 16px;
      background: #f8fafc;
      border: 1px solid rgba(99,102,241,0.1);
    }}
    .login-title {{ color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.12em; font-weight: 700; }}
    .login-copy  {{ margin-top: 5px; font-size: 16px; font-weight: 700; color: var(--text); }}
    .login-badge {{
      padding: 8px 14px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.07em;
      border: 1px solid transparent;
      white-space: nowrap;
    }}
    .login-badge.safe    {{ background: #dcfce7; color: #15803d; border-color: #bbf7d0; }}
    .login-badge.caution {{ background: #fef3c7; color: #b45309; border-color: #fde68a; }}
    .login-badge.unsafe  {{ background: #fee2e2; color: #b91c1c; border-color: #fecaca; }}
    .grid {{ display: grid; grid-template-columns: 1.3fr 0.9fr; gap: 18px; }}
    .card h2 {{ margin: 0 0 14px; font-size: 17px; color: var(--text); }}
    .meta, .risk-list, .list {{ display: grid; gap: 10px; }}
    .meta-row, .risk-item {{
      padding: 12px 14px;
      border-radius: 12px;
      background: #f8fafc;
      border: 1px solid rgba(99,102,241,0.08);
    }}
    .meta-label {{ color: var(--muted); font-size: 11px; margin-bottom: 5px; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 700; }}
    .summary {{ font-size: 15px; line-height: 1.75; color: #334155; }}
    ul {{ margin: 0; padding-left: 18px; line-height: 1.85; color: #334155; }}
    pre {{ white-space: pre-wrap; word-break: break-word; color: var(--muted); line-height: 1.6; margin: 0; font-family: inherit; font-size: 13px; }}
    .empty {{ text-align: center; padding: 72px 20px; color: var(--muted); }}
    @media (max-width: 820px) {{ .hero, .grid, .meter-grid {{ grid-template-columns: 1fr; }} }}
  </style>
</head>
<body>
  <main class="shell">
    <section class="hero">
      <section class="hero-card">
        <div class="eyebrow">ConsentWise AI</div>
        <h1 id="heading">Loading analysis...</h1>
        <p class="sub" id="subheading">Fetching backend analysis for this intercepted page.</p>
        <div class="pill-row" id="hero-pills"></div>
      </section>
      <section class="meter-shell">
        <div class="meter-grid">
          <div class="meter-card">
            <div class="gauge" id="danger-gauge">
              <div class="gauge-inner">
                <div class="gauge-score" id="danger-score">--</div>
                <div class="gauge-label">Danger</div>
              </div>
            </div>
            <div class="meter-headline" id="danger-headline">Preparing report</div>
            <div class="meter-copy"    id="danger-copy">Calculating risk score.</div>
          </div>
          <div class="meter-card">
            <div class="gauge" id="reputation-gauge">
              <div class="gauge-inner">
                <div class="gauge-score" id="reputation-score">--</div>
                <div class="gauge-label">Reputation</div>
              </div>
            </div>
            <div class="meter-headline" id="reputation-headline">Preparing trust check</div>
            <div class="meter-copy"    id="reputation-copy">Estimating site trust for login.</div>
          </div>
        </div>
        <div class="login-banner">
          <div>
            <div class="login-title">Login Safety</div>
            <div class="login-copy" id="login-copy">Waiting for safety verdict</div>
          </div>
          <div class="login-badge caution" id="login-badge">Caution</div>
        </div>
      </section>
    </section>
    <div id="app" class="empty">Loading analysis...</div>
  </main>
  <script>
    function escapeHtml(v) {{
      return String(v||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
    }}
    function getDangerTheme(s) {{
      if (s>=75) return {{label:"High danger",  color:"#dc2626",copy:"The agreement looks risky or harmful."}};
      if (s>=40) return {{label:"Use caution",  color:"#d97706",copy:"Some language looks risky or costly."}};
      return             {{label:"Lower danger", color:"#16a34a",copy:"No major red flags were detected."}};
    }}
    function getReputationTheme(s) {{
      if (s>=75) return {{label:"Strong reputation",color:"#16a34a",copy:"The site appears more trustworthy overall."}};
      if (s>=40) return {{label:"Mixed reputation", color:"#d97706",copy:"This site deserves extra review before login."}};
      return             {{label:"Poor reputation",  color:"#dc2626",copy:"This site shows concerning trust signals."}};
    }}
    function setGauge(id,score,color) {{
      const g=document.getElementById(id), c=Math.max(0,Math.min(100,Number(score||0)));
      g.style.setProperty("--gauge-angle",`${{Math.max(8,c*3.6)}}deg`);
      g.style.setProperty("--gauge-color",color);
    }}
    function animateNumber(el,from,to,dur) {{
      if (!el) return;
      const t0=performance.now();
      (function update(now) {{
        const t=Math.min((now-t0)/dur,1), e=1-Math.pow(1-t,3);
        el.textContent=Math.round(from+(to-from)*e);
        if(t<1) requestAnimationFrame(update);
      }})(t0);
    }}
    function loginSafetyText(a) {{
      const s=String(a.login_safety||"").toLowerCase();
      if(s==="unsafe") return "Not safe to log in right now. Avoid entering credentials until the site is verified.";
      if(s==="safe")   return "Looks reasonably safe for login, but still verify the domain first.";
      return "Use caution before logging in. Check the domain and data practices first.";
    }}
    function badgeClass(v) {{
      const s=String(v||"").toLowerCase();
      return s==="safe"?"safe":s==="unsafe"?"unsafe":"caution";
    }}
    function renderList(items,empty) {{
      if(!Array.isArray(items)||!items.length) return `<div class="risk-item">${{escapeHtml(empty)}}</div>`;
      return items.map(i=>`<div class="risk-item">${{escapeHtml(i)}}</div>`).join("");
    }}
    function renderPoints(items,empty) {{
      if(!Array.isArray(items)||!items.length) return `<div class="risk-item">${{escapeHtml(empty)}}</div>`;
      return `<ul>${{items.map(i=>`<li>${{escapeHtml(i)}}</li>`).join("")}}</ul>`;
    }}
    async function loadAnalysis() {{
      const app=document.getElementById("app");
      try {{
        const res=await fetch("/api/extension/analysis/{safe_analysis_id}");
        const data=await res.json();
        if(!res.ok) throw new Error(data.detail||"Could not load analysis.");
        document.getElementById("heading").textContent   =data.dashboard_heading;
        document.getElementById("subheading").textContent=data.dashboard_subheading;
        const a=data.analysis;
        const score=Number(a.danger_score||0), rep=Number(a.reputation_score||0);
        const dt=getDangerTheme(score), rt=getReputationTheme(rep);
        setGauge("danger-gauge",score,dt.color);
        setGauge("reputation-gauge",rep,rt.color);
        animateNumber(document.getElementById("danger-score"),0,score,700);
        animateNumber(document.getElementById("reputation-score"),0,rep,700);
        document.getElementById("danger-headline").textContent    =`${{dt.label}} · ${{score}}/100`;
        document.getElementById("danger-copy").textContent        =dt.copy;
        document.getElementById("reputation-headline").textContent=`${{rt.label}} · ${{rep}}/100`;
        document.getElementById("reputation-copy").textContent    =rt.copy;
        document.getElementById("login-copy").textContent         =loginSafetyText(a);
        const lb=document.getElementById("login-badge");
        lb.textContent=escapeHtml(a.login_safety||"Caution");
        lb.className=`login-badge ${{badgeClass(a.login_safety)}}`;
        const dc=score>=75?"high":score>=40?"medium":"low";
        document.getElementById("hero-pills").innerHTML=`
          <div class="pill ${{dc}}">${{dt.label}}</div>
          <div class="pill">Reputation ${{rep}}/100</div>
          <div class="pill">Login ${{escapeHtml(a.login_safety||"Caution")}}</div>
          <div class="pill">${{escapeHtml(a.intent||"Unknown intent")}}</div>
          <div class="pill">${{escapeHtml(a.title||"Untitled page")}}</div>`;
        const riskHtml=a.risk_signals.map(r=>`
          <div class="risk-item">
            <div class="pill ${{r.severity==="high"?"high":r.severity==="medium"?"medium":"low"}}" style="margin-bottom:8px">${{escapeHtml(r.severity)}} risk</div>
            <div><strong>${{escapeHtml(r.label)}}</strong></div>
            <div style="color:#64748b;margin-top:4px;font-size:13px">${{escapeHtml(r.explanation)}}</div>
          </div>`).join("");
        app.className="grid";
        app.innerHTML=`
          <section class="card">
            <h2>Plain-Language Summary</h2>
            <div class="summary">${{escapeHtml(a.summary)}}</div>
            
            <div style="display:flex; gap:8px; margin-top:12px; border-top:1px solid rgba(99,102,241,0.12); padding-top:12px;">
              <select id="dash-tts-lang" style="flex:1; padding:8px 12px; border-radius:10px; border:1px solid #e2e8f0; background:#ffffff; color:#334155; font-size:13px; outline:none; font-family:inherit;">
                <option value="en-IN">Indian English</option>
                <option value="hi-IN">Hindi</option>
                <option value="mr-IN">Marathi</option>
                <option value="ta-IN">Tamil</option>
                <option value="te-IN">Telugu</option>
                <option value="bn-IN">Bengali</option>
                <option value="gu-IN">Gujarati</option>
                <option value="kn-IN">Kannada</option>
                <option value="ml-IN">Malayalam</option>
                <option value="pa-IN">Punjabi</option>
              </select>
              <button id="dash-tts-btn" style="padding:8px 16px; border-radius:10px; border:none; font-weight:700; background:linear-gradient(135deg, #6366f1, #0ea5e9); color:#fff; cursor:pointer; font-size:13px; font-family:inherit;" onclick="playDashTTS()">Listen</button>
              <audio id="dash-tts-audio" style="display:none;"></audio>
            </div>

            <div class="meta" style="margin-top:18px">
              <div class="meta-row"><div class="meta-label">Danger Score</div><div>${{score}}/100</div></div>
              <div class="meta-row"><div class="meta-label">Reputation Score</div><div>${{rep}}/100</div></div>
              <div class="meta-row"><div class="meta-label">Intent</div><div>${{escapeHtml(a.intent)}}</div></div>
              <div class="meta-row"><div class="meta-label">Login Safety</div><div>${{escapeHtml(a.login_safety)}}</div></div>
              <div class="meta-row"><div class="meta-label">Accessibility Hint</div><div>${{escapeHtml(a.accessibility_hint)}}</div></div>
              <div class="meta-row"><div class="meta-label">Recommended Action</div><div>${{escapeHtml(a.recommended_action)}}</div></div>
            </div>
          </section>
          
          <section>
            <section class="card" style="margin-bottom:18px">
              <h2>Ask the Document</h2>
              <div id="dash-chat-window" style="max-height:220px; overflow-y:auto; display:flex; flex-direction:column; gap:8px; padding:12px; background:#f8fafc; border:1px solid rgba(99,102,241,0.08); border-radius:12px; font-size:14px; line-height:1.5;">
                <div style="padding:10px 12px; border-radius:10px; align-self:flex-start; background:#eef2ff; color:#312e81; border-bottom-left-radius:0;">Ask me anything about this agreement. You can ask in English, Hindi, or any supported Indian language!</div>
              </div>
              <div style="display:flex; gap:8px; margin-top:12px;">
                <select id="dash-chat-lang" style="max-width:95px; text-overflow:ellipsis; white-space:nowrap; overflow:hidden; padding:0 8px; border-radius:10px; border:1px solid #e2e8f0; background:#ffffff; color:#334155; font-size:13px; outline:none; font-family:inherit;">
                  <option value="en-IN">Eng (IN)</option>
                  <option value="hi-IN">Hindi</option>
                  <option value="mr-IN">Marathi</option>
                  <option value="ta-IN">Tamil</option>
                  <option value="te-IN">Telugu</option>
                  <option value="bn-IN">Bengali</option>
                  <option value="gu-IN">Gujarati</option>
                  <option value="kn-IN">Kannada</option>
                  <option value="ml-IN">Malayalam</option>
                  <option value="pa-IN">Punjabi</option>
                </select>
                <input type="text" id="dash-chat-input" placeholder="Type your question..." autocomplete="off" style="flex:1; padding:10px 14px; border-radius:10px; border:1px solid #e2e8f0; font-size:14px; color:#334155; outline:none; font-family:inherit;" onkeypress="if(event.key==='Enter') document.getElementById('dash-chat-btn').click();" />
                <button id="dash-chat-btn" style="padding:0 18px; border-radius:10px; border:none; background:linear-gradient(135deg, #6366f1, #0ea5e9); color:#fff; cursor:pointer; font-weight:700; font-family:inherit;" onclick="sendDashChat()">Send</button>
              </div>
            </section>
            <section class="card" style="margin-bottom:18px"><h2>Key Points</h2>${{renderPoints(a.key_points,"No key points extracted.")}}</section>
            <section class="card" style="margin-bottom:18px"><h2>Risk Signals</h2><div class="risk-list">${{riskHtml}}</div></section>
            <section class="card" style="margin-bottom:18px">
              <h2>Site Reputation</h2>
              <div class="summary">${{escapeHtml(a.reputation_summary||"No reputation summary available.")}}</div>
              <div class="list" style="margin-top:14px">${{renderList(a.reputation_examples,"No verified bad history identified.")}}</div>
            </section>
            <section class="card">
              <h2>Source Details</h2>
              <div class="meta">
                <div class="meta-row"><div class="meta-label">Page Title</div><div>${{escapeHtml(a.title||"Untitled")}}</div></div>
                <div class="meta-row"><div class="meta-label">URL</div><div style="word-break:break-all">${{escapeHtml(a.url||"Not provided")}}</div></div>
                <div class="meta-row"><div class="meta-label">Original Excerpt</div><pre>${{escapeHtml(a.original_text_excerpt)}}</pre></div>
              </div>
            </section>
          </section>`;
          
        window.dashOriginalText = a.original_text_excerpt;
        window.dashSummaryText = a.summary;
      }} catch(err) {{
        app.className="empty";
        app.textContent=err.message;
      }}
    }}
    
    let isDashPlaying = false;
    let dashChatHistory = [];
    
    document.addEventListener("DOMContentLoaded", () => {{
      const chatLang = document.getElementById("dash-chat-lang");
      if (chatLang) {{
        chatLang.addEventListener("change", () => {{
          if (chatLang.value === "hi-IN" || chatLang.value === "mr-IN") {{
            document.body.style.fontFamily = "'Noto Sans Devanagari', 'Space Grotesk', sans-serif";
            document.body.style.fontWeight = "500";
          }} else {{
            document.body.style.fontFamily = "'Space Grotesk', sans-serif";
            document.body.style.fontWeight = "400";
          }}
        }});
      }}
    }});

    async function playDashTTS() {{
      const btn = document.getElementById("dash-tts-btn");
      const audio = document.getElementById("dash-tts-audio");
      const lang = document.getElementById("dash-tts-lang").value;
      
      if (isDashPlaying) {{
        audio.pause();
        isDashPlaying = false;
        btn.textContent = "Listen";
        return;
      }}
      
      btn.disabled = true;
      btn.textContent = "Loading...";
      try {{
        const res = await fetch("/api/tts", {{
          method: "POST",
          headers: {{"Content-Type": "application/json"}},
          body: JSON.stringify({{ text: window.dashSummaryText || "No summary text.", language_code: lang, voice_name: "Kore" }})
        }});
        if (!res.ok) throw new Error("TTS Failed");
        const data = await res.json();
        audio.src = `data:${{data.mime_type}};base64,${{data.audio_base64}}`;
        await audio.play();
        isDashPlaying = true;
        btn.textContent = "Stop";
        audio.onended = () => {{ isDashPlaying = false; btn.textContent = "Listen"; }};
      }} catch(er) {{
        console.error(er);
        alert("Audio failed to load.");
      }} finally {{
        btn.disabled = false;
      }}
    }}

    async function sendDashChat() {{
      const input = document.getElementById("dash-chat-input");
      const win = document.getElementById("dash-chat-window");
      const btn = document.getElementById("dash-chat-btn");
      const text = input.value.trim();
      if (!text) return;
      
      const userDiv = document.createElement("div");
      userDiv.style = "padding:10px 12px; border-radius:10px; align-self:flex-end; background:#6366f1; color:#fff; border-bottom-right-radius:0;";
      userDiv.textContent = text;
      win.appendChild(userDiv);
      win.scrollTop = win.scrollHeight;
      
      input.value = "";
      btn.disabled = true;
      
      const thinkDiv = document.createElement("div");
      thinkDiv.style = "padding:10px 12px; border-radius:10px; align-self:flex-start; background:#eef2ff; color:#312e81; border-bottom-left-radius:0;";
      thinkDiv.textContent = "Thinking...";
      win.appendChild(thinkDiv);
      win.scrollTop = win.scrollHeight;
      
      const langSelect = document.getElementById("dash-chat-lang");
      let langText = "Indian English";
      if (langSelect && langSelect.options) {{
        langText = langSelect.options[langSelect.selectedIndex].text;
      }}
      const question = `[Please answer in ${{langText}}] ${{text}}`;
      
      try {{
        const res = await fetch("/api/chat", {{
          method: "POST",
          headers: {{"Content-Type": "application/json"}},
          body: JSON.stringify({{
            document_context: window.dashOriginalText || "No context provided",
            question: question,
            history: dashChatHistory
          }})
        }});
        if (!res.ok) throw new Error("Chat failed");
        const data = await res.json();
        dashChatHistory.push({{role:"user", text:question}});
        dashChatHistory.push({{role:"model", text:data.answer}});
        
        win.removeChild(thinkDiv);
        const aiDiv = document.createElement("div");
        aiDiv.style = "padding:10px 12px; border-radius:10px; align-self:flex-start; background:#eef2ff; color:#312e81; border-bottom-left-radius:0;";
        aiDiv.textContent = data.answer;
        win.appendChild(aiDiv);
      }} catch (er) {{
        console.error(er);
        thinkDiv.textContent = "Sorry, I couldn't process your request.";
      }} finally {{
        btn.disabled = false;
        win.scrollTop = win.scrollHeight;
      }}
    }}

    loadAnalysis();
  </script>
</body>
</html>"""
