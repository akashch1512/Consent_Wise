"""Shared pytest fixtures.

Every OpenAI-backed feature reads ``OPENAI_API_KEY`` from the environment, and
persistence reads ``DATABASE_URL`` — both are set here (to a dummy key and a
throwaway SQLite file) before the app modules are imported. Outbound HTTP is
never made for real: tests mock the service function or use ``respx``.
"""

import os
import pathlib
import tempfile
import uuid

os.environ.setdefault("OPENAI_API_KEY", "test-key")

_DB_FILE = pathlib.Path(tempfile.gettempdir()) / "consentwise_test.db"
_DB_FILE.unlink(missing_ok=True)
os.environ.setdefault("DATABASE_URL", f"sqlite+aiosqlite:///{_DB_FILE}")

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client() -> TestClient:
    # Entering the context runs the lifespan hook, which creates the tables.
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def new_client_id() -> str:
    """A unique client id so persistence tests don't collide on the shared file."""
    return f"test-{uuid.uuid4().hex}"


def openai_text_response(text: str) -> dict:
    """A minimal ``/chat/completions`` response body carrying one message."""
    return {"choices": [{"message": {"role": "assistant", "content": text}}]}
