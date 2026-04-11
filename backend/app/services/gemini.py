import json
import os

import httpx
from fastapi import HTTPException
from dotenv import load_dotenv

from app.api.schemas import SummaryResponse

EXPECTED_RESPONSE_FIELDS = {
    "danger_score",
    "reputation_score",
    "login_safety",
    "reputation_summary",
    "reputation_examples",
    "summary",
    "key_points",
    "accessibility_hint",
    "intent",
}

load_dotenv(".env")

PRIMARY_GEMINI_MODEL = "gemini-2.5-pro"
FALLBACK_GEMINI_MODEL = "gemini-2.5-flash"


def build_summary_prompt(text: str, title: str = "", url: str = "") -> str:
    site_context = (
        f"Page title: {title or 'Unknown'}\n"
        f"Page URL: {url or 'Unknown'}\n"
    )
    return (
        "You are a trusted assistant that reviews financial consent, payment, subscription, "
        "authorization, and privacy language for people with low literacy, language barriers, "
        "or limited digital familiarity.\n"
        "You are analyzing both the policy text and the visible website identity.\n"
        "Read the input text carefully and assess how dangerous or risky it may be for a user to accept it.\n"
        "Assign a danger_score from 0 to 100 where 0 means very safe/low-risk language and 100 means "
        "extremely dangerous, deceptive, coercive, or financially risky language.\n"
        "Base the score on coercion, hidden costs, debt/payment obligations, data misuse, scams, threats, "
        "unclear consent, and pressure to act quickly.\n"
        "Also assign a reputation_score from 0 to 100 where 0 means very poor reputation and 100 means "
        "very strong reputation for user trust and safe handling.\n"
        "Judge reputation conservatively using the site identity, the text, and your background knowledge. "
        "If you are uncertain, say so briefly in reputation_summary and avoid inventing scandals.\n"
        "Set login_safety to exactly one of: Safe, Caution, Unsafe.\n"
        "If the reputation appears bad or concerning, list short examples of known or likely user-harm patterns "
        "such as data selling, breach history, dark patterns, unsafe storage, or misleading billing. "
        "If there are no trustworthy known examples, return an empty array instead of making things up.\n"
        "Return a concise, easy-to-read summary in simple language.\n"
        "Respond only with valid JSON exactly in this format:\n"
        "{\n"
        '  "danger_score": 0,\n'
        '  "reputation_score": 0,\n'
        '  "login_safety": "Caution",\n'
        '  "reputation_summary": "...",\n'
        '  "reputation_examples": ["...", "..."],\n'
        '  "summary": "...",\n'
        '  "key_points": ["...", "..."],\n'
        '  "accessibility_hint": "...",\n'
        '  "intent": "..."\n'
        "}\n\n"
        "Do not add any extra explanation or markup.\n\n"
        "Website context:\n"
        f"{site_context}\n"
        "Input text:\n"
        f"{text}\n"
    )


def _model_api_url(model: str) -> str:
    return (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{model}:generateContent"
    )


def _build_payload(prompt: str) -> dict:
    return {
        "contents": [
            {
                "role": "user",
                "parts": [{"text": prompt}],
            }
        ],
        "generationConfig": {
            "temperature": 0.1,
            "maxOutputTokens": 2048,
            "responseMimeType": "application/json",
            "responseSchema": {
                "type": "OBJECT",
                "properties": {
                    "danger_score": {"type": "INTEGER"},
                    "reputation_score": {"type": "INTEGER"},
                    "login_safety": {"type": "STRING"},
                    "reputation_summary": {"type": "STRING"},
                    "reputation_examples": {
                        "type": "ARRAY",
                        "items": {"type": "STRING"},
                    },
                    "summary": {"type": "STRING"},
                    "key_points": {
                        "type": "ARRAY",
                        "items": {"type": "STRING"},
                    },
                    "accessibility_hint": {"type": "STRING"},
                    "intent": {"type": "STRING"},
                },
                "required": [
                    "danger_score",
                    "reputation_score",
                    "login_safety",
                    "reputation_summary",
                    "reputation_examples",
                    "summary",
                    "key_points",
                    "accessibility_hint",
                    "intent",
                ],
            },
        },
    }


