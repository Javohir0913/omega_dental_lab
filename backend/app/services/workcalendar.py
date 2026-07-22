"""Ish kalendari: ish kunlari/soati va bayramlarni hisobga olib dedlayn hisoblash.

Barcha vaqtlar bazada UTC saqlanadi, lekin ish kuni/soati kompaniya joylashgan
mahalliy vaqt (Toshkent, UTC+5) bo'yicha tushuniladi — shuning uchun hisoblashda
mahalliy vaqtga o'tkazib olinadi, so'ng natija yana UTC'ga qaytariladi.
"""

from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Holiday
from app.services.settings_store import get_setting

APP_TZ = ZoneInfo("Asia/Tashkent")


@dataclass
class WorkCalendar:
    enabled: bool
    work_days: set[int]  # 0=Dush ... 6=Yaksh
    start: time
    end: time
    recurring_holidays: set[tuple[int, int]] = field(default_factory=set)  # (month, day)
    exact_holidays: set[date] = field(default_factory=set)


def parse_hm(s: str, fallback: time) -> time:
    try:
        h, m = s.split(":")
        return time(int(h), int(m))
    except (ValueError, AttributeError):
        return fallback


async def load_calendar(db: AsyncSession) -> WorkCalendar:
    enabled = bool(await get_setting(db, "deadline_calendar_enabled", False))
    work_days = set(await get_setting(db, "work_days", [0, 1, 2, 3, 4, 5]))
    start = parse_hm(await get_setting(db, "work_hour_start", "09:00"), time(9, 0))
    end = parse_hm(await get_setting(db, "work_hour_end", "18:00"), time(18, 0))

    res = await db.execute(select(Holiday))
    recurring: set[tuple[int, int]] = set()
    exact: set[date] = set()
    for h in res.scalars().all():
        if h.year is None:
            recurring.add((h.month, h.day))
        else:
            exact.add(date(h.year, h.month, h.day))

    return WorkCalendar(
        enabled=enabled, work_days=work_days, start=start, end=end,
        recurring_holidays=recurring, exact_holidays=exact,
    )


def is_workday(d: date, cal: WorkCalendar) -> bool:
    if d.weekday() not in cal.work_days:
        return False
    if (d.month, d.day) in cal.recurring_holidays:
        return False
    if d in cal.exact_holidays:
        return False
    return True


def _next_day_at(cur: datetime, t: time) -> datetime:
    return datetime.combine(cur.date() + timedelta(days=1), t, tzinfo=cur.tzinfo)


def add_business_hours(start: datetime, hours: float, cal: WorkCalendar) -> datetime:
    """`start`dan ish kuni/soatini hisobga olib `hours` soat qo'shadi (UTC qaytaradi)."""
    if hours <= 0:
        return start

    cur = start.astimezone(APP_TZ)
    remaining = timedelta(hours=hours)

    while True:
        if not is_workday(cur.date(), cal):
            cur = _next_day_at(cur, cal.start)
            continue

        day_start = datetime.combine(cur.date(), cal.start, tzinfo=APP_TZ)
        day_end = datetime.combine(cur.date(), cal.end, tzinfo=APP_TZ)

        if cur < day_start:
            cur = day_start
        if cur >= day_end:
            cur = _next_day_at(cur, cal.start)
            continue

        available = day_end - cur
        if remaining <= available:
            cur = cur + remaining
            return cur.astimezone(timezone.utc)

        remaining -= available
        cur = _next_day_at(cur, cal.start)
