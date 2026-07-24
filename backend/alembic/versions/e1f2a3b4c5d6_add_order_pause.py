"""add orders pause fields

Revision ID: e1f2a3b4c5d6
Revises: d0e1f2a3b4c5
Create Date: 2026-07-24 10:00:00.000000

"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = 'e1f2a3b4c5d6'
down_revision: str | None = 'd0e1f2a3b4c5'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('orders', sa.Column('is_paused', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('orders', sa.Column('paused_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('orders', sa.Column('pause_reason', sa.Text(), nullable=True))
    op.add_column(
        'orders',
        sa.Column('paused_by_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
    )
    op.add_column('orders', sa.Column('stage_deadline_frozen_remaining_sec', sa.Integer(), nullable=True))
    op.create_index(op.f('ix_orders_is_paused'), 'orders', ['is_paused'])
    op.alter_column('orders', 'is_paused', server_default=None)


def downgrade() -> None:
    op.drop_index(op.f('ix_orders_is_paused'), table_name='orders')
    op.drop_column('orders', 'stage_deadline_frozen_remaining_sec')
    op.drop_column('orders', 'paused_by_id')
    op.drop_column('orders', 'pause_reason')
    op.drop_column('orders', 'paused_at')
    op.drop_column('orders', 'is_paused')
