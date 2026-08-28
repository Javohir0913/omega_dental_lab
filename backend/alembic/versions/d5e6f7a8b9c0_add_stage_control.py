"""add stage control (mandatory review before leaving a stage)

Revision ID: d5e6f7a8b9c0
Revises: c4d5e6f7a8b9
Create Date: 2026-08-28 12:00:00.000000

"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = 'd5e6f7a8b9c0'
down_revision: str | None = 'c4d5e6f7a8b9'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('stages', sa.Column('control_enabled', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('stages', sa.Column('control_pause_deadline', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.alter_column('stages', 'control_enabled', server_default=None)
    op.alter_column('stages', 'control_pause_deadline', server_default=None)

    op.create_table(
        'stage_controllers',
        sa.Column('stage_id', sa.Integer(), sa.ForeignKey('stages.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), primary_key=True),
    )

    op.create_table(
        'order_controls',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('order_id', sa.Integer(), sa.ForeignKey('orders.id', ondelete='CASCADE'), nullable=False),
        sa.Column('from_stage_id', sa.Integer(), sa.ForeignKey('stages.id'), nullable=False),
        sa.Column('target_stage_id', sa.Integer(), sa.ForeignKey('stages.id'), nullable=False),
        sa.Column('controller_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('requested_by_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('next_responsible_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('requested_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('comment', sa.Text(), nullable=True),
        sa.Column('status', sa.String(length=16), nullable=False, server_default='pending'),
        sa.Column('resolved_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('resolved_comment', sa.Text(), nullable=True),
    )
    op.create_index('ix_order_controls_order_id', 'order_controls', ['order_id'])
    op.create_index('ix_order_controls_status', 'order_controls', ['status'])
    op.alter_column('order_controls', 'status', server_default=None)

    op.add_column(
        'orders',
        sa.Column('control_id', sa.Integer(), sa.ForeignKey('order_controls.id', ondelete='SET NULL'), nullable=True),
    )
    op.create_index('ix_orders_control_id', 'orders', ['control_id'])


def downgrade() -> None:
    op.drop_index('ix_orders_control_id', table_name='orders')
    op.drop_column('orders', 'control_id')
    op.drop_index('ix_order_controls_status', table_name='order_controls')
    op.drop_index('ix_order_controls_order_id', table_name='order_controls')
    op.drop_table('order_controls')
    op.drop_table('stage_controllers')
    op.drop_column('stages', 'control_pause_deadline')
    op.drop_column('stages', 'control_enabled')