def _extract_text_parts(response_json: dict) -> list[str]:
    candidates = response_json.get("candidates")
    if not isinstance(candidates, list) or not candidates:
        raise HTTPException(
            status_code=502,
            detail="Gemini API returned no candidates.",
        )

    content = candidates[0].get("content", {})
    parts = content.get("parts", [])
    text_chunks = [
        part.get("text", "")
        for part in parts
        if isinstance(part, dict) and isinstance(part.get("text"), str)
    ]

    return [chunk.strip() for chunk in text_chunks if chunk.strip()]


def _response_finish_reason(response_json: dict) -> str:
    candidates = response_json.get("candidates")
    if not isinstance(candidates, list) or not candidates:
        return ""
    first_candidate = candidates[0]
    if not isinstance(first_candidate, dict):
        return ""
    return str(first_candidate.get("finishReason", "") or "")


def _find_structured_payload(value):
    if isinstance(value, dict):
        if EXPECTED_RESPONSE_FIELDS.issubset(value.keys()):
            return value
        for nested in value.values():
            found = _find_structured_payload(nested)
            if found is not None:
                return found
    elif isinstance(value, list):
        for item in value:
            found = _find_structured_payload(item)
            if found is not None:
                return found
    return None


def _collect_string_candidates(value, collected: list[str]) -> None:
    if isinstance(value, str):
        stripped = value.strip()
        if stripped:
            collected.append(stripped)
        return

    if isinstance(value, dict):
        for nested in value.values():
            _collect_string_candidates(nested, collected)
        return

    if isinstance(value, list):
        for item in value:
            _collect_string_candidates(item, collected)


def _extract_json_object(raw_text: str) -> dict:
    cleaned = raw_text.strip()

    if cleaned.startswith("```"):
        lines = cleaned.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        cleaned = "\n".join(lines).strip()

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start != -1 and end != -1 and end > start:
        try:
            return json.loads(cleaned[start : end + 1])
        except json.JSONDecodeError:
            pass

    raise HTTPException(
        status_code=502,
        detail="Gemini response could not be parsed as JSON.",
    )


def _clean_display_text(value: str) -> str:
    cleaned = " ".join((value or "").split()).strip()
    if not cleaned:
        return ""

    if cleaned.startswith("{") and cleaned.endswith("}"):
        try:
            nested = _extract_json_object(cleaned)
            for field in ("summary", "reputation_summary", "accessibility_hint", "intent"):
                nested_value = nested.get(field)
                if isinstance(nested_value, str) and nested_value.strip():
                    return " ".join(nested_value.split()).strip()
        except HTTPException:
            pass

    return cleaned


def _normalize_parsed_payload(parsed: dict) -> dict:
    normalized = dict(parsed)
    for field in (
        "summary",
        "reputation_summary",
        "accessibility_hint",
        "intent",
        "login_safety",
    ):
        if field in normalized and isinstance(normalized[field], str):
            normalized[field] = _clean_display_text(normalized[field])

    for list_field in ("key_points", "reputation_examples"):
        values = normalized.get(list_field)
        if isinstance(values, list):
            cleaned_values = []
            for value in values:
                if isinstance(value, str):
                    cleaned = _clean_display_text(value)
                    if cleaned:
                        cleaned_values.append(cleaned)
            normalized[list_field] = cleaned_values

    return normalized


