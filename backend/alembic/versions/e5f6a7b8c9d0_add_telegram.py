"""add telegram_contacts table and notify_templates.send_telegram

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-07-22 09:30:00.000000

"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = 'e5f6a7b8c9d0'
down_revision: str | None = 'd4e5f6a7b8c9'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'telegram_contacts',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('chat_id', sa.BigInteger(), nullable=False),
        sa.Column('tg_username', sa.String(length=64), nullable=True),
        sa.Column('tg_first_name', sa.String(length=128), nullable=True),
        sa.Column('started_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.Column('last_digest_sent_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_digest_week_sent_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint('chat_id', name='uq_telegram_contacts_chat_id'),
        sa.UniqueConstraint('user_id', name='uq_telegram_contacts_user_id'),
    )
    op.create_index('ix_telegram_contacts_chat_id', 'telegram_contacts', ['chat_id'])
    op.create_foreign_key(
        'fk_telegram_contacts_user_id_users',
        'telegram_contacts', 'users',
        ['user_id'], ['id'],
        ondelete='SET NULL',
    )

    op.add_column(
        'notify_templates',
        sa.Column('send_telegram', sa.Boolean(), server_default=sa.false(), nullable=False),
    )


def downgrade() -> None:
    op.drop_column('notify_templates', 'send_telegram')
    op.drop_constraint('fk_telegram_contacts_user_id_users', 'telegram_contacts', type_='foreignkey')
    op.drop_index('ix_telegram_contacts_chat_id', table_name='telegram_contacts')
    op.drop_table('telegram_contacts')
