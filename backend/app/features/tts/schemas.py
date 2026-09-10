from pydantic import BaseModel, Field


class TTSRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=5000)
    language_code: str = Field(default="en-IN")
    voice_name: str = Field(default="Kore")


class TTSResponse(BaseModel):
    audio_base64: str
    mime_type: str = "audio/wav"
