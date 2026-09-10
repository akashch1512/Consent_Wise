"""Thin helpers around the OpenAI REST API.

Three primitives cover every feature:
  • ``chat_completion`` — text in, text out (optionally JSON-mode)
  • ``transcribe``      — audio bytes in, transcript out (Whisper)
  • ``text_to_speech``  — text in, audio bytes out
"""

import httpx
from fastapi import HTTPException

from app.core.config import (
    DEFAULT_STT_MODEL,
    DEFAULT_TEXT_MODEL,
    DEFAULT_TTS_MODEL,
    DEFAULT_TTS_VOICE,
    openai_headers,
    openai_url,
)


def _raise_for_status(response: httpx.Response, *, label: str) -> None:
    if response.status_code >= 300:
        raise HTTPException(
            status_code=502,
            detail=f"{label} failed ({response.status_code}): {response.text[:500]}",
        )


async def chat_completion(
    messages: list[dict],
    *,
    model: str = DEFAULT_TEXT_MODEL,
    temperature: float = 0.2,
    max_tokens: int | None = None,
    json_mode: bool = False,
    timeout: float = 60.0,
    label: str = "OpenAI chat",
) -> str:
    """POST to ``/chat/completions`` and return the assistant message text."""
    payload: dict = {"model": model, "messages": messages, "temperature": temperature}
    if max_tokens is not None:
        payload["max_tokens"] = max_tokens
    if json_mode:
        payload["response_format"] = {"type": "json_object"}

    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(
            openai_url("/chat/completions"),
            json=payload,
            headers={**openai_headers(), "Content-Type": "application/json"},
        )
    _raise_for_status(response, label=label)

    choices = response.json().get("choices")
    if not isinstance(choices, list) or not choices:
        raise HTTPException(status_code=502, detail=f"{label} returned no choices.")

    content = (choices[0].get("message") or {}).get("content", "")
    text = content.strip() if isinstance(content, str) else ""
    if not text:
        raise HTTPException(status_code=502, detail=f"{label} response contained no text.")
    return text


async def transcribe(
    audio: bytes,
    *,
    filename: str = "audio.webm",
    content_type: str = "audio/webm",
    language: str | None = None,
    model: str = DEFAULT_STT_MODEL,
    timeout: float = 60.0,
) -> str:
    """POST audio to ``/audio/transcriptions`` and return the transcript."""
    data = {"model": model}
    if language:
        # OpenAI wants an ISO-639-1 code ("hi"), not a locale ("hi-IN").
        data["language"] = language.split("-")[0]

    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(
            openai_url("/audio/transcriptions"),
            data=data,
            files={"file": (filename, audio, content_type)},
            headers=openai_headers(),
        )
    _raise_for_status(response, label="OpenAI transcription")
    return (response.json().get("text") or "").strip()


async def text_to_speech(
    text: str,
    *,
    voice: str = DEFAULT_TTS_VOICE,
    model: str = DEFAULT_TTS_MODEL,
    response_format: str = "wav",
    instructions: str | None = None,
    timeout: float = 60.0,
) -> bytes:
    """POST to ``/audio/speech`` and return the raw audio bytes."""
    payload: dict = {
        "model": model,
        "voice": voice,
        "input": text,
        "response_format": response_format,
    }
    if instructions:
        payload["instructions"] = instructions

    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(
            openai_url("/audio/speech"),
            json=payload,
            headers={**openai_headers(), "Content-Type": "application/json"},
        )
    _raise_for_status(response, label="OpenAI speech")
    return response.content
