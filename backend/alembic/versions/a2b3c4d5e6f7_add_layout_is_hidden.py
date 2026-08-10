"""add is_hidden to order_field_layout

Revision ID: a2b3c4d5e6f7
Revises: f1a2b3c4d5e6
Create Date: 2026-08-10 13:00:00.000000

"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = 'a2b3c4d5e6f7'
down_revision: str | None = 'f1a2b3c4d5e6'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        'order_field_layout',
        sa.Column('is_hidden', sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.alter_column('order_field_layout', 'is_hidden', server_default=None)


def downgrade() -> None:
    op.drop_column('order_field_layout', 'is_hidden')
