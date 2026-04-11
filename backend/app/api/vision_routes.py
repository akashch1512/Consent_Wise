from fastapi import APIRouter, HTTPException, File, UploadFile
from app.api.vision_schemas import VisionAnalysisResponse
from app.services.vision import analyze_image

vision_router = APIRouter(prefix="/api")

ALLOWED_MIME_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
    "application/pdf"
}

@vision_router.post("/analyze-document", response_model=VisionAnalysisResponse)
async def analyze_document(file: UploadFile = File(...)):
    """
    Frontend Integration Guide:
    
    1. Endpoint: POST /api/analyze-document
    2. Request Format: multipart/form-data
       - Add a parameter named 'file' containing the Image (JPG/PNG/WEBP) or PDF to analyze.
       
    Example using Fetch API:
    ---------------------------------
    const formData = new FormData();
    formData.append("file", fileInput.files[0]);
    
    const response = await fetch("/api/analyze-document", {
      method: "POST",
      body: formData
    });
    
    const data = await response.json();
    console.log(data); // returns { extracted_text, summary, key_points, risks, accessibility_hint, intent }
    ---------------------------------
    """
    
    if not file.content_type or file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=400, 
            detail=f"Invalid file type: {file.content_type}. Must be a valid Image or PDF."
        )

    file_bytes = await file.read()
    
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    # Pass the document to Gemini Vision via our service
    result = await analyze_image(file_bytes=file_bytes, mime_type=file.content_type)
    
    return result
