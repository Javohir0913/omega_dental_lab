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

# Ketma-ket necha dam kunidan keyin kalendarni «buzuq» deb hisoblab, oddiy
# soat bilan sanashga o'tamiz.
MAX_IDLE_DAYS = 366


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
    raw_days = await get_setting(db, "work_days", [0, 1, 2, 3, 4, 5])
    work_days = {int(d) for d in (raw_days or []) if isinstance(d, int) and 0 <= d <= 6}
    start = parse_hm(await get_setting(db, "work_hour_start", "09:00"), time(9, 0))
    end = parse_hm(await get_setting(db, "work_hour_end", "18:00"), time(18, 0))

    # Kalendar noto'g'ri sozlangan bo'lsa (birorta ish kuni yo'q yoki ish kuni
    # tugashi boshlanishidan oldin) — hisoblash cheksiz siklga tushib qolardi.
    # Bunday holatda kalendar o'chirilgan deb qaraladi: dedlayn oddiy soat bilan sanaladi.
    if not work_days or end <= start:
        enabled = False

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


def is_working_moment(dt: datetime, cal: WorkCalendar) -> bool:
    """Shu payt ish vaqtimi (ish kuni + ish soati oralig'i)."""
    local = dt.astimezone(APP_TZ)
    return is_workday(local.date(), cal) and cal.start <= local.time() < cal.end


def nonworking_reason(dt: datetime, cal: WorkCalendar) -> str | None:
    """Nega hozir vaqt to'xtagan: `holiday` / `weekend` / `off_hours`; ish vaqti bo'lsa None."""
    local = dt.astimezone(APP_TZ)
    d = local.date()
    if (d.month, d.day) in cal.recurring_holidays or d in cal.exact_holidays:
        return "holiday"
    if d.weekday() not in cal.work_days:
        return "weekend"
    if not (cal.start <= local.time() < cal.end):
        return "off_hours"
    return None


def next_work_start(after: datetime, cal: WorkCalendar) -> datetime | None:
    """Vaqt qachondan yana «keta boshlaydi» (UTC). Hozir ish vaqti bo'lsa — `after`ning o'zi."""
    cur = after.astimezone(APP_TZ)
    for _ in range(MAX_IDLE_DAYS):
        if is_workday(cur.date(), cal):
            day_start = datetime.combine(cur.date(), cal.start, tzinfo=APP_TZ)
            if cur < day_start:
                return day_start.astimezone(timezone.utc)
            if cur < datetime.combine(cur.date(), cal.end, tzinfo=APP_TZ):
                return cur.astimezone(timezone.utc)
        cur = datetime.combine(cur.date() + timedelta(days=1), time(0, 0), tzinfo=APP_TZ)
    return None


def add_business_hours(start: datetime, hours: float, cal: WorkCalendar) -> datetime:
    """`start`dan ish kuni/soatini hisobga olib `hours` soat qo'shadi (UTC qaytaradi)."""
    if hours <= 0:
        return start

    cur = start.astimezone(APP_TZ)
    remaining = timedelta(hours=hours)
    # Ketma-ket dam kunlarini cheksiz kezib ketmaslik uchun himoya (bayramlar
    # butun yilni qoplab qolgan bo'lsa ham sikl to'xtaydi).
    idle_days = 0

    while True:
        if not is_workday(cur.date(), cal):
            cur = _next_day_at(cur, cal.start)
            idle_days += 1
            if idle_days > MAX_IDLE_DAYS:
                return (start + timedelta(hours=hours)).astimezone(timezone.utc)
            continue

        idle_days = 0
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


def business_seconds_between(start: datetime, end: datetime, cal: WorkCalendar) -> int:
    """`start` va `end` orasidagi ISH sekundlari (dam kuni/bayram va tungi vaqt sanalmaydi).

    `end` `start`dan oldin bo'lsa — manfiy qiymat (ya'ni dedlayn qancha ish vaqtiga
    o'tkazib yuborilgani).
    """
    if end == start:
        return 0
    if end < start:
        return -business_seconds_between(end, start, cal)

    cur = start.astimezone(APP_TZ)
    fin = end.astimezone(APP_TZ)
    total = 0.0

    while cur < fin:
        if not is_workday(cur.date(), cal):
            cur = _next_day_at(cur, cal.start)
            continue

        day_start = datetime.combine(cur.date(), cal.start, tzinfo=APP_TZ)
        day_end = datetime.combine(cur.date(), cal.end, tzinfo=APP_TZ)

        if cur < day_start:
            cur = day_start
            continue
        if cur >= day_end:
            cur = _next_day_at(cur, cal.start)
            continue

        total += (min(fin, day_end) - cur).total_seconds()
        cur = _next_day_at(cur, cal.start)

    return int(total)


def shift_deadline(start: datetime, seconds: float, cal: WorkCalendar) -> datetime:
    """`start`ga `seconds` qo'shadi: kalendar yoqilgan bo'lsa — faqat ish vaqti hisobiga."""
    if seconds <= 0:
        return start
    if cal.enabled:
        return add_business_hours(start, seconds / 3600, cal)
    return start + timedelta(seconds=seconds)
