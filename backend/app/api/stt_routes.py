from fastapi import APIRouter, HTTPException

from app.api.stt_schemas import STTRequest, STTResponse
from app.services.stt import transcribe_audio

stt_router = APIRouter(prefix="/api")


@stt_router.post("/stt", response_model=STTResponse)
async def speech_to_text(request: STTRequest):
    """
    Transcribe base64-encoded audio (webm/opus from Chrome MediaRecorder)
    using the free Google Speech Recognition HTTP endpoint.

    The extension's offscreen document records mic audio with MediaRecorder,
    encodes it as base64, and POSTs it here. We decode → temp file → ffmpeg
    → SpeechRecognition → return plain text transcript.
    """
    if not request.audio_base64:
        raise HTTPException(status_code=400, detail="audio_base64 is required.")

    try:
        transcript = await transcribe_audio(
            audio_base64=request.audio_base64,
            mime_type=request.mime_type,
            language=request.language,
        )
        return STTResponse(transcript=transcript, language=request.language)

    except ValueError as e:
        # "no-speech" — not an error, just nothing detected
        if "no-speech" in str(e):
            return STTResponse(transcript="", language=request.language)
        raise HTTPException(status_code=422, detail=str(e))

    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))
