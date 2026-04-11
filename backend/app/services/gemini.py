import json
import os

import httpx
from fastapi import HTTPException
from dotenv import load_dotenv

from app.api.schemas import SummaryResponse

load_dotenv()

GEMINI_MODEL = "gemini-3-flash-preview"
GEMINI_API_URL = (
    f"https://generativelanguage.googleapis.com/v1beta/models/"
    f"{GEMINI_MODEL}:generateContent"
)


def build_summary_prompt(text: str) -> str:
    return (
        "You are a trusted assistant that summarizes financial consent and authorization "
        "information for people with low literacy, language barriers, or limited digital familiarity.\n"
        "Read the input text and return a concise, easy-to-read summary in simple language.\n"
        "Respond only with valid JSON exactly in this format:\n"
        "{\n"
        '  "summary": "...",\n'
        '  "key_points": ["...", "..."],\n'
        '  "accessibility_hint": "...",\n'
        '  "intent": "..."\n'
        "}\n\n"
        "Do not add any extra explanation or markup.\n\n"
        "Input text:\n"
        f"{text}\n"
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
            "maxOutputTokens": 1024,
            "responseMimeType": "application/json",
            "thinkingConfig": {
                "thinkingLevel": "minimal",
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

    if text_chunks:
        return [chunk.strip() for chunk in text_chunks if chunk.strip()]

    raise HTTPException(
        status_code=502,
        detail="Unexpected Gemini API response format.",
    )


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


async def generate_summary(text: str) -> SummaryResponse:
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

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            GEMINI_API_URL,
            json=_build_payload(build_summary_prompt(text)),
            headers=headers,
        )

    if response.status_code >= 300:
        raise HTTPException(
            status_code=502,
            detail=f"Gemini API request failed ({response.status_code}): {response.text}",
        )

    text_parts = _extract_text_parts(response.json())
    parsed = None
    for part in reversed(text_parts):
        try:
            parsed = _extract_json_object(part)
            break
        except HTTPException:
            continue

    if parsed is None:
        parsed = _extract_json_object("\n".join(text_parts))

    try:
        return SummaryResponse(**parsed)
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail="Gemini response JSON did not match the expected schema.",
        ) from exc
