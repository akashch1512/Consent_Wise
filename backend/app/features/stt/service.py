"""Speech-to-text via the OpenAI transcription API (Whisper family).

The extension's offscreen document records mic audio with MediaRecorder,
base64-encodes it, and POSTs it here. Whisper accepts the webm/opus blob
directly, so there is no ffmpeg / pydub step any more.
"""

import base64

from app.integrations.openai_client import transcribe

# Container hints so we send a sensible filename + content-type to OpenAI.
_EXT_BY_MIME = {
    "audio/webm": ("audio.webm", "audio/webm"),
    "audio/ogg": ("audio.ogg", "audio/ogg"),
    "audio/mp4": ("audio.mp4", "audio/mp4"),
    "audio/mpeg": ("audio.mp3", "audio/mpeg"),
    "audio/wav": ("audio.wav", "audio/wav"),
}


async def transcribe_audio(audio_base64: str, mime_type: str, language: str) -> str:
    """Decode the base64 blob and return its transcript.

    Raises ``ValueError("no-speech")`` when nothing was recognised.
    """
    try:
        audio_bytes = base64.b64decode(audio_base64)
    except Exception as exc:  # noqa: BLE001
        raise ValueError(f"Invalid base64 payload: {exc}") from exc

    key = next((m for m in _EXT_BY_MIME if m in (mime_type or "")), "audio/webm")
    filename, content_type = _EXT_BY_MIME[key]

    transcript = await transcribe(
        audio_bytes,
        filename=filename,
        content_type=content_type,
        language=language,
    )
    if not transcript:
        raise ValueError("no-speech")
    return transcript
