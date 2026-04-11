import base64
import io
import tempfile
import os

import speech_recognition as sr
from pydub import AudioSegment


LANGUAGE_MAP = {
    "en-IN": "en-IN",
    "en-US": "en-US",
    "hi-IN": "hi-IN",
    "mr-IN": "mr-IN",
    "ta-IN": "ta-IN",
    "te-IN": "te-IN",
    "kn-IN": "kn-IN",
    "ml-IN": "ml-IN",
    "gu-IN": "gu-IN",
    "pa-IN": "pa-IN",
    "bn-IN": "bn-IN",
}


async def transcribe_audio(audio_base64: str, mime_type: str, language: str) -> str:
    """
    Decode a base64-encoded audio blob (webm/opus from Chrome MediaRecorder),
    convert to WAV via pydub (requires ffmpeg on PATH), then transcribe with
    the SpeechRecognition library using Google's free HTTP STT endpoint.

    System requirement: ffmpeg must be installed.
      Linux  → sudo apt-get install -y ffmpeg
      macOS  → brew install ffmpeg

    Returns the transcript string, or raises ValueError("no-speech") when
    nothing was detected, or RuntimeError on network/API failure.
    """
    lang_code = LANGUAGE_MAP.get(language, "en-IN")

    # ── 1. Base64-decode ────────────────────────────────────────────────────────
    try:
        audio_bytes = base64.b64decode(audio_base64)
    except Exception as e:
        raise ValueError(f"Invalid base64 payload: {e}")

    # ── 2. Detect container format ──────────────────────────────────────────────
    if "ogg" in mime_type:
        fmt = "ogg"
    elif "mp4" in mime_type or "m4a" in mime_type:
        fmt = "mp4"
    elif "wav" in mime_type:
        fmt = "wav"
    else:
        fmt = "webm"  # default from Chrome MediaRecorder

    # ── 3. Convert to WAV using pydub (delegates to ffmpeg) ─────────────────────
    try:
        segment = AudioSegment.from_file(io.BytesIO(audio_bytes), format=fmt)
        wav_io = io.BytesIO()
        segment.export(wav_io, format="wav")
        wav_io.seek(0)
    except Exception as e:
        raise RuntimeError(
            f"Audio conversion failed ({fmt}→wav). Is ffmpeg installed? Error: {e}"
        )

    # ── 4. Transcribe ────────────────────────────────────────────────────────────
    recognizer = sr.Recognizer()
    recognizer.energy_threshold = 300
    recognizer.dynamic_energy_threshold = True

    with sr.AudioFile(wav_io) as source:
        audio_data = recognizer.record(source)

    try:
        transcript = recognizer.recognize_google(audio_data, language=lang_code)
        return transcript
    except sr.UnknownValueError:
        raise ValueError("no-speech")
    except sr.RequestError as e:
        raise RuntimeError(f"Google STT request failed: {e}")
