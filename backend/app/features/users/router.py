"""User profile + analysis-history API.

Users are identified by the extension-generated ``client_id`` (no login).
All routes 503 when ``DATABASE_URL`` is not configured.
"""

from collections.abc import AsyncIterator

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import db_enabled, session_scope
from app.features.users import service
from app.features.users.schemas import (
    UserProfile,
    UserProfileWithHistory,
    UserUpsert,
)

users_router = APIRouter(prefix="/api/users", tags=["users"])


async def require_session() -> AsyncIterator[AsyncSession]:
    """Yield a DB session, or 503 if persistence is not configured."""
    if not db_enabled():
        raise HTTPException(
            status_code=503,
            detail="User persistence is not configured. Set DATABASE_URL on the backend.",
        )
    async with session_scope() as session:
        yield session


@users_router.post("", response_model=UserProfile)
async def upsert_profile(
    payload: UserUpsert,
    session: AsyncSession = Depends(require_session),
):
    return await service.upsert_user(session, payload)


@users_router.get("/{client_id}", response_model=UserProfileWithHistory)
async def get_profile(
    client_id: str,
    session: AsyncSession = Depends(require_session),
):
    user = await service.get_user(session, client_id)
    if user is None:
        raise HTTPException(status_code=404, detail="Unknown client_id.")

    return UserProfileWithHistory(
        client_id=user.client_id,
        name=user.name,
        email=user.email,
        interests=user.interests or [],
        language=user.language,
        created_at=user.created_at,
        updated_at=user.updated_at,
        analysis_count=await service.count_analyses(session, user.id),
        recent_analyses=await service.recent_analyses(session, user.id),
    )


@users_router.delete("/{client_id}", status_code=204)
async def delete_profile(
    client_id: str,
    session: AsyncSession = Depends(require_session),
):
    await service.delete_user(session, client_id)
    return Response(status_code=204)
