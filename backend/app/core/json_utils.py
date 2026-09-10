"""Small helpers for coaxing JSON out of model responses."""

import json
from typing import Any

from fastapi import HTTPException


def strip_code_fences(text: str) -> str:
    """Remove a leading ```json / ``` fence and a trailing ``` fence, if present."""
    text = text.strip()
    if text.startswith("```json"):
        text = text[len("```json") :]
    elif text.startswith("```"):
        text = text[len("```") :]
    if text.endswith("```"):
        text = text[:-3]
    return text.strip()


def parse_json_response(text: str, *, error_detail: str) -> Any:
    """Parse ``text`` as JSON after stripping code fences.

    Raises a 502 ``HTTPException`` with ``error_detail`` when the text is not
    valid JSON, which is the behaviour every AI-backed feature wants.
    """
    cleaned = strip_code_fences(text)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=502, detail=error_detail) from exc
