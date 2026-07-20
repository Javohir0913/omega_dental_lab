from sqlalchemy import String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class Setting(Base, TimestampMixin):
    """Adminkadan sozlanadigan global kalit-qiymat."""

    __tablename__ = "settings"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)


DEFAULT_SETTINGS: dict[str, tuple[dict, str]] = {
    "order_number_prefix": ({"v": "OM-"}, "Префикс номера проекта"),
    "order_number_padding": ({"v": 6}, "Кол-во цифр в номере проекта"),
    "company_name": ({"v": "OMEGA DENTAL LAB"}, "Название компании"),
    "default_lang": ({"v": "ru"}, "Язык по умолчанию"),
    "kick_oldest_session": (
        {"v": True},
        "При превышении лимита сессий завершать самую старую (иначе — запрет входа)",
    ),
    "claim_enabled": ({"v": True}, "Техник может брать проект себе"),
}
