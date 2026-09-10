from pydantic import BaseModel


class STTRequest(BaseModel):
    audio_base64: str
    mime_type: str = "audio/webm"
    language: str = "en-IN"


class STTResponse(BaseModel):
    transcript: str
    language: str
