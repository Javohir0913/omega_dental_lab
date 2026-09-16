"""add index on orders.stage_deadline

Revision ID: a4b5c6d7e8f9
Revises: d5e6f7a8b9c0
Create Date: 2026-09-16 00:00:00.000000

"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = 'a4b5c6d7e8f9'
down_revision: str | None = 'd5e6f7a8b9c0'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # kanban'dagi `overdue` filtri va fon `check_overdue()` vazifasi
    # `WHERE stage_deadline < now` bilan muntazam qidiradi — indekssiz bu
    # proyektlar ko'payganda full table scan'ga aylanadi.
    op.create_index('ix_orders_stage_deadline', 'orders', ['stage_deadline'])


def downgrade() -> None:
    op.drop_index('ix_orders_stage_deadline', table_name='orders')
