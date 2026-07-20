from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class ChatType:
    ORDER = "order"      # proyekt chati (a'zolar = proyekt ishtirokchilari)
    DIRECT = "direct"    # ikki user o'rtasida
    GROUP = "group"      # ixtiyoriy guruh

    ALL = (ORDER, DIRECT, GROUP)


class Chat(Base, TimestampMixin):
    __tablename__ = "chats"

    id: Mapped[int] = mapped_column(primary_key=True)
    type: Mapped[str] = mapped_column(String(8), index=True)
    title: Mapped[str | None] = mapped_column(String(128), nullable=True)
    order_id: Mapped[int | None] = mapped_column(
        ForeignKey("orders.id", ondelete="CASCADE"), nullable=True, index=True, unique=True
    )
    # DIRECT uchun barqaror kalit: "12:45" (kichik id : katta id)
    direct_key: Mapped[str | None] = mapped_column(String(32), nullable=True, unique=True, index=True)
    last_message_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    members: Mapped[list["ChatMember"]] = relationship(
        back_populates="chat", cascade="all, delete-orphan", lazy="selectin"
    )


class ChatMember(Base):
    __tablename__ = "chat_members"
    __table_args__ = (UniqueConstraint("chat_id", "user_id", name="uq_chat_member"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    chat_id: Mapped[int] = mapped_column(ForeignKey("chats.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    last_read_message_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    muted: Mapped[bool] = mapped_column(Boolean, default=False)

    chat: Mapped[Chat] = relationship(back_populates="members")
    user: Mapped["User"] = relationship(lazy="selectin")  # noqa: F821


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    chat_id: Mapped[int] = mapped_column(ForeignKey("chats.id", ondelete="CASCADE"), index=True)
    author_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    author: Mapped["User | None"] = relationship(lazy="selectin")  # noqa: F821

    text: Mapped[str | None] = mapped_column(Text, nullable=True)
    # tizim xabari (masalan "Проект переведён на этап Керамист") — kulrang qatorcha
    is_system: Mapped[bool] = mapped_column(Boolean, default=False)
    reply_to_id: Mapped[int | None] = mapped_column(
        ForeignKey("messages.id", ondelete="SET NULL"), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    edited_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    attachments: Mapped[list["FileAsset"]] = relationship(  # noqa: F821
        lazy="selectin",
        primaryjoin="and_(FileAsset.entity=='message', foreign(FileAsset.entity_id)==Message.id)",
        viewonly=True,
    )
