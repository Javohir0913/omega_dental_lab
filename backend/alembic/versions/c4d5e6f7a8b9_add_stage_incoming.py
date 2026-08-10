"""add stage_incoming (which stages may enter a given stage)

Revision ID: c4d5e6f7a8b9
Revises: b3c4d5e6f7a8
Create Date: 2026-08-10 15:00:00.000000

"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = 'c4d5e6f7a8b9'
down_revision: str | None = 'b3c4d5e6f7a8'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'stage_incoming',
        sa.Column('to_stage_id', sa.Integer(), sa.ForeignKey('stages.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('from_stage_id', sa.Integer(), sa.ForeignKey('stages.id', ondelete='CASCADE'), primary_key=True),
    )


def downgrade() -> None:
    op.drop_table('stage_incoming')
