import os

import httpx
from fastapi import HTTPException

from app.api.chat_schemas import ChatMessage

CHAT_MODEL = "gemini-2.5-flash"


def _get_api_key() -> str:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=500,
            detail="Gemini API key not configured. Set GEMINI_API_KEY in environment.",
        )
    return api_key


def _build_chat_payload(document_context: str, question: str, history: list[ChatMessage]) -> dict:
    parts_history = []
    
    # 1. Provide System Instruction Context once at the beginning
    system_instruction = (
        "You are a helpful and polite document-assistant chatbot. "
        "Answer the user's questions strictly based on the following document context. "
        "If the answer is not contained in the context, politely inform the user that you don't know based on the provided document. "
        "Keep answers concise, clear, and easy to understand.\n\n"
        "--- DOCUMENT CONTEXT START ---\n"
        f"{document_context}\n"
        "--- DOCUMENT CONTEXT END ---\n"
    )

    # 2. Add history (maps 'user' and 'model' to Gemini standard)
    for msg in history:
        role = "user" if msg.role.lower() == "user" else "model"
        parts_history.append(
            {
                "role": role,
                "parts": [{"text": msg.text}]
            }
        )

    # 3. Add latest question
    parts_history.append(
        {
            "role": "user",
            "parts": [{"text": question}]
        }
    )

    # Note: Using system instructions via system_instruction field is supported in v1beta for Gemini 1.5/2.5.
    return {
        "systemInstruction": {
            "role": "user",
            "parts": [
                {
                    "text": system_instruction
                }
            ]
        },
        "contents": parts_history,
        "generationConfig": {
            "temperature": 0.3, # low temperature for grounded answers
            "maxOutputTokens": 1024,
        }
    }


async def generate_chat_response(document_context: str, question: str, history: list[ChatMessage]) -> str:
    api_key = _get_api_key()
    headers = {
        "x-goog-api-key": api_key,
        "Content-Type": "application/json",
    }
    
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{CHAT_MODEL}:generateContent"
    payload = _build_chat_payload(document_context, question, history)

    async with httpx.AsyncClient(timeout=45.0) as client:
        response = await client.post(url, json=payload, headers=headers)

    if response.status_code >= 300:
        raise HTTPException(
            status_code=502,
            detail=f"Gemini Chat API failed ({response.status_code}): {response.text}",
        )

    response_json = response.json()
    candidates = response_json.get("candidates")
    if not isinstance(candidates, list) or not candidates:
        raise HTTPException(status_code=502, detail="Gemini Chat API returned no candidates.")

    # Extract text from standard generateContent response
    parts = candidates[0].get("content", {}).get("parts", [])
    text_pieces = [p.get("text", "") for p in parts if "text" in p]
    final_text = "".join(text_pieces).strip()

    if not final_text:
        raise HTTPException(status_code=502, detail="Gemini Chat API response contained no text.")

    return final_text
