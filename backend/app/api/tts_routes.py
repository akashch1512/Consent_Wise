from fastapi import APIRouter, HTTPException

from app.api.tts_schemas import TTSRequest, TTSResponse
from app.services.tts import generate_speech

tts_router = APIRouter(prefix="/api")


@tts_router.post("/tts", response_model=TTSResponse)
async def text_to_speech(request: TTSRequest):
    """
    Generate Text-to-Speech audio from text using Gemini API.
    
    Why this API returns Base64 audio instead of an MP3 stream:
    1. Zero State: No need to manage, save, or clean up temporary audio files on the backend.
    2. Easy Frontend Integration: Can be played instantly in the browser via a Data URI:
       <audio src="data:audio/wav;base64,{audio_base64}" autoplay />
    3. Payload Size: Gemini TTS handles short text snippets, making the file sizes manageable over JSON.
    
    Note: If the application ever needs to generate very long audio (e.g. 1+ minute narration), 
    we should consider migrating to streaming MP3s for faster time-to-first-byte playback.
    """
    cleaned_text = request.text.strip()
    if not cleaned_text:
        raise HTTPException(status_code=400, detail="Text cannot be empty.")

    result = await generate_speech(
        text=cleaned_text,
        language_code=request.language_code,
        voice_name=request.voice_name,
    )
    return result
