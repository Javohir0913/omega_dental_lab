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
    "frontend_url": (
        {"v": ""},
        "Адрес сайта (для ссылки на проект в Telegram-уведомлениях), например https://lab.example.uz",
    ),
    "default_lang": ({"v": "ru"}, "Язык по умолчанию"),
    "kick_oldest_session": (
        {"v": True},
        "При превышении лимита сессий завершать самую старую (иначе — запрет входа)",
    ),
    "claim_enabled": ({"v": True}, "Техник может брать проект себе"),
    "deadline_calendar_enabled": (
        {"v": False},
        "Дедлайны этапов считать по рабочему календарю (рабочие дни/часы, праздники)",
    ),
    "work_days": (
        {"v": [0, 1, 2, 3, 4, 5]},
        "Рабочие дни недели (0=Пн ... 6=Вс)",
    ),
    "work_hour_start": ({"v": "09:00"}, "Начало рабочего дня"),
    "work_hour_end": ({"v": "18:00"}, "Конец рабочего дня"),
    "overdue_reminder_hours": (
        {"v": 24},
        "Через сколько часов повторно напоминать о просроченном этапе",
    ),
    "order_deadline_reminder_hours": (
        {"v": 24},
        "Через сколько часов повторно напоминать о просроченном общем дедлайне проекта",
    ),
    "telegram_bot_token": ({"v": ""}, "Токен Telegram-бота (от @BotFather)"),
    "telegram_enabled": ({"v": False}, "Telegram-интеграция включена"),
    "telegram_digest_enabled": ({"v": False}, "Отправлять дайджест задач в Telegram"),
    "telegram_digest_daily": ({"v": True}, "Ежедневный дайджест включён"),
    "telegram_digest_daily_time": ({"v": "08:00"}, "Время ежедневного дайджеста"),
    "telegram_digest_weekly": ({"v": False}, "Еженедельный дайджест включён"),
    "telegram_digest_weekly_day": ({"v": 0}, "День недели для еженедельного дайджеста (0=Пн)"),
    "telegram_digest_weekly_time": ({"v": "08:00"}, "Время еженедельного дайджеста"),
    "tooth_labels": (
        {"v": {str(q * 10 + n): str(q * 10 + n) for q in (1, 2, 3, 4) for n in range(1, 9)}},
        "Отображаемые номера зубов (ключ — код FDI, значение — что показывать)",
    ),
    "tooth_chart_scale": ({"v": 100}, "Размер клеток на схеме зубов, % (общий для всех)"),
    "control_color": ({"v": "#22c55e"}, "Цвет проекта в состоянии контроля"),
}
