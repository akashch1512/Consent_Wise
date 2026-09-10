"""Shared configuration and helpers for talking to the OpenAI API.

Every feature (summary, chat, quiz, vision, tts, stt) needs the same things:
an API key from the environment and the standard auth headers. They import
those from here rather than each re-reading the environment.
"""

import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import HTTPException

# Load backend/.env once, regardless of the current working directory.
load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env", override=False)

OPENAI_API_BASE = os.getenv("OPENAI_API_BASE", "https://api.openai.com/v1").rstrip("/")

# Model defaults, kept in one place so they are easy to bump.
DEFAULT_TEXT_MODEL = os.getenv("OPENAI_TEXT_MODEL", "gpt-4o-mini")
DEFAULT_VISION_MODEL = os.getenv("OPENAI_VISION_MODEL", "gpt-4o-mini")
DEFAULT_TTS_MODEL = os.getenv("OPENAI_TTS_MODEL", "gpt-4o-mini-tts")
DEFAULT_TTS_VOICE = os.getenv("OPENAI_TTS_VOICE", "alloy")
DEFAULT_STT_MODEL = os.getenv("OPENAI_STT_MODEL", "gpt-4o-mini-transcribe")


def get_openai_api_key() -> str:
    """Return the configured OpenAI API key or raise a 500 if it is missing."""
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=500,
            detail="OpenAI API key not configured. Set OPENAI_API_KEY in environment.",
        )
    return api_key


def openai_headers(api_key: str | None = None) -> dict[str, str]:
    """Return the standard Authorization headers for an OpenAI REST call."""
    return {"Authorization": f"Bearer {api_key or get_openai_api_key()}"}


def openai_url(path: str) -> str:
    """Build a full OpenAI API URL from a path like ``/chat/completions``."""
    return f"{OPENAI_API_BASE}/{path.lstrip('/')}"
