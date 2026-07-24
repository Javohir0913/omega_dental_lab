from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class NotifyEvent:
    ORDER_CREATED = "order.created"
    ORDER_STAGE_CHANGED = "order.stage_changed"
    ORDER_ASSIGNED = "order.assigned"
    ORDER_CLAIMED = "order.claimed"
    ORDER_UNASSIGNED = "order.unassigned"
    ORDER_RENAMED = "order.renamed"
    ORDER_SUCCESS = "order.success"
    ORDER_FAIL = "order.fail"
    ORDER_OVERDUE = "order.overdue"  # joriy bosqich dedlayni o'tdi
    ORDER_DEADLINE_OVERDUE = "order.deadline_overdue"  # proyektning umumiy dedlayni o'tdi
    ORDER_FILE = "order.file"
    ORDER_PAUSED = "order.paused"
    ORDER_RESUMED = "order.resumed"
    CHAT_MESSAGE = "chat.message"

    ALL = [
        ORDER_CREATED, ORDER_STAGE_CHANGED, ORDER_ASSIGNED, ORDER_CLAIMED,
        ORDER_UNASSIGNED, ORDER_RENAMED, ORDER_SUCCESS, ORDER_FAIL,
        ORDER_OVERDUE, ORDER_DEADLINE_OVERDUE, ORDER_FILE,
        ORDER_PAUSED, ORDER_RESUMED, CHAT_MESSAGE,
    ]


class Recipient:
    """`recipients` JSON ichidagi tokenlar."""

    RESPONSIBLE = "responsible"            # joriy mas'ul
    PREV_RESPONSIBLE = "prev_responsible"  # oldingi bosqich mas'uli
    CREATED_BY = "created_by"              # proyektni yaratgan
    STAGE_USERS = "stage_users"            # shu bosqichni bajara oladigan hamma texnik
    ORDER_PARTICIPANTS = "participants"    # proyektda ishlagan hamma
    ACTOR = "actor"                        # harakatni qilgan odamning o'zi
    # "role:<code>" va "user:<id>" ham qo'llab-quvvatlanadi


class NotifyTemplate(Base, TimestampMixin):
    """Hodisa uchun kimga va qanday matn bilan xabar ketishi — adminkadan sozlanadi."""

    __tablename__ = "notify_templates"
    __table_args__ = (
        UniqueConstraint("event", "stage_id", name="uq_notify_event_stage"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    event: Mapped[str] = mapped_column(String(32), index=True)
    # NULL = hamma bosqich uchun umumiy; to'ldirilgan = faqat shu bosqichda
    stage_id: Mapped[int | None] = mapped_column(
        ForeignKey("stages.id", ondelete="CASCADE"), nullable=True, index=True
    )

    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    # ["responsible", "role:hr", "user:5"]
    recipients: Mapped[list] = mapped_column(JSONB, default=list)
    # ACTOR ning o'ziga ham yuborilsinmi (odatda yo'q)
    notify_actor: Mapped[bool] = mapped_column(Boolean, default=False)
    # Telegram orqali ham yuborilsinmi (standart holatda yo'q — ixtiyoriy/opt-in)
    send_telegram: Mapped[bool] = mapped_column(Boolean, default=False)

    # {order_number}, {order_title}, {stage}, {stage_prev}, {actor}, {responsible},
    # {patient}, {doctor}, {deadline} — o'rniga qo'yiladi
    title_ru: Mapped[str] = mapped_column(String(255), default="")
    title_uz: Mapped[str] = mapped_column(String(255), default="")
    body_ru: Mapped[str] = mapped_column(Text, default="")
    body_uz: Mapped[str] = mapped_column(Text, default="")


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    event: Mapped[str] = mapped_column(String(32), index=True)
    title: Mapped[str] = mapped_column(String(255))
    body: Mapped[str | None] = mapped_column(Text, nullable=True)
    # frontendda ochiladigan joy: {"type": "order", "id": 12} yoki {"type":"chat","id":3}
    link: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    order_id: Mapped[int | None] = mapped_column(
        ForeignKey("orders.id", ondelete="CASCADE"), nullable=True, index=True
    )
    actor_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    actor: Mapped["User | None"] = relationship(  # noqa: F821
        lazy="selectin", foreign_keys=[actor_id]
    )

    is_read: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
