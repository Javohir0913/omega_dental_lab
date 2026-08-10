"""add stage_transitions (configurable stage-to-stage transition matrix)

Revision ID: b3c4d5e6f7a8
Revises: a2b3c4d5e6f7
Create Date: 2026-08-10 13:30:00.000000

"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = 'b3c4d5e6f7a8'
down_revision: str | None = 'a2b3c4d5e6f7'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'stage_transitions',
        sa.Column('from_stage_id', sa.Integer(), sa.ForeignKey('stages.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('to_stage_id', sa.Integer(), sa.ForeignKey('stages.id', ondelete='CASCADE'), primary_key=True),
    )


def downgrade() -> None:
    op.drop_table('stage_transitions')
