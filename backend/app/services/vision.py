import base64
import os
import json
from pathlib import Path

import httpx
from fastapi import HTTPException
from dotenv import load_dotenv

from app.api.vision_schemas import VisionAnalysisResponse

load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env", override=True)

VISION_MODEL = "gemini-2.5-flash"

def _get_api_key() -> str:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=500,
            detail="Gemini API key not configured. Set GEMINI_API_KEY in environment.",
        )
    return api_key


def _build_vision_payload(mime_type: str, file_b64: str) -> dict:
    prompt = (
        "Extract all readable text from this document/image.\n\n"
        "Then:\n"
        "1. Summarize it in simple language\n"
        "2. List key points\n"
        "3. Highlight risks, penalties, obligations, or hidden clauses\n"
        "4. Provide an easy accessibility_hint explanation for low-literacy users\n\n"
        "Return the response ONLY as a valid JSON object matching this schema exactly:\n"
        "{\n"
        '  "extracted_text": "...",\n'
        '  "summary": "...",\n'
        '  "key_points": ["..."],\n'
        '  "risks": ["..."],\n'
        '  "accessibility_hint": "...",\n'
        '  "intent": "..."\n'
        "}"
    )

    return {
        "contents": [
            {
                "role": "user",
                "parts": [
                    {
                        "text": prompt
                    },
                    {
                        "inlineData": {
                            "mimeType": mime_type,
                            "data": file_b64
                        }
                    }
                ]
            }
        ],
        "generationConfig": {
            "temperature": 0.1,
            "responseMimeType": "application/json",
            "maxOutputTokens": 4096,
        }
    }


def _clean_json_text(text: str) -> str:
    text = text.strip()
    if text.startswith("```json"):
        text = text[7:]
    if text.startswith("```"):
        text = text[3:]
    if text.endswith("```"):
        text = text[:-3]
    return text.strip()


async def analyze_image(file_bytes: bytes, mime_type: str) -> VisionAnalysisResponse:
    file_b64 = base64.b64encode(file_bytes).decode("utf-8")
    
    api_key = _get_api_key()
    headers = {
        "x-goog-api-key": api_key,
        "Content-Type": "application/json",
    }
    
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{VISION_MODEL}:generateContent"
    payload = _build_vision_payload(mime_type, file_b64)

    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(url, json=payload, headers=headers)

    if response.status_code >= 300:
        raise HTTPException(
            status_code=502,
            detail=f"Gemini Vision API failed ({response.status_code}): {response.text}",
        )

    response_json = response.json()
    candidates = response_json.get("candidates")
    if not isinstance(candidates, list) or not candidates:
        raise HTTPException(status_code=502, detail="Gemini Vision API returned no output candidates.")

    # Extract JSON text
    parts = candidates[0].get("content", {}).get("parts", [])
    text_pieces = [p.get("text", "") for p in parts if "text" in p]
    final_text = _clean_json_text("".join(text_pieces))

    if not final_text:
        raise HTTPException(status_code=502, detail="Gemini Vision API response contained no text.")

    try:
        data = json.loads(final_text)
        return VisionAnalysisResponse(**data)
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=502,
            detail="Gemini Vision API failed to return valid JSON. Ensure image is clear.",
        )
