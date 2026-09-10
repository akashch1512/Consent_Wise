"""Persistence helpers for user profiles and analysis history."""

import logging

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import db_enabled, session_scope
from app.features.users.models import AnalysisEvent, User
from app.features.users.schemas import UserUpsert

logger = logging.getLogger(__name__)

# Keep only the newest N events available through the profile endpoint.
RECENT_ANALYSES_LIMIT = 20


async def get_user(session: AsyncSession, client_id: str) -> User | None:
    result = await session.execute(select(User).where(User.client_id == client_id))
    return result.scalar_one_or_none()


async def delete_user(session: AsyncSession, client_id: str) -> bool:
    """Delete the user and their analysis history. Returns True if a row existed."""
    user = await get_user(session, client_id)
    if user is None:
        return False
    await session.delete(user)
    return True


async def upsert_user(session: AsyncSession, payload: UserUpsert) -> User:
    """Create the user or merge the provided (non-null) fields into an existing row."""
    user = await get_user(session, payload.client_id)
    if user is None:
        user = User(client_id=payload.client_id, interests=[])
        session.add(user)

    if payload.name is not None:
        user.name = payload.name
    if payload.email is not None:
        user.email = payload.email
    if payload.interests is not None:
        user.interests = payload.interests
    if payload.language is not None:
        user.language = payload.language

    await session.flush()
    # Load server-side defaults (created_at / updated_at) before the session closes.
    await session.refresh(user)
    return user


async def count_analyses(session: AsyncSession, user_id: int) -> int:
    result = await session.execute(
        select(func.count()).select_from(AnalysisEvent).where(AnalysisEvent.user_id == user_id)
    )
    return int(result.scalar_one())


async def recent_analyses(session: AsyncSession, user_id: int) -> list[AnalysisEvent]:
    result = await session.execute(
        select(AnalysisEvent)
        .where(AnalysisEvent.user_id == user_id)
        .order_by(AnalysisEvent.created_at.desc())
        .limit(RECENT_ANALYSES_LIMIT)
    )
    return list(result.scalars().all())


async def record_analysis(
    client_id: str | None,
    *,
    kind: str,
    source: str | None = None,
    url: str | None = None,
    title: str | None = None,
    danger_score: int | None = None,
    reputation_score: int | None = None,
    login_safety: str | None = None,
    intent: str | None = None,
    summary: str | None = None,
) -> None:
    """Best-effort append to a user's analysis history.

    Silently does nothing when persistence is disabled or ``client_id`` is
    missing, and never raises into the caller's hot path.
    """
    if not client_id or not db_enabled():
        return
    try:
        async with session_scope() as session:
            user = await get_user(session, client_id)
            if user is None:
                user = User(client_id=client_id, interests=[])
                session.add(user)
                await session.flush()
            session.add(
                AnalysisEvent(
                    user_id=user.id,
                    kind=kind,
                    source=source,
                    url=url or None,
                    title=title or None,
                    danger_score=danger_score,
                    reputation_score=reputation_score,
                    login_safety=login_safety,
                    intent=intent or None,
                    summary=summary or None,
                )
            )
    except Exception:  # noqa: BLE001 — history must never break analysis
        logger.exception("Failed to record analysis event for client %s", client_id)
