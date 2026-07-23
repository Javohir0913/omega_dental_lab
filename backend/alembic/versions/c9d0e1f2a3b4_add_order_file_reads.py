"""add order_file_reads (per-user unread files tracking)

Revision ID: c9d0e1f2a3b4
Revises: b8c9d0e1f2a3
Create Date: 2026-07-23 12:00:00.000000

"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = 'c9d0e1f2a3b4'
down_revision: str | None = 'b8c9d0e1f2a3'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'order_file_reads',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('order_id', sa.Integer(), sa.ForeignKey('orders.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('last_read_at', sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint('order_id', 'user_id', name='uq_order_file_read'),
    )
    op.create_index('ix_order_file_reads_order_id', 'order_file_reads', ['order_id'])
    op.create_index('ix_order_file_reads_user_id', 'order_file_reads', ['user_id'])


def downgrade() -> None:
    op.drop_index('ix_order_file_reads_user_id', table_name='order_file_reads')
    op.drop_index('ix_order_file_reads_order_id', table_name='order_file_reads')
    op.drop_table('order_file_reads')
