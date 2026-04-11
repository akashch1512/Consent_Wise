from typing import List

from pydantic import BaseModel, Field


class SummaryRequest(BaseModel):
    text: str = Field(..., title="Policy text to summarize")


class SummaryResponse(BaseModel):
    summary: str
    key_points: List[str]
    accessibility_hint: str
    intent: str
