"""Policy/consent summary generation via the OpenAI chat API."""

import json

from fastapi import HTTPException

from app.api.schemas import SummaryResponse
from app.core.config import DEFAULT_TEXT_MODEL
from app.integrations.openai_client import chat_completion

# Maximum characters of page text to include in the prompt.
_MAX_INPUT_CHARS = 6000

_SYSTEM_PROMPT = (
    "You are a trusted assistant that reviews financial consent, payment, subscription, "
    "authorization, and privacy language for people with low literacy, language barriers, "
    "or limited digital familiarity. You analyse both the policy text and the visible "
    "website identity, and you always reply with a single JSON object and nothing else."
)


def build_summary_prompt(text: str, title: str = "", url: str = "") -> str:
    site_context = f"Page title: {title or 'Unknown'}\nPage URL: {url or 'Unknown'}\n"
    trimmed_text = text.strip()[:_MAX_INPUT_CHARS]
    return (
        "Assess how dangerous or risky it may be for a user to accept the input text.\n"
        "Assign danger_score 0-100 (0 = very safe language, 100 = extremely dangerous, "
        "deceptive, coercive, or financially risky). Base it on coercion, hidden costs, "
        "debt/payment obligations, data misuse, scams, threats, unclear consent, and "
        "pressure to act quickly.\n"
        "Assign reputation_score 0-100 (0 = very poor, 100 = very strong reputation for "
        "user trust and safe handling). Judge conservatively; if uncertain, say so in "
        "reputation_summary and do not invent scandals.\n"
        "Set login_safety to exactly one of: Safe, Caution, Unsafe.\n"
        "If reputation is concerning, list short reputation_examples of known or likely "
        "user-harm patterns (data selling, breach history, dark patterns, misleading "
        "billing). If there are no trustworthy examples, use an empty array.\n"
        "Write summary and accessibility_hint in plain, simple language.\n\n"
        "Reply with JSON exactly in this shape:\n"
        "{\n"
        '  "danger_score": 0,\n'
        '  "reputation_score": 0,\n'
        '  "login_safety": "Caution",\n'
        '  "reputation_summary": "...",\n'
        '  "reputation_examples": ["..."],\n'
        '  "summary": "...",\n'
        '  "key_points": ["..."],\n'
        '  "accessibility_hint": "...",\n'
        '  "intent": "..."\n'
        "}\n\n"
        f"Website context:\n{site_context}\n"
        f"Input text:\n{trimmed_text}\n"
    )


def _coerce_score(value, default: int = 50) -> int:
    try:
        return max(0, min(100, int(round(float(value)))))
    except (TypeError, ValueError):
        return default


def _coerce_list(value) -> list[str]:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if isinstance(value, str) and value.strip():
        return [value.strip()]
    return []


def _to_summary_response(parsed: dict) -> SummaryResponse:
    login_safety = str(parsed.get("login_safety") or "Caution").strip().title()
    if login_safety not in {"Safe", "Caution", "Unsafe"}:
        login_safety = "Caution"

    return SummaryResponse(
        danger_score=_coerce_score(parsed.get("danger_score")),
        reputation_score=_coerce_score(parsed.get("reputation_score")),
        login_safety=login_safety,
        reputation_summary=str(
            parsed.get("reputation_summary") or "No reputation summary available."
        ).strip(),
        reputation_examples=_coerce_list(parsed.get("reputation_examples")),
        summary=str(parsed.get("summary") or "Summary unavailable.").strip(),
        key_points=_coerce_list(parsed.get("key_points")),
        accessibility_hint=str(parsed.get("accessibility_hint") or "").strip(),
        intent=str(parsed.get("intent") or "General policy or consent explanation").strip(),
    )


def _fallback_summary(original_text: str) -> SummaryResponse:
    excerpt = " ".join(original_text.split())[:220]
    return SummaryResponse(
        danger_score=50,
        reputation_score=50,
        login_safety="Caution",
        reputation_summary="Reputation could not be confirmed from the model response.",
        reputation_examples=[],
        summary="The model response could not be read. Review the original text carefully before agreeing.",
        key_points=[f"Original excerpt: {excerpt}"] if excerpt else [],
        accessibility_hint="This result used backend fallback parsing because the model reply was not clean JSON.",
        intent="General policy or consent explanation",
    )


async def generate_summary(text: str, title: str = "", url: str = "") -> SummaryResponse:
    content = await chat_completion(
        [
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": build_summary_prompt(text, title=title, url=url)},
        ],
        model=DEFAULT_TEXT_MODEL,
        temperature=0.1,
        json_mode=True,
        label="OpenAI summary",
    )

    try:
        parsed = json.loads(content)
    except json.JSONDecodeError:
        return _fallback_summary(text)

    try:
        return _to_summary_response(parsed)
    except HTTPException:
        raise
    except Exception:
        return _fallback_summary(text)
