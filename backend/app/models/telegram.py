from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class TelegramContact(Base, TimestampMixin):
    """Botga /start bosgan Telegram akkaunt. `user_id` bo'lmasa — hali biriktirilmagan."""

    __tablename__ = "telegram_contacts"

    id: Mapped[int] = mapped_column(primary_key=True)
    chat_id: Mapped[int] = mapped_column(BigInteger, unique=True, index=True)
    tg_username: Mapped[str | None] = mapped_column(String(64), nullable=True)
    tg_first_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), unique=True, nullable=True
    )
    user: Mapped["User | None"] = relationship(lazy="selectin")  # noqa: F821

    last_digest_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_digest_week_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
