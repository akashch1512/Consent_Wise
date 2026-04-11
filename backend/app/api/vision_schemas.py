from typing import List

from pydantic import BaseModel, Field


class VisionAnalysisResponse(BaseModel):
    extracted_text: str = Field(..., description="The OCR text extracted from the image/PDF")
    summary: str = Field(..., description="A simple language summary of the document")
    key_points: List[str] = Field(..., description="Key points from the reading")
    risks: List[str] = Field(..., description="Highlighted risks, penalties, obligations, or hidden clauses")
    accessibility_hint: str = Field(..., description="An easy explanation for low-literacy users")
    intent: str = Field(..., description="The overall intent of the document")
