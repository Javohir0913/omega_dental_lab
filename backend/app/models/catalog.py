from datetime import date

from sqlalchemy import Boolean, Date, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class StageKind:
    """Kanban ustuni turi.

    NEW / SUCCESS / FAIL — tizim ustunlari: o'chirib bo'lmaydi, turi
    o'zgarmaydi (nomi va rangi esa adminkadan tahrirlanadi).
    WORK — oddiy ish bosqichi (modelshik, peresovshik, keramist...),
    adminkada qo'shiladi / o'chiriladi / tartibi o'zgartiriladi.
    """

    NEW = "new"
    WORK = "work"
    SUCCESS = "success"
    FAIL = "fail"

    SYSTEM = (NEW, SUCCESS, FAIL)


class Stage(Base, TimestampMixin):
    """Marshrutning bir bosqichi = kanban ustuni.

    Butun labda BITTA umumiy marshrut: `sort` bo'yicha tartiblangan.
    """

    __tablename__ = "stages"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(48), unique=True, index=True)
    name_ru: Mapped[str] = mapped_column(String(64))
    name_uz: Mapped[str] = mapped_column(String(64))
    kind: Mapped[str] = mapped_column(String(16), default=StageKind.WORK, index=True)
    color: Mapped[str] = mapped_column(String(16), default="#64748b")
    sort: Mapped[int] = mapped_column(Integer, default=100, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    # bu bosqichda turishi mumkin bo'lgan standart muddat (soat), dedlayn hisobi uchun
    duration_hours: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # bosqichga kirganda mas'ulni texnik o'zi olsin (claim) yoki oldingi bosqich egasi tanlasin
    allow_claim: Mapped[bool] = mapped_column(Boolean, default=True)
    # oldingi bosqich bajaruvchisi keyingi bosqich mas'ulini tanlashi shartmi
    require_next_assignee: Mapped[bool] = mapped_column(Boolean, default=False)

    @property
    def is_system(self) -> bool:
        return self.kind in StageKind.SYSTEM

    @property
    def is_final(self) -> bool:
        return self.kind in (StageKind.SUCCESS, StageKind.FAIL)


class Doctor(Base, TimestampMixin):
    __tablename__ = "doctors"

    id: Mapped[int] = mapped_column(primary_key=True)
    full_name: Mapped[str] = mapped_column(String(128), index=True)
    phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    clinic: Mapped[str | None] = mapped_column(String(128), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class Patient(Base, TimestampMixin):
    __tablename__ = "patients"

    id: Mapped[int] = mapped_column(primary_key=True)
    full_name: Mapped[str] = mapped_column(String(128), index=True)
    phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    birth_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    gender: Mapped[str | None] = mapped_column(String(8), nullable=True)  # m / f
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    # patsentning doimiy vrachi (majburiy emas)
    doctor_id: Mapped[int | None] = mapped_column(
        ForeignKey("doctors.id", ondelete="SET NULL"), nullable=True, index=True
    )
    doctor: Mapped[Doctor | None] = relationship(lazy="selectin")


class Service(Base, TimestampMixin):
    """Xizmat (usluga). Narx YO'Q — kelishuv bo'yicha."""

    __tablename__ = "services"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str | None] = mapped_column(String(32), nullable=True)
    name_ru: Mapped[str] = mapped_column(String(128), index=True)
    name_uz: Mapped[str] = mapped_column(String(128))
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    sort: Mapped[int] = mapped_column(Integer, default=100)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
