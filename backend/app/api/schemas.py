from pydantic import BaseModel, Field


class SummaryRequest(BaseModel):
    text: str = Field(..., title="Policy text to summarize")
    title: str = ""
    url: str = ""


class SummaryResponse(BaseModel):
    danger_score: int = Field(..., ge=0, le=100)
    reputation_score: int = Field(..., ge=0, le=100)
    login_safety: str
    reputation_summary: str
    reputation_examples: list[str]
    summary: str
    key_points: list[str]
    accessibility_hint: str
    intent: str


class ExtensionFeature(BaseModel):
    title: str
    description: str
    status: str = "active"


class ExtensionConfigResponse(BaseModel):
    product_name: str
    tagline: str
    status_text: str
    status_badge: str
    dashboard_label: str
    dashboard_url: str
    panel_title: str
    panel_loading_copy: str
    panel_empty_copy: str
    footer_text: str
    features: list[ExtensionFeature]


class ExtensionAnalyzeRequest(BaseModel):
    text: str = Field(..., title="Extracted policy or page text")
    title: str = ""
    url: str = ""
    source: str = "extension"
    # Extension-generated client id; when present the analysis is saved to history.
    client_id: str | None = None


class RiskSignal(BaseModel):
    label: str
    severity: str
    explanation: str


class AnalysisRecord(BaseModel):
    analysis_id: str
    source: str
    title: str
    url: str
    danger_score: int
    reputation_score: int
    login_safety: str
    login_guidance: str
    reputation_summary: str
    reputation_examples: list[str]
    summary: str
    key_points: list[str]
    accessibility_hint: str
    intent: str
    risk_signals: list[RiskSignal]
    recommended_action: str
    original_text_excerpt: str


class ExtensionAnalyzeResponse(AnalysisRecord):
    dashboard_url: str
    panel_kicker: str
    panel_meta: str


class AnalysisPageResponse(BaseModel):
    product_name: str
    dashboard_heading: str
    dashboard_subheading: str
    analysis: AnalysisRecord