def _fallback_summary_from_text(raw_text: str, original_text: str, url: str = "") -> SummaryResponse:
    cleaned = _clean_display_text(raw_text)
    if not cleaned:
        cleaned = "Summary unavailable from the model response."

    first_sentence = cleaned.split(". ")[0].strip()
    if first_sentence and not first_sentence.endswith("."):
        first_sentence += "."

    excerpt = " ".join(original_text.split()).strip()[:220]
    return SummaryResponse(
        danger_score=50,
        reputation_score=50,
        login_safety="Caution",
        reputation_summary=(
            f"Reputation could not be confirmed from the model response for {url}."
            if url
            else "Reputation could not be confirmed from the model response."
        ),
        reputation_examples=[],
        summary=first_sentence or cleaned[:240],
        key_points=[
            cleaned[:180] or "Model returned an unstructured response.",
            f"Original excerpt: {excerpt}" if excerpt else "Original text was provided by the extension.",
        ],
        accessibility_hint="This result used backend fallback parsing because the model response was not clean JSON.",
        intent="General policy or consent explanation",
    )


async def _call_gemini(
    client: httpx.AsyncClient,
    *,
    model: str,
    prompt: str,
    headers: dict,
) -> httpx.Response:
    return await client.post(
        _model_api_url(model),
        json=_build_payload(prompt),
        headers=headers,
    )


async def _parse_gemini_response(
    response: httpx.Response,
    *,
    original_text: str,
    url: str = "",
) -> SummaryResponse | None:
    if response.status_code >= 300:
        raise HTTPException(
            status_code=502,
            detail=f"Gemini API request failed ({response.status_code}): {response.text}",
        )

    response_json = response.json()
    structured_payload = _find_structured_payload(response_json)
    if structured_payload is not None:
        try:
            return SummaryResponse(**_normalize_parsed_payload(structured_payload))
        except Exception:
            pass

    text_parts = _extract_text_parts(response_json)
    parsed = None
    combined_text = "\n".join(text_parts)
    for part in reversed(text_parts):
        try:
            parsed = _extract_json_object(part)
            break
        except HTTPException:
            continue

    if parsed is None:
        fallback_strings: list[str] = []
        _collect_string_candidates(response_json, fallback_strings)
        for candidate in reversed(fallback_strings):
            try:
                parsed = _extract_json_object(candidate)
                break
            except HTTPException:
                continue

    if parsed is None:
        try:
            parsed = _extract_json_object(combined_text)
        except HTTPException:
            if _response_finish_reason(response_json) == "MAX_TOKENS":
                return None
            response_excerpt = response.text[:1000]
            fallback_source = combined_text or response_excerpt or "Gemini returned an unreadable response."
            return _fallback_summary_from_text(fallback_source, original_text, url=url)

    try:
        return SummaryResponse(**_normalize_parsed_payload(parsed))
    except Exception:
        if _response_finish_reason(response_json) == "MAX_TOKENS":
            return None
        return _fallback_summary_from_text(combined_text, original_text, url=url)


async def generate_summary(text: str, title: str = "", url: str = "") -> SummaryResponse:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=500,
            detail="Gemini API key not configured. Set GEMINI_API_KEY in environment.",
        )

    headers = {
        "x-goog-api-key": api_key,
        "Content-Type": "application/json",
    }
    prompt = build_summary_prompt(text, title=title, url=url)

    async with httpx.AsyncClient(timeout=45.0) as client:
        primary_response = await _call_gemini(
            client,
            model=PRIMARY_GEMINI_MODEL,
            prompt=prompt,
            headers=headers,
        )
        primary_result = await _parse_gemini_response(
            primary_response,
            original_text=text,
            url=url,
        )
        if primary_result is not None:
            return primary_result

        fallback_response = await _call_gemini(
            client,
            model=FALLBACK_GEMINI_MODEL,
            prompt=prompt,
            headers=headers,
        )
        fallback_result = await _parse_gemini_response(
            fallback_response,
            original_text=text,
            url=url,
        )
        if fallback_result is not None:
            return fallback_result

    raise HTTPException(
        status_code=502,
        detail="Gemini did not return a usable JSON analysis after retrying.",
    )
