"""Unit tests for the pure helper logic in the extension service."""

from app.features.extension.service import (
    _build_login_guidance,
    _build_recommended_action,
    _build_risk_signals,
    _severity_from_score,
)


def test_severity_from_score():
    assert _severity_from_score(90) == "high"
    assert _severity_from_score(50) == "medium"
    assert _severity_from_score(10) == "low"


def test_risk_signals_detect_pressure_and_financial():
    signals = _build_risk_signals("Pay now, this is urgent!", intent="subscription")
    labels = {s.label for s in signals}
    assert "Pressure tactic" in labels
    assert "Financial commitment" in labels


def test_risk_signals_fall_back_to_manual_review():
    signals = _build_risk_signals("A calm neutral sentence.", intent="info")
    assert len(signals) == 1
    assert signals[0].severity == "low"


def test_recommended_action_escalates_with_danger():
    high = _build_recommended_action(90, [])
    assert high.startswith("Do not agree")
    assert _build_recommended_action(50, []).startswith("Proceed carefully")
    assert _build_recommended_action(10, []).startswith("Review the highlighted")


def test_login_guidance_matches_safety_level():
    assert _build_login_guidance("Unsafe", 80, 10).startswith("Not safe")
    assert _build_login_guidance("Caution", 80, 10).startswith("Use caution")
    assert _build_login_guidance("Safe", 90, 10).startswith("This looks reasonably safe")
