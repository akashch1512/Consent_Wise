"""initial user + analysis_events tables

Revision ID: 0001_initial
Revises:
Create Date: 2026-09-10

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0001_initial"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("client_id", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=True),
        sa.Column("email", sa.String(length=320), nullable=True),
        sa.Column("interests", sa.JSON(), nullable=True),
        sa.Column("language", sa.String(length=16), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_users_client_id", "users", ["client_id"], unique=True)
    op.create_index("ix_users_email", "users", ["email"])

    op.create_table(
        "analysis_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("source", sa.String(length=64), nullable=True),
        sa.Column("url", sa.Text(), nullable=True),
        sa.Column("title", sa.Text(), nullable=True),
        sa.Column("danger_score", sa.Integer(), nullable=True),
        sa.Column("reputation_score", sa.Integer(), nullable=True),
        sa.Column("login_safety", sa.String(length=16), nullable=True),
        sa.Column("intent", sa.Text(), nullable=True),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_analysis_events_user_id", "analysis_events", ["user_id"])
    op.create_index("ix_analysis_events_created_at", "analysis_events", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_analysis_events_created_at", table_name="analysis_events")
    op.drop_index("ix_analysis_events_user_id", table_name="analysis_events")
    op.drop_table("analysis_events")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_index("ix_users_client_id", table_name="users")
    op.drop_table("users")
