"""add deleted_at to orders for soft delete

Revision ID: a1b2c3d4e5f6
Revises: e420cd87bd3f
Create Date: 2026-07-20 12:00:00.000000

"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'a1b2c3d4e5f6'
down_revision: str | None = 'e420cd87bd3f'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('orders', sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True, index=True))


def downgrade() -> None:
    op.drop_column('orders', 'deleted_at')
