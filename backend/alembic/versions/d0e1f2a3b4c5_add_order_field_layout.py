"""add order_field_sections and order_field_layout

Revision ID: d0e1f2a3b4c5
Revises: c9d0e1f2a3b4
Create Date: 2026-07-23 14:00:00.000000

"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = 'd0e1f2a3b4c5'
down_revision: str | None = 'c9d0e1f2a3b4'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'order_field_sections',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('entity', sa.String(length=16), nullable=False, server_default='order'),
        sa.Column('code', sa.String(length=48), nullable=False),
        sa.Column('name_ru', sa.String(length=64), nullable=False),
        sa.Column('name_uz', sa.String(length=64), nullable=False),
        sa.Column('sort', sa.Integer(), nullable=False, server_default='100'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint('entity', 'code', name='uq_order_field_sections_entity_code'),
    )
    op.create_index('ix_order_field_sections_entity', 'order_field_sections', ['entity'])
    op.create_index('ix_order_field_sections_sort', 'order_field_sections', ['sort'])

    op.create_table(
        'order_field_layout',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('entity', sa.String(length=16), nullable=False, server_default='order'),
        sa.Column(
            'section_id', sa.Integer(),
            sa.ForeignKey('order_field_sections.id', ondelete='CASCADE'), nullable=False,
        ),
        sa.Column('field_ref', sa.String(length=64), nullable=False),
        sa.Column('sort', sa.Integer(), nullable=False, server_default='100'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint('entity', 'field_ref', name='uq_order_field_layout_entity_ref'),
    )
    op.create_index('ix_order_field_layout_entity', 'order_field_layout', ['entity'])
    op.create_index('ix_order_field_layout_section_id', 'order_field_layout', ['section_id'])


def downgrade() -> None:
    op.drop_index('ix_order_field_layout_section_id', table_name='order_field_layout')
    op.drop_index('ix_order_field_layout_entity', table_name='order_field_layout')
    op.drop_table('order_field_layout')
    op.drop_index('ix_order_field_sections_sort', table_name='order_field_sections')
    op.drop_index('ix_order_field_sections_entity', table_name='order_field_sections')
    op.drop_table('order_field_sections')
