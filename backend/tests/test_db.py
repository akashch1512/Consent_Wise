from app.core.db import db_enabled, normalize_db_url


def test_db_enabled_in_tests():
    assert db_enabled() is True


def test_normalize_db_url_forces_async_driver():
    assert normalize_db_url("postgres://u:p@h/db") == "postgresql+asyncpg://u:p@h/db"
    assert normalize_db_url("postgresql://u:p@h/db") == "postgresql+asyncpg://u:p@h/db"
    assert normalize_db_url("sqlite:///x.db") == "sqlite+aiosqlite:///x.db"
    # Already-explicit drivers are left alone.
    assert normalize_db_url("postgresql+asyncpg://h/db") == "postgresql+asyncpg://h/db"
    assert normalize_db_url("sqlite+aiosqlite:///x.db") == "sqlite+aiosqlite:///x.db"
