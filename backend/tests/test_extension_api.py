import pytest

from app.api import router as api_router
from app.api.schemas import SummaryResponse
from app.features.extension import service as extension_service


@pytest.fixture
def fake_summary(monkeypatch):
    summary = SummaryResponse(
        danger_score=80,
        reputation_score=30,
        login_safety="Unsafe",
        reputation_summary="Concerning history.",
        reputation_examples=["data selling"],
        summary="This agreement is risky.",
        key_points=["Hidden fees", "Auto-renewal"],
        accessibility_hint="Be careful before agreeing.",
        intent="Subscription sign-up",
    )

    async def _fake_generate_summary(text, title="", url=""):
        return summary

    monkeypatch.setattr(extension_service, "generate_summary", _fake_generate_summary)
    monkeypatch.setattr(api_router, "generate_summary", _fake_generate_summary)
    return summary


def test_health(client):
    assert client.get("/health").json() == {"status": "ok"}


def test_extension_config(client):
    resp = client.get("/api/extension/config")
    assert resp.status_code == 200
    body = resp.json()
    assert body["product_name"] == "ConsentWise AI"
    assert body["dashboard_url"].endswith("/dashboard")
    assert len(body["features"]) == 3


def test_summarize_rejects_empty_text(client):
    resp = client.post("/api/summarize", json={"text": "   "})
    assert resp.status_code == 400


def test_summarize_returns_summary(client, fake_summary):
    resp = client.post("/api/summarize", json={"text": "Some policy text"})
    assert resp.status_code == 200
    assert resp.json()["danger_score"] == 80


def test_analyze_creates_retrievable_analysis(client, fake_summary):
    resp = client.post(
        "/api/extension/analyze",
        json={"text": "You must pay immediately or lose access", "title": "Pay now"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["danger_score"] == 80
    assert body["recommended_action"].startswith("Do not agree")
    assert body["dashboard_url"].endswith(f"/dashboard/{body['analysis_id']}")

    # The analysis is now retrievable by id, and the dashboard renders.
    follow_up = client.get(f"/api/extension/analysis/{body['analysis_id']}")
    assert follow_up.status_code == 200
    assert follow_up.json()["analysis"]["analysis_id"] == body["analysis_id"]

    page = client.get(f"/dashboard/{body['analysis_id']}")
    assert page.status_code == 200
    assert "text/html" in page.headers["content-type"]


def test_unknown_analysis_returns_404(client):
    assert client.get("/api/extension/analysis/does-not-exist").status_code == 404
    assert client.get("/dashboard/does-not-exist").status_code == 404
