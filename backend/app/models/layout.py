from sqlalchemy import Boolean, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class OrderFieldSection(Base, TimestampMixin):
    """Loyiha kartochkasida maydonlarni guruhlash uchun bo'lim (masalan: Info, Skanlar)."""

    __tablename__ = "order_field_sections"
    __table_args__ = (UniqueConstraint("entity", "code", name="uq_order_field_sections_entity_code"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    entity: Mapped[str] = mapped_column(String(16), default="order", index=True)
    code: Mapped[str] = mapped_column(String(48))
    name_ru: Mapped[str] = mapped_column(String(64))
    name_uz: Mapped[str] = mapped_column(String(64))
    sort: Mapped[int] = mapped_column(Integer, default=100, index=True)


class OrderFieldLayout(Base, TimestampMixin):
    """Har bir maydonning (tizim yoki custom) qaysi bo'limga va qanday tartibda joylashgani.

    `field_ref` — `StageRequirement.field_ref` bilan bir xil konvensiya:
    "sys:<name>" yoki "cf:<custom_field_id>".
    """

    __tablename__ = "order_field_layout"
    __table_args__ = (UniqueConstraint("entity", "field_ref", name="uq_order_field_layout_entity_ref"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    entity: Mapped[str] = mapped_column(String(16), default="order", index=True)
    section_id: Mapped[int] = mapped_column(
        ForeignKey("order_field_sections.id", ondelete="CASCADE"), index=True
    )
    field_ref: Mapped[str] = mapped_column(String(64))
    sort: Mapped[int] = mapped_column(Integer, default=100)
    # loyiha yaratish formasi va Info tabida umuman ko'rsatilmasin
    is_hidden: Mapped[bool] = mapped_column(Boolean, default=False)
