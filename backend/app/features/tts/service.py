"""Text-to-speech via the OpenAI audio API.

For non-English targets the summary text is translated first (OpenAI TTS speaks
text as written), then synthesised. The response is a base64 WAV so the popup
can play it straight from a data URI.
"""

import base64

from app.core.config import DEFAULT_TEXT_MODEL, DEFAULT_TTS_MODEL, DEFAULT_TTS_VOICE
from app.integrations.openai_client import chat_completion, text_to_speech

# OpenAI's built-in voice names. Anything else falls back to the default.
_OPENAI_VOICES = {
    "alloy",
    "ash",
    "ballad",
    "coral",
    "echo",
    "fable",
    "nova",
    "onyx",
    "sage",
    "shimmer",
    "verse",
}

LANGUAGE_NAMES = {
    "hi-IN": "Hindi",
    "mr-IN": "Marathi",
    "ta-IN": "Tamil",
    "te-IN": "Telugu",
    "bn-IN": "Bengali",
    "gu-IN": "Gujarati",
    "kn-IN": "Kannada",
    "ml-IN": "Malayalam",
    "pa-IN": "Punjabi",
}


def _resolve_voice(voice_name: str | None) -> str:
    return voice_name if voice_name in _OPENAI_VOICES else DEFAULT_TTS_VOICE


async def _translate(text: str, language_code: str) -> str:
    """Best-effort translation for non-English targets; returns input on failure."""
    if language_code.startswith("en"):
        return text
    target = LANGUAGE_NAMES.get(language_code)
    if not target:
        return text
    try:
        return await chat_completion(
            [
                {
                    "role": "system",
                    "content": f"Translate the user's text to {target}. Output only the translation.",
                },
                {"role": "user", "content": text},
            ],
            model=DEFAULT_TEXT_MODEL,
            temperature=0.2,
            label="OpenAI translation",
        )
    except Exception:
        return text


async def generate_speech(
    text: str,
    language_code: str = "en-IN",
    voice_name: str = DEFAULT_TTS_VOICE,
) -> dict:
    spoken_text = await _translate(text, language_code)
    audio_bytes = await text_to_speech(
        spoken_text,
        voice=_resolve_voice(voice_name),
        model=DEFAULT_TTS_MODEL,
        response_format="wav",
        instructions="Speak clearly at a slow, easy-to-understand pace.",
    )
    return {
        "audio_base64": base64.b64encode(audio_bytes).decode("utf-8"),
        "mime_type": "audio/wav",
    }
