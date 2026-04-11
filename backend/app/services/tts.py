import base64
import os
import struct

import httpx
from dotenv import load_dotenv
from fastapi import HTTPException

load_dotenv(".env")

TTS_MODEL = "gemini-2.5-flash-preview-tts"
TTS_API_URL = (
    f"https://generativelanguage.googleapis.com/v1beta/models/{TTS_MODEL}:generateContent"
)

# Maps language codes to natural-language instructions for the TTS model
LANGUAGE_PROMPTS = {
    "hi-IN": "Speak clearly in Hindi at a slow, easy-to-understand pace.",
    "mr-IN": "Speak clearly in Marathi at a slow, easy-to-understand pace.",
    "en-IN": "Speak clearly in Indian English at a slow, easy-to-understand pace.",
    "en-US": "Speak clearly in American English at a slow, easy-to-understand pace.",
    "ta-IN": "Speak clearly in Tamil at a slow, easy-to-understand pace.",
    "te-IN": "Speak clearly in Telugu at a slow, easy-to-understand pace.",
    "bn-IN": "Speak clearly in Bengali at a slow, easy-to-understand pace.",
    "gu-IN": "Speak clearly in Gujarati at a slow, easy-to-understand pace.",
    "kn-IN": "Speak clearly in Kannada at a slow, easy-to-understand pace.",
    "ml-IN": "Speak clearly in Malayalam at a slow, easy-to-understand pace.",
    "pa-IN": "Speak clearly in Punjabi at a slow, easy-to-understand pace.",
}


def _get_api_key() -> str:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=500,
            detail="Gemini API key not configured. Set GEMINI_API_KEY in environment.",
        )
    return api_key


def _language_prompt(language_code: str) -> str:
    return LANGUAGE_PROMPTS.get(
        language_code,
        f"Speak clearly in the language for locale '{language_code}' at a slow, easy-to-understand pace.",
    )


def _build_tts_payload(text: str, language_code: str, voice_name: str) -> dict:
    system_prompt = _language_prompt(language_code)
    return {
        "contents": [
            {
                "role": "user",
                "parts": [{"text": f"{system_prompt}\n\n{text}"}],
            }
        ],
        "generationConfig": {
            "responseModalities": ["AUDIO"],
            "speechConfig": {
                "voiceConfig": {
                    "prebuiltVoiceConfig": {
                        "voiceName": voice_name,
                    }
                }
            },
        },
    }


def _pcm_to_wav(pcm_data: bytes, sample_rate: int = 24000, channels: int = 1, bits_per_sample: int = 16) -> bytes:
    """Wraps raw PCM bytes in a valid WAV header."""
    byte_rate = sample_rate * channels * (bits_per_sample // 8)
    block_align = channels * (bits_per_sample // 8)
    data_size = len(pcm_data)

    header = struct.pack(
        "<4sI4s4sIHHIIHH4sI",
        b"RIFF",
        36 + data_size,
        b"WAVE",
        b"fmt ",
        16,
        1,  # PCM format
        channels,
        sample_rate,
        byte_rate,
        block_align,
        bits_per_sample,
        b"data",
        data_size,
    )
    return header + pcm_data


def _extract_audio(response_json: dict) -> tuple[str, str]:
    """Extracts base64 audio data and mime type from the Gemini response."""
    candidates = response_json.get("candidates")
    if not isinstance(candidates, list) or not candidates:
        raise HTTPException(status_code=502, detail="Gemini TTS returned no candidates.")

    parts = candidates[0].get("content", {}).get("parts", [])
    for part in parts:
        inline_data = part.get("inlineData")
        if inline_data and "data" in inline_data:
            return inline_data["data"], inline_data.get("mimeType", "audio/wav")

    raise HTTPException(status_code=502, detail="Gemini TTS response contained no audio data.")


async def generate_speech(text: str, language_code: str = "en-IN", voice_name: str = "Kore") -> dict:
    api_key = _get_api_key()
    headers = {
        "x-goog-api-key": api_key,
        "Content-Type": "application/json",
    }
    payload = _build_tts_payload(text, language_code, voice_name)

    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(TTS_API_URL, json=payload, headers=headers)

    if response.status_code >= 300:
        raise HTTPException(
            status_code=502,
            detail=f"Gemini TTS API failed ({response.status_code}): {response.text}",
        )

    response_json = response.json()
    audio_b64, mime_type = _extract_audio(response_json)

    # If the API returns raw PCM audio, wrap it in a WAV container
    if mime_type in ("audio/L16", "audio/pcm"):
        pcm_bytes = base64.b64decode(audio_b64)
        wav_bytes = _pcm_to_wav(pcm_bytes)
        audio_b64 = base64.b64encode(wav_bytes).decode("utf-8")
        mime_type = "audio/wav"

    return {"audio_base64": audio_b64, "mime_type": mime_type}
