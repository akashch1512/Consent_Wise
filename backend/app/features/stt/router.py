from fastapi import APIRouter, HTTPException

from app.features.stt.schemas import STTRequest, STTResponse
from app.features.stt.service import transcribe_audio

stt_router = APIRouter(prefix="/api")


@stt_router.post("/stt", response_model=STTResponse)
async def speech_to_text(request: STTRequest):
    """Transcribe base64-encoded mic audio via the OpenAI transcription API.

    The extension's offscreen document records with MediaRecorder, base64-encodes
    the blob, and POSTs it here; Whisper accepts the webm/opus container directly.
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
    except ValueError as exc:
        if "no-speech" in str(exc):
            # Not an error — the recording just had no recognisable speech.
            return STTResponse(transcript="", language=request.language)
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
