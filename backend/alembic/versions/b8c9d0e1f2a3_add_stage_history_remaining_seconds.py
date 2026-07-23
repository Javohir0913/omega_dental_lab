"""add order_stage_history.remaining_seconds

Revision ID: b8c9d0e1f2a3
Revises: a7b8c9d0e1f2
Create Date: 2026-07-23 10:00:00.000000

"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = 'b8c9d0e1f2a3'
down_revision: str | None = 'a7b8c9d0e1f2'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        'order_stage_history',
        sa.Column('remaining_seconds', sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('order_stage_history', 'remaining_seconds')
