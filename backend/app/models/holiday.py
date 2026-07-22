from sqlalchemy import Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class Holiday(Base, TimestampMixin):
    """Dam olish kuni (bayram). `year` bo'sh bo'lsa — har yili shu kun.oyda takrorlanadi."""

    __tablename__ = "holidays"
    __table_args__ = (UniqueConstraint("month", "day", "year", name="uq_holiday_date"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    month: Mapped[int] = mapped_column(Integer)
    day: Mapped[int] = mapped_column(Integer)
    year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    name_ru: Mapped[str] = mapped_column(String(128))
    name_uz: Mapped[str] = mapped_column(String(128))
