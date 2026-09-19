"""add composite indexes for kanban column ordering

Revision ID: b1c2d3e4f5a6
Revises: a4b5c6d7e8f9
Create Date: 2026-09-19 00:00:00.000000

"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = 'b1c2d3e4f5a6'
down_revision: str | None = 'a4b5c6d7e8f9'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Kanban ish ustunlari `WHERE stage_id = X ORDER BY priority, sort, id DESC`
    # bilan sahifalanadi — yakka `stage_id` indeksi bu holda faqat qatorlarni
    # topishga yordam beradi, lekin sortni baribir alohida bosqichda bajaradi.
    op.create_index(
        'ix_orders_stage_priority_sort',
        'orders',
        ['stage_id', 'priority', 'sort', 'id'],
    )
    # Yopiq ustunlar (Успех/Провал) `WHERE stage_id = X ORDER BY closed_at DESC, id DESC`.
    op.create_index(
        'ix_orders_stage_closed_at',
        'orders',
        ['stage_id', 'closed_at'],
    )
    # `_visibility_filter`/`_get_order` texnik o'ziga tayinlanmagan, o'zi yaratgan
    # proyektlarni ko'rishi uchun `created_by_id` bo'yicha filtrlaydi — indekssiz.
    op.create_index('ix_orders_created_by_id', 'orders', ['created_by_id'])


def downgrade() -> None:
    op.drop_index('ix_orders_created_by_id', table_name='orders')
    op.drop_index('ix_orders_stage_closed_at', table_name='orders')
    op.drop_index('ix_orders_stage_priority_sort', table_name='orders')
