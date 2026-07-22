"""add hidden flag to chat_members for archiving chats

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-07-22 12:00:00.000000

"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = 'b2c3d4e5f6a7'
down_revision: str | None = 'a1b2c3d4e5f6'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        'chat_members',
        sa.Column('hidden', sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.alter_column('chat_members', 'hidden', server_default=None)


def downgrade() -> None:
    op.drop_column('chat_members', 'hidden')
