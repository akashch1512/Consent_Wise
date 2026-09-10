from app.api.schemas import SummaryResponse
from app.features.extension import service as extension_service
from app.features.users import router as users_router


def test_upsert_creates_profile(client, new_client_id):
    resp = client.post(
        "/api/users",
        json={
            "client_id": new_client_id,
            "name": "Asha",
            "email": "asha@example.com",
            "interests": ["Hidden Charges", "Privacy"],
            "language": "hi-IN",
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["client_id"] == new_client_id
    assert body["name"] == "Asha"
    assert body["interests"] == ["Hidden Charges", "Privacy"]
    assert body["language"] == "hi-IN"


def test_partial_upsert_merges(client, new_client_id):
    client.post("/api/users", json={"client_id": new_client_id, "name": "Ravi"})
    resp = client.post("/api/users", json={"client_id": new_client_id, "language": "ta-IN"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["name"] == "Ravi"  # preserved
    assert body["language"] == "ta-IN"  # updated


def test_get_unknown_client_is_404(client):
    assert client.get("/api/users/never-seen-this-id").status_code == 404


def test_get_profile_includes_empty_history(client, new_client_id):
    client.post("/api/users", json={"client_id": new_client_id, "name": "Sam"})
    resp = client.get(f"/api/users/{new_client_id}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["analysis_count"] == 0
    assert body["recent_analyses"] == []


def test_analyze_with_client_id_writes_history(client, new_client_id, monkeypatch):
    summary = SummaryResponse(
        danger_score=70,
        reputation_score=40,
        login_safety="Caution",
        reputation_summary="Mixed.",
        reputation_examples=[],
        summary="Risky subscription terms.",
        key_points=["Auto-renews"],
        accessibility_hint="Check fees.",
        intent="Subscription",
    )

    async def _fake_generate_summary(text, title="", url=""):
        return summary

    monkeypatch.setattr(extension_service, "generate_summary", _fake_generate_summary)

    analyze = client.post(
        "/api/extension/analyze",
        json={
            "text": "You agree to recurring charges.",
            "title": "Sign up",
            "url": "https://example.com/terms",
            "client_id": new_client_id,
        },
    )
    assert analyze.status_code == 200

    profile = client.get(f"/api/users/{new_client_id}").json()
    assert profile["analysis_count"] == 1
    event = profile["recent_analyses"][0]
    assert event["kind"] == "page"
    assert event["url"] == "https://example.com/terms"
    assert event["danger_score"] == 70


def test_delete_removes_profile_and_history(client, new_client_id):
    client.post("/api/users", json={"client_id": new_client_id, "name": "Dev"})
    assert client.get(f"/api/users/{new_client_id}").status_code == 200

    resp = client.delete(f"/api/users/{new_client_id}")
    assert resp.status_code == 204
    assert client.get(f"/api/users/{new_client_id}").status_code == 404


def test_delete_unknown_client_is_noop(client):
    assert client.delete("/api/users/never-existed").status_code == 204


def test_routes_503_when_db_disabled(client, monkeypatch):
    monkeypatch.setattr(users_router, "db_enabled", lambda: False)
    resp = client.post("/api/users", json={"client_id": "whatever-id"})
    assert resp.status_code == 503
