"""Async SQLAlchemy setup for per-user persistence.

Durable user data (profile, analysis history) lives in Postgres in production.
The connection string comes from ``DATABASE_URL``:

    postgresql+asyncpg://user:pass@host:5432/consentwise

If ``DATABASE_URL`` is unset the whole persistence layer is disabled — the API
still serves every other feature, and the ``/api/users`` routes return 503.
Tests point ``DATABASE_URL`` at an in-memory SQLite database.
"""

import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Base class for all ORM models."""


def normalize_db_url(raw: str) -> str:
    """Accept the common URL spellings and force an async driver."""
    if raw.startswith("postgres://"):
        raw = "postgresql://" + raw[len("postgres://") :]
    if raw.startswith("postgresql://"):
        return "postgresql+asyncpg://" + raw[len("postgresql://") :]
    if raw.startswith("sqlite://") and "+aiosqlite" not in raw:
        return "sqlite+aiosqlite://" + raw[len("sqlite://") :]
    return raw


_DATABASE_URL = os.getenv("DATABASE_URL", "").strip()
_engine = None
_sessionmaker: async_sessionmaker[AsyncSession] | None = None

if _DATABASE_URL:
    _engine = create_async_engine(normalize_db_url(_DATABASE_URL), future=True)
    _sessionmaker = async_sessionmaker(_engine, expire_on_commit=False)


def db_enabled() -> bool:
    """True when a database is configured."""
    return _sessionmaker is not None


async def init_models() -> None:
    """Ensure tables exist for local SQLite (tests, quick demos).

    Postgres schema is owned by Alembic — run ``alembic upgrade head``.
    No-op when the DB is disabled or when it is not SQLite.
    """
    if _engine is None or not _engine.url.get_backend_name().startswith("sqlite"):
        return
    # Import models so they are registered on Base.metadata before create_all.
    from app.features.users import models  # noqa: F401

    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


@asynccontextmanager
async def session_scope() -> AsyncIterator[AsyncSession]:
    """Transactional session context manager for use outside request handlers."""
    if _sessionmaker is None:
        raise RuntimeError("Database is not configured (set DATABASE_URL).")
    async with _sessionmaker() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def get_session() -> AsyncIterator[AsyncSession]:
    """FastAPI dependency yielding a committed-on-success session."""
    async with session_scope() as session:
        yield session
