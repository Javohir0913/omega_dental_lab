from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Table,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin
from app.models.catalog import Doctor, Patient, Stage

order_services = Table(
    "order_services",
    Base.metadata,
    Column("order_id", ForeignKey("orders.id", ondelete="CASCADE"), primary_key=True),
    Column("service_id", ForeignKey("services.id", ondelete="CASCADE"), primary_key=True),
)


class Order(Base, TimestampMixin):
    """Proyekt (zakaz) — kanbandagi karta."""

    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(primary_key=True)
    number: Mapped[str] = mapped_column(String(24), unique=True, index=True)  # "OM-000123"
    title: Mapped[str] = mapped_column(String(160))

    patient_id: Mapped[int | None] = mapped_column(
        ForeignKey("patients.id", ondelete="SET NULL"), nullable=True, index=True
    )
    doctor_id: Mapped[int | None] = mapped_column(
        ForeignKey("doctors.id", ondelete="SET NULL"), nullable=True, index=True
    )
    patient: Mapped[Patient | None] = relationship(lazy="selectin")
    doctor: Mapped[Doctor | None] = relationship(lazy="selectin")

    stage_id: Mapped[int] = mapped_column(ForeignKey("stages.id"), index=True)
    stage: Mapped[Stage] = relationship(lazy="selectin")

    # joriy bosqichning mas'uli (bo'sh = hech kim olmagan)
    responsible_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    responsible: Mapped["User | None"] = relationship(  # noqa: F821
        lazy="selectin", foreign_keys=[responsible_id]
    )

    created_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_by: Mapped["User | None"] = relationship(  # noqa: F821
        lazy="selectin", foreign_keys=[created_by_id]
    )

    deadline: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    stage_deadline: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    stage_entered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # `deadline` (umumiy proyekt dedlayni) o'tganda oxirgi marta qachon ogohlantirilgani
    deadline_overdue_notified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    priority: Mapped[int] = mapped_column(Integer, default=500, index=True)  # kam = tepada
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    color: Mapped[str | None] = mapped_column(String(16), nullable=True)

    is_closed: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # yopilish sababi (Провал bo'lganda)
    close_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    # yumshoq o'chirish — 30 kun korzinkada turadi
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)

    # kanban ustuni ichidagi qo'lda tartib (drag&drop)
    sort: Mapped[int] = mapped_column(Integer, default=0)

    # proyekt rasmi — bitta dona, forma title bilan patient orasida ko'rsatiladi
    photo_file_id: Mapped[int | None] = mapped_column(
        ForeignKey("files.id", ondelete="SET NULL"), nullable=True
    )
    photo: Mapped["FileAsset | None"] = relationship(  # noqa: F821
        lazy="selectin", foreign_keys=[photo_file_id]
    )

    services: Mapped[list["Service"]] = relationship(secondary=order_services, lazy="selectin")  # noqa: F821

    # tanlangan tishlar — doim FDI kodlari (11..48) saqlanadi, displey yorlig'i sozlamadan olinadi
    teeth: Mapped[list[int] | None] = mapped_column(JSONB, nullable=True)


class OrderStageHistory(Base):
    """Marshrut tarixi: qaysi bosqichda, kim, qancha turgani."""

    __tablename__ = "order_stage_history"

    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), index=True)
    stage_id: Mapped[int] = mapped_column(ForeignKey("stages.id", ondelete="CASCADE"), index=True)
    stage: Mapped[Stage] = relationship(lazy="selectin")

    responsible_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    responsible: Mapped["User | None"] = relationship(  # noqa: F821
        lazy="selectin", foreign_keys=[responsible_id]
    )
    moved_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    moved_by: Mapped["User | None"] = relationship(  # noqa: F821
        lazy="selectin", foreign_keys=[moved_by_id]
    )

    entered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    left_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_sec: Mapped[int | None] = mapped_column(Integer, nullable=True)
    was_overdue: Mapped[bool] = mapped_column(Boolean, default=False)
    overdue_notified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
