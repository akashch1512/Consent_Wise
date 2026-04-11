import os
import json

import httpx
from fastapi import HTTPException
from dotenv import load_dotenv

from app.api.quiz_schemas import QuizResponse

load_dotenv(".env")

QUIZ_MODEL = "gemini-2.5-flash"


def _get_api_key() -> str:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=500,
            detail="Gemini API key not configured. Set GEMINI_API_KEY in environment.",
        )
    return api_key


def _build_quiz_payload(document_context: str) -> dict:
    prompt = (
        "Generate an interactive quiz based on the following document context to check if the user actually read it.\n\n"
        "1. Create exactly 3-5 multiple-choice questions focusing ONLY on the most critical sections: hidden risks, penalties, financial obligations, and unexpected clauses.\n"
        "2. For each question, provide exactly TWO options (option A and option B).\n"
        "3. Specify which option is correct ('A' or 'B').\n"
        "4. Provide a short, easy-to-understand explanation of the correct answer so we can show it to the user if they pick the wrong one.\n"
        "5. If the document has no critical risks, generate questions based on the core rules mentioned.\n\n"
        "Document Context:\n"
        f"{document_context}\n\n"
        "Return the response ONLY as a valid JSON object strictly matching this format:\n"
        "{\n"
        '  "questions": [\n'
        "    {\n"
        '      "question": "...",\n'
        '      "option_a": "...",\n'
        '      "option_b": "...",\n'
        '      "correct_option": "A",\n'
        '      "explanation": "..."\n'
        "    }\n"
        "  ]\n"
        "}"
    )

    return {
        "contents": [
            {
                "role": "user",
                "parts": [{"text": prompt}],
            }
        ],
        "generationConfig": {
            "temperature": 0.2,
            "responseMimeType": "application/json",
            "maxOutputTokens": 2048,
        },
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


async def generate_quiz(document_context: str) -> QuizResponse:
    if not document_context.strip():
        raise HTTPException(status_code=400, detail="Document context cannot be empty.")

    api_key = _get_api_key()
    headers = {
        "x-goog-api-key": api_key,
        "Content-Type": "application/json",
    }
    
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{QUIZ_MODEL}:generateContent"
    payload = _build_quiz_payload(document_context)

    async with httpx.AsyncClient(timeout=45.0) as client:
        response = await client.post(url, json=payload, headers=headers)

    if response.status_code >= 300:
        raise HTTPException(
            status_code=502,
            detail=f"Gemini Quiz API failed ({response.status_code}): {response.text}",
        )

    response_json = response.json()
    candidates = response_json.get("candidates")
    if not isinstance(candidates, list) or not candidates:
        raise HTTPException(status_code=502, detail="Gemini Quiz API returned no output candidates.")

    # Extract JSON text
    parts = candidates[0].get("content", {}).get("parts", [])
    text_pieces = [p.get("text", "") for p in parts if "text" in p]
    final_text = _clean_json_text("".join(text_pieces))

    if not final_text:
        raise HTTPException(status_code=502, detail="Gemini Quiz API response contained no text.")

    try:
        data = json.loads(final_text)
        return QuizResponse(**data)
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=502,
            detail="Gemini Quiz API failed to return valid JSON.",
        )
