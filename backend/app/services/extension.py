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


def _build_recommended_action(risk_signals: list[RiskSignal]) -> str:
    if any(signal.severity == "high" for signal in risk_signals):
        return "Do not agree yet. Pause, verify the request, and review the full text carefully."
    return "Review the highlighted terms before continuing."


async def analyze_extension_payload(
    request: ExtensionAnalyzeRequest,
    base_url: str,
) -> ExtensionAnalyzeResponse:
    summary = await generate_summary(request.text.strip())
    analysis_id = uuid.uuid4().hex
    risk_signals = _build_risk_signals(request.text, summary.intent)
    record = AnalysisRecord(
        analysis_id=analysis_id,
        source=request.source,
        title=request.title.strip(),
        url=request.url.strip(),
        summary=summary.summary,
        key_points=summary.key_points,
        accessibility_hint=summary.accessibility_hint,
        intent=summary.intent,
        risk_signals=risk_signals,
        recommended_action=_build_recommended_action(risk_signals),
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
        panel_kicker="Gemini Summary",
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
        dashboard_subheading="Backend-served result for the latest intercepted consent flow.",
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
      --bg: #09111f;
      --panel: #101a2d;
      --panel-strong: #16233d;
      --text: #eef4ff;
      --muted: #94a3b8;
      --line: rgba(148, 163, 184, 0.18);
      --accent: #22c55e;
      --accent-2: #38bdf8;
      --warn: #f59e0b;
      --danger: #ef4444;
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      font-family: Arial, sans-serif;
      color: var(--text);
      background:
        radial-gradient(circle at top left, rgba(56, 189, 248, 0.18), transparent 30%),
        radial-gradient(circle at top right, rgba(34, 197, 94, 0.16), transparent 28%),
        var(--bg);
      min-height: 100vh;
    }}
    .shell {{
      max-width: 980px;
      margin: 0 auto;
      padding: 32px 20px 64px;
    }}
    .hero {{
      margin-bottom: 20px;
    }}
    .eyebrow {{
      color: var(--accent-2);
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.12em;
    }}
    h1 {{
      margin: 10px 0 8px;
      font-size: 34px;
      line-height: 1.15;
    }}
    .sub {{
      color: var(--muted);
      max-width: 680px;
      line-height: 1.6;
    }}
    .grid {{
      display: grid;
      grid-template-columns: 1.3fr 0.9fr;
      gap: 18px;
      margin-top: 24px;
    }}
    .card {{
      background: linear-gradient(180deg, rgba(16,26,45,0.98), rgba(10,18,31,0.98));
      border: 1px solid var(--line);
      border-radius: 18px;
      padding: 18px;
      box-shadow: 0 20px 45px rgba(0, 0, 0, 0.2);
    }}
    .card h2 {{
      margin: 0 0 12px;
      font-size: 18px;
    }}
    .meta {{
      display: grid;
      gap: 12px;
    }}
    .meta-row {{
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
    .risk-list {{
      display: grid;
      gap: 10px;
    }}
    .risk-item {{
      padding: 12px;
      border-radius: 12px;
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.06);
    }}
    .pill {{
      display: inline-block;
      margin-bottom: 8px;
      padding: 4px 8px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
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
      .grid {{
        grid-template-columns: 1fr;
      }}
    }}
  </style>
</head>
<body>
  <main class="shell">
    <section class="hero">
      <div class="eyebrow">ConsentGuard AI</div>
      <h1 id="heading">Loading analysis...</h1>
      <p class="sub" id="subheading">Fetching backend analysis for this intercepted page.</p>
    </section>
    <div id="app" class="empty">Loading analysis...</div>
  </main>
  <script>
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
        const riskHtml = analysis.risk_signals.map((risk) => `
          <div class="risk-item">
            <div class="pill ${{
              risk.severity === "high" ? "high" : risk.severity === "medium" ? "medium" : "low"
            }}">${{risk.severity}} risk</div>
            <div><strong>${{risk.label}}</strong></div>
            <div>${{risk.explanation}}</div>
          </div>
        `).join("");

        const keyPointsHtml = analysis.key_points.map((item) => `<li>${{item}}</li>`).join("");

        app.className = "grid";
        app.innerHTML = `
          <section class="card">
            <h2>Plain-Language Summary</h2>
            <div class="summary">${{analysis.summary}}</div>
            <div class="meta" style="margin-top: 18px;">
              <div class="meta-row">
                <div class="meta-label">Intent</div>
                <div>${{analysis.intent}}</div>
              </div>
              <div class="meta-row">
                <div class="meta-label">Accessibility Hint</div>
                <div>${{analysis.accessibility_hint}}</div>
              </div>
              <div class="meta-row">
                <div class="meta-label">Recommended Action</div>
                <div>${{analysis.recommended_action}}</div>
              </div>
            </div>
          </section>
          <section class="card">
            <h2>Key Points</h2>
            <ul>${{keyPointsHtml}}</ul>
          </section>
          <section class="card">
            <h2>Risk Signals</h2>
            <div class="risk-list">${{riskHtml}}</div>
          </section>
          <section class="card">
            <h2>Source Details</h2>
            <div class="meta">
              <div class="meta-row">
                <div class="meta-label">Page Title</div>
                <div>${{analysis.title || "Untitled page"}}</div>
              </div>
              <div class="meta-row">
                <div class="meta-label">URL</div>
                <div>${{analysis.url || "Not provided"}}</div>
              </div>
              <div class="meta-row">
                <div class="meta-label">Original Excerpt</div>
                <pre>${{analysis.original_text_excerpt}}</pre>
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
