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
        product_name="ConsentGuard AI",
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
        product_name="ConsentGuard AI",
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
  <title>ConsentGuard AI Dashboard</title>
  <style>
    :root {{
      --bg: #07111f;
      --text: #eff6ff;
      --muted: #94a3b8;
      --line: rgba(148, 163, 184, 0.18);
      --good: #22c55e;
      --warn: #f59e0b;
      --bad: #ef4444;
      --cool: #38bdf8;
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      font-family: "Segoe UI", Arial, sans-serif;
      color: var(--text);
      background:
        radial-gradient(circle at top left, rgba(56, 189, 248, 0.18), transparent 32%),
        radial-gradient(circle at top right, rgba(239, 68, 68, 0.14), transparent 26%),
        var(--bg);
      min-height: 100vh;
    }}
    .shell {{
      max-width: 1140px;
      margin: 0 auto;
      padding: 32px 20px 64px;
    }}
    .hero,
    .grid {{
      display: grid;
      gap: 18px;
    }}
    .hero {{
      grid-template-columns: 1.2fr 0.9fr;
      margin-bottom: 20px;
    }}
    .grid {{
      grid-template-columns: 1.3fr 0.9fr;
    }}
    .hero-card,
    .meter-shell,
    .card {{
      background: linear-gradient(180deg, rgba(16,26,45,0.98), rgba(10,18,31,0.98));
      border: 1px solid var(--line);
      border-radius: 24px;
      padding: 22px;
      box-shadow: 0 20px 45px rgba(0, 0, 0, 0.24);
    }}
    .eyebrow {{
      color: var(--cool);
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.12em;
    }}
    h1 {{
      margin: 10px 0 8px;
      font-size: 38px;
      line-height: 1.15;
    }}
    .sub {{
      color: var(--muted);
      max-width: 720px;
      line-height: 1.6;
    }}
    .pill-row {{
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 18px;
    }}
    .pill {{
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.08);
    }}
    .meter-grid {{
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
    }}
    .meter-card {{
      padding: 16px;
      border-radius: 18px;
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.05);
      text-align: center;
    }}
    .gauge {{
      position: relative;
      width: 168px;
      height: 168px;
      margin: 0 auto 10px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      background:
        radial-gradient(circle at center, #07111f 58%, transparent 59%),
        conic-gradient(var(--gauge-color) 0 var(--gauge-angle), rgba(148, 163, 184, 0.14) var(--gauge-angle) 360deg);
    }}
    .gauge::after {{
      content: "";
      position: absolute;
      inset: 20px;
      border-radius: 50%;
      background: #07111f;
      border: 1px solid rgba(255,255,255,0.06);
    }}
    .gauge-inner {{
      position: relative;
      z-index: 1;
    }}
    .gauge-score {{
      font-size: 44px;
      font-weight: 800;
      line-height: 1;
      text-align: center;
    }}
    .gauge-label {{
      margin-top: 6px;
      color: var(--muted);
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      text-align: center;
    }}
    .meter-headline {{
      font-size: 20px;
      font-weight: 700;
    }}
    .meter-copy {{
      color: var(--muted);
      line-height: 1.6;
      font-size: 14px;
      min-height: 44px;
    }}
    .login-banner {{
      margin-top: 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 16px;
      border-radius: 18px;
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.06);
    }}
    .login-title {{
      color: var(--muted);
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.12em;
    }}
    .login-copy {{
      margin-top: 6px;
      font-size: 18px;
      font-weight: 700;
    }}
    .login-badge {{
      padding: 10px 14px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      border: 1px solid transparent;
    }}
    .login-badge.safe {{ background: rgba(34,197,94,0.16); color: #86efac; border-color: rgba(34,197,94,0.2); }}
    .login-badge.caution {{ background: rgba(245,158,11,0.16); color: #fcd34d; border-color: rgba(245,158,11,0.2); }}
    .login-badge.unsafe {{ background: rgba(239,68,68,0.16); color: #fca5a5; border-color: rgba(239,68,68,0.2); }}
    .card h2 {{
      margin: 0 0 12px;
      font-size: 18px;
    }}
    .meta,
    .risk-list,
    .list {{
      display: grid;
      gap: 12px;
    }}
    .meta-row,
    .risk-item {{
      padding: 12px;
      border-radius: 12px;
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.05);
    }}
    .meta-label {{
      color: var(--muted);
      font-size: 12px;
      margin-bottom: 6px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }}
    .summary {{
      font-size: 16px;
      line-height: 1.7;
    }}
    ul {{
      margin: 0;
      padding-left: 18px;
      line-height: 1.8;
    }}
    .pill.high {{ background: rgba(239,68,68,0.18); color: #fca5a5; }}
    .pill.medium {{ background: rgba(245,158,11,0.18); color: #fcd34d; }}
    .pill.low {{ background: rgba(56,189,248,0.16); color: #7dd3fc; }}
    pre {{
      white-space: pre-wrap;
      word-break: break-word;
      color: var(--muted);
      line-height: 1.6;
      margin: 0;
      font-family: inherit;
    }}
    .empty {{
      text-align: center;
      padding: 72px 20px;
      color: var(--muted);
    }}
    @media (max-width: 820px) {{
      .hero,
      .grid,
      .meter-grid {{
        grid-template-columns: 1fr;
      }}
    }}
  </style>
</head>
<body>
  <main class="shell">
    <section class="hero">
      <section class="hero-card">
        <div class="eyebrow">ConsentGuard AI</div>
        <h1 id="heading">Loading analysis...</h1>
        <p class="sub" id="subheading">Fetching backend analysis for this intercepted page.</p>
        <div class="pill-row" id="hero-pills"></div>
      </section>
      <section class="meter-shell">
        <div class="meter-grid">
          <div class="meter-card">
            <div class="gauge" id="danger-gauge" style="--gauge-angle: 8deg; --gauge-color: var(--cool);">
              <div class="gauge-inner">
                <div class="gauge-score" id="danger-score">--</div>
                <div class="gauge-label">Danger</div>
              </div>
            </div>
            <div class="meter-headline" id="danger-headline">Preparing report</div>
            <div class="meter-copy" id="danger-copy">Calculating risk score for the agreement.</div>
          </div>
          <div class="meter-card">
            <div class="gauge" id="reputation-gauge" style="--gauge-angle: 8deg; --gauge-color: var(--cool);">
              <div class="gauge-inner">
                <div class="gauge-score" id="reputation-score">--</div>
                <div class="gauge-label">Reputation</div>
              </div>
            </div>
            <div class="meter-headline" id="reputation-headline">Preparing trust check</div>
            <div class="meter-copy" id="reputation-copy">Estimating whether this site is safe to trust with a login.</div>
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
    function escapeHtml(value) {{
      return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }}

    function getDangerTheme(score) {{
      if (score >= 75) {{
        return {{
          label: "High danger",
          color: "#ef4444",
          copy: "The agreement looks risky or harmful."
        }};
      }}
      if (score >= 40) {{
        return {{
          label: "Use caution",
          color: "#f59e0b",
          copy: "Some language looks risky or costly."
        }};
      }}
      return {{
        label: "Lower danger",
        color: "#22c55e",
        copy: "No major red flags were detected."
      }};
    }}

    function getReputationTheme(score) {{
      if (score >= 75) {{
        return {{
          label: "Strong reputation",
          color: "#22c55e",
          copy: "The site appears more trustworthy overall."
        }};
      }}
      if (score >= 40) {{
        return {{
          label: "Mixed reputation",
          color: "#f59e0b",
          copy: "This site deserves extra review before login."
        }};
      }}
      return {{
        label: "Poor reputation",
        color: "#ef4444",
        copy: "This site shows concerning trust signals."
      }};
    }}

    function setGauge(id, score, color) {{
      const gauge = document.getElementById(id);
      const clamped = Math.max(0, Math.min(100, Number(score || 0)));
      gauge.style.setProperty("--gauge-angle", `${{Math.max(8, clamped * 3.6)}}deg`);
      gauge.style.setProperty("--gauge-color", color);
    }}

    function getLoginSafetyText(analysis) {{
      const safety = String(analysis.login_safety || "").toLowerCase();
      if (safety === "unsafe") {{
        return "Not safe to log in right now. Avoid entering credentials until the site is verified.";
      }}
      if (safety === "safe") {{
        return "Looks reasonably safe for login, but still verify the domain first.";
      }}
      return "Use caution before logging in. Check the domain and data practices first.";
    }}

    function getLoginBadgeClass(value) {{
      const safety = String(value || "").toLowerCase();
      if (safety === "safe") return "safe";
      if (safety === "unsafe") return "unsafe";
      return "caution";
    }}

    function renderList(items, emptyText) {{
      if (!Array.isArray(items) || !items.length) {{
        return `<div class="risk-item">${{escapeHtml(emptyText)}}</div>`;
      }}
      return items.map((item) => `
        <div class="risk-item">${{escapeHtml(item)}}</div>
      `).join("");
    }}

    function renderPointList(items, emptyText) {{
      if (!Array.isArray(items) || !items.length) {{
        return `<div class="risk-item">${{escapeHtml(emptyText)}}</div>`;
      }}
      return `<ul>${{items.map((item) => `<li>${{escapeHtml(item)}}</li>`).join("")}}</ul>`;
    }}

    async function loadAnalysis() {{
      const app = document.getElementById("app");
      try {{
        const response = await fetch("/api/extension/analysis/{safe_analysis_id}");
        const data = await response.json();
        if (!response.ok) {{
          throw new Error(data.detail || "Could not load analysis.");
        }}

        document.getElementById("heading").textContent = data.dashboard_heading;
        document.getElementById("subheading").textContent = data.dashboard_subheading;

        const analysis = data.analysis;
        const score = Number(analysis.danger_score || 0);
        const reputationScore = Number(analysis.reputation_score || 0);
        const dangerTheme = getDangerTheme(score);
        const reputationTheme = getReputationTheme(reputationScore);
        setGauge("danger-gauge", score, dangerTheme.color);
        setGauge("reputation-gauge", reputationScore, reputationTheme.color);
        document.getElementById("danger-score").textContent = String(score);
        document.getElementById("reputation-score").textContent = String(reputationScore);
        document.getElementById("danger-headline").textContent = `${{dangerTheme.label}} · ${{score}}/100`;
        document.getElementById("danger-copy").textContent = dangerTheme.copy;
        document.getElementById("reputation-headline").textContent = `${{reputationTheme.label}} · ${{reputationScore}}/100`;
        document.getElementById("reputation-copy").textContent = reputationTheme.copy;
        document.getElementById("login-copy").textContent = getLoginSafetyText(analysis);
        const loginBadge = document.getElementById("login-badge");
        loginBadge.textContent = escapeHtml(analysis.login_safety || "Caution");
        loginBadge.className = `login-badge ${{getLoginBadgeClass(analysis.login_safety)}}`;
        document.getElementById("hero-pills").innerHTML = `
          <div class="pill">${{dangerTheme.label}}</div>
          <div class="pill">Reputation ${{reputationScore}}/100</div>
          <div class="pill">Login ${{escapeHtml(analysis.login_safety || "Caution")}}</div>
          <div class="pill">${{escapeHtml(analysis.intent || "Unknown intent")}}</div>
          <div class="pill">${{escapeHtml(analysis.title || "Untitled page")}}</div>
        `;

        const riskHtml = analysis.risk_signals.map((risk) => `
          <div class="risk-item">
            <div class="pill ${{
              risk.severity === "high" ? "high" : risk.severity === "medium" ? "medium" : "low"
            }}">${{escapeHtml(risk.severity)}} risk</div>
            <div><strong>${{escapeHtml(risk.label)}}</strong></div>
            <div>${{escapeHtml(risk.explanation)}}</div>
          </div>
        `).join("");

        app.className = "grid";
        app.innerHTML = `
          <section class="card">
            <h2>Plain-Language Summary</h2>
            <div class="summary">${{escapeHtml(analysis.summary)}}</div>
            <div class="meta" style="margin-top: 18px;">
              <div class="meta-row">
                <div class="meta-label">Danger Score</div>
                <div>${{score}} / 100</div>
              </div>
              <div class="meta-row">
                <div class="meta-label">Reputation Score</div>
                <div>${{reputationScore}} / 100</div>
              </div>
              <div class="meta-row">
                <div class="meta-label">Intent</div>
                <div>${{escapeHtml(analysis.intent)}}</div>
              </div>
              <div class="meta-row">
                <div class="meta-label">Login Safety</div>
                <div>${{escapeHtml(analysis.login_safety)}}</div>
              </div>
              <div class="meta-row">
                <div class="meta-label">Accessibility Hint</div>
                <div>${{escapeHtml(analysis.accessibility_hint)}}</div>
              </div>
              <div class="meta-row">
                <div class="meta-label">Recommended Action</div>
                <div>${{escapeHtml(analysis.recommended_action)}}</div>
              </div>
            </div>
          </section>
          <section class="card">
            <h2>Key Points</h2>
            ${{renderPointList(analysis.key_points, "No key points were extracted.")}}
          </section>
          <section class="card">
            <h2>Risk Signals</h2>
            <div class="risk-list">${{riskHtml}}</div>
          </section>
          <section class="card">
            <h2>Site Reputation</h2>
            <div class="summary">${{escapeHtml(analysis.reputation_summary || "No reputation summary available.")}}</div>
            <div class="list" style="margin-top: 16px;">
              ${{renderList(
                analysis.reputation_examples,
                "No verified bad history was identified from this analysis."
              )}}
            </div>
          </section>
          <section class="card">
            <h2>Source Details</h2>
            <div class="meta">
              <div class="meta-row">
                <div class="meta-label">Page Title</div>
                <div>${{escapeHtml(analysis.title || "Untitled page")}}</div>
              </div>
              <div class="meta-row">
                <div class="meta-label">URL</div>
                <div>${{escapeHtml(analysis.url || "Not provided")}}</div>
              </div>
              <div class="meta-row">
                <div class="meta-label">Original Excerpt</div>
                <pre>${{escapeHtml(analysis.original_text_excerpt)}}</pre>
              </div>
            </div>
          </section>
        `;
      }} catch (error) {{
        app.className = "empty";
        app.textContent = error.message;
      }}
    }}

    loadAnalysis();
  </script>
</body>
</html>"""
