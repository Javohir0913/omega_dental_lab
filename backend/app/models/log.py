from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class LogLevel:
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"

    ALL = (INFO, WARNING, ERROR)


class LogCategory:
    AUTH = "auth"          # kirish/chiqish, sessiya
    ORDER = "order"        # proyekt hodisalari
    CATALOG = "catalog"    # patsent/vrach/xizmat
    USER = "user"          # xodim, parol, rol
    ADMIN = "admin"        # adminka sozlamalari
    CHAT = "chat"
    FILE = "file"
    SYSTEM = "system"      # ushlanmagan xatolar, migratsiya, tizim

    ALL = (AUTH, ORDER, CATALOG, USER, ADMIN, CHAT, FILE, SYSTEM)


class ActivityLog(Base):
    """Yagona log jadvali.

    - Proyekt logi  = shu jadvaldan `order_id = X` bo'yicha filtr (log.order huquqi).
    - Tizim logi    = butun jadval, error/warning bilan birga (log.system huquqi,
      amalda faqat super admin).

    Muvaffaqiyatli ham, muvaffaqiyatsiz ham harakat yoziladi: `is_success`.
    """

    __tablename__ = "activity_logs"
    __table_args__ = (
        Index("ix_activity_logs_order_created", "order_id", "created_at"),
        Index("ix_activity_logs_level_created", "level", "created_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)

    level: Mapped[str] = mapped_column(String(8), default=LogLevel.INFO, index=True)
    category: Mapped[str] = mapped_column(String(16), default=LogCategory.SYSTEM, index=True)
    action: Mapped[str] = mapped_column(String(64), index=True)  # "order.stage_changed"
    is_success: Mapped[bool] = mapped_column(Boolean, default=True, index=True)

    # kim qildi
    actor_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    actor: Mapped["User | None"] = relationship(lazy="selectin")  # noqa: F821
    actor_name: Mapped[str | None] = mapped_column(String(128), nullable=True)  # user o'chsa ham qolsin

    # nimaga tegishli
    order_id: Mapped[int | None] = mapped_column(
        ForeignKey("orders.id", ondelete="CASCADE"), nullable=True, index=True
    )
    entity: Mapped[str | None] = mapped_column(String(24), nullable=True)
    entity_id: Mapped[int | None] = mapped_column(nullable=True)

    message_ru: Mapped[str] = mapped_column(Text, default="")
    message_uz: Mapped[str] = mapped_column(Text, default="")

    # {"from": {...}, "to": {...}} — o'zgarish tafsiloti
    meta: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # so'rov konteksti (tizim logi uchun)
    ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(Text, nullable=True)
    path: Mapped[str | None] = mapped_column(String(255), nullable=True)
    method: Mapped[str | None] = mapped_column(String(8), nullable=True)
    status_code: Mapped[int | None] = mapped_column(nullable=True)
    error_text: Mapped[str | None] = mapped_column(Text, nullable=True)  # traceback
