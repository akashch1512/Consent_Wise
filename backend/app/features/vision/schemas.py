from pydantic import BaseModel, Field


class VisionAnalysisResponse(BaseModel):
    extracted_text: str = Field(..., description="The OCR text extracted from the image/PDF")
    summary: str = Field(..., description="A simple language summary of the document")
    key_points: list[str] = Field(..., description="Key points from the reading")
    risks: list[str] = Field(
        ..., description="Highlighted risks, penalties, obligations, or hidden clauses"
    )
    accessibility_hint: str = Field(..., description="An easy explanation for low-literacy users")
    intent: str = Field(..., description="The overall intent of the document")
