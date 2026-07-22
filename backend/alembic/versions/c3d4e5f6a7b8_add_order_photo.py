"""add photo_file_id to orders (single cover image field)

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-07-22 13:00:00.000000

"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = 'c3d4e5f6a7b8'
down_revision: str | None = 'b2c3d4e5f6a7'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('orders', sa.Column('photo_file_id', sa.Integer(), nullable=True))
    op.create_foreign_key(
        'fk_orders_photo_file_id_files',
        'orders', 'files',
        ['photo_file_id'], ['id'],
        ondelete='SET NULL',
    )


def downgrade() -> None:
    op.drop_constraint('fk_orders_photo_file_id_files', 'orders', type_='foreignkey')
    op.drop_column('orders', 'photo_file_id')
