from fastapi import APIRouter, HTTPException

from app.api.schemas import SummaryRequest, SummaryResponse
from app.services.gemini import generate_summary

router = APIRouter(prefix="/api")


@router.post("/summarize", response_model=SummaryResponse)
async def summarize_policy(request: SummaryRequest):
    cleaned_text = request.text.strip()
    if not cleaned_text:
        raise HTTPException(
            status_code=400,
            detail="Text cannot be empty.",
        )
    return await generate_summary(cleaned_text)
