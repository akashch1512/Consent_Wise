"""Request/response models for the user API."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class UserUpsert(BaseModel):
    """Partial profile — only the provided fields are written."""

    client_id: str = Field(..., min_length=6, max_length=64)
    name: str | None = Field(None, max_length=200)
    email: str | None = Field(None, max_length=320)
    interests: list[str] | None = None
    language: str | None = Field(None, max_length=16)


class AnalysisEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    kind: str
    source: str | None
    url: str | None
    title: str | None
    danger_score: int | None
    reputation_score: int | None
    login_safety: str | None
    intent: str | None
    summary: str | None
    created_at: datetime


class UserProfile(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    client_id: str
    name: str | None
    email: str | None
    interests: list[str]
    language: str | None
    created_at: datetime
    updated_at: datetime


class UserProfileWithHistory(UserProfile):
    analysis_count: int
    recent_analyses: list[AnalysisEventOut]
