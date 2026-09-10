from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.features.users.service import record_analysis
from app.features.vision.schemas import VisionAnalysisResponse
from app.features.vision.service import analyze_image

vision_router = APIRouter(prefix="/api")

ALLOWED_MIME_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
    "application/pdf",
}


@vision_router.post("/analyze-document", response_model=VisionAnalysisResponse)
async def analyze_document(
    file: UploadFile = File(...),
    client_id: str | None = Form(None),
):
    """Extract and analyse text from an uploaded image or PDF.

    multipart/form-data:
      • ``file``      — the image (JPG/PNG/WEBP/HEIC) or PDF (required)
      • ``client_id`` — extension client id; when present the result is saved
                        to that user's analysis history (optional)

    Returns ``{ extracted_text, summary, key_points, risks, accessibility_hint, intent }``.
    """
    if not file.content_type or file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type: {file.content_type}. Must be a valid Image or PDF.",
        )

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    result = await analyze_image(file_bytes=file_bytes, mime_type=file.content_type)

    await record_analysis(
        client_id,
        kind="document",
        source="extension-upload",
        title=file.filename,
        intent=result.intent,
        summary=result.summary,
    )

    return result
