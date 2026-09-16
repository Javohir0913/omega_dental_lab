"""Telegram Bot API bilan ishlash: xabar yuborish, yangiliklarni olish, kunlik/haftalik digest matni."""

import logging
from datetime import timedelta, timezone

import httpx
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import now_utc
from app.models import Order, TelegramContact, User
from app.services import workcalendar
from app.services.settings_store import get_setting

log = logging.getLogger("omega.telegram")

API_BASE = "https://api.telegram.org/bot{token}/{method}"

# Har chaqiriqda yangi httpx.AsyncClient ochish (avval shunday edi) har safar
# yangi TCP/TLS ulanish qilishga majburlaydi — digest yuborilganda (ko'p
# kontaktga ketma-ket xabar) yoki poller tez-tez ishlaganda bu ortiqcha
# kechikish/resurs. Bitta umumiy client (connection pool bilan) qayta
# ishlatiladi; jarayon to'xtaganda `aclose_client()` orqali yopiladi (main.py).
_client: httpx.AsyncClient | None = None


def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(timeout=10)
    return _client


async def aclose_client() -> None:
    global _client
    if _client is not None and not _client.is_closed:
        await _client.aclose()
    _client = None


async def send_message(token: str, chat_id: int, text: str) -> bool:
    if not token:
        return False
    try:
        res = await _get_client().post(
            API_BASE.format(token=token, method="sendMessage"),
            json={"chat_id": chat_id, "text": text},
        )
        return res.status_code == 200
    except Exception:
        log.exception("Telegram sendMessage xatosi (chat_id=%s)", chat_id)
        return False


async def get_me(token: str) -> dict | None:
    if not token:
        return None
    try:
        res = await _get_client().get(API_BASE.format(token=token, method="getMe"))
        data = res.json()
        return data.get("result") if data.get("ok") else None
    except Exception:
        log.exception("Telegram getMe xatosi")
        return None


async def get_updates(token: str, offset: int | None) -> list[dict]:
    params = {"timeout": 25}
    if offset is not None:
        params["offset"] = offset
    res = await _get_client().get(
        API_BASE.format(token=token, method="getUpdates"), params=params, timeout=35
    )
    data = res.json()
    return data.get("result", []) if data.get("ok") else []


async def _quiet_today(db: AsyncSession) -> bool:
    """Ish-kalendari yoqilgan va bugun dam kuni/bayram bo'lsa — True (Telegramga push yuborilmasin)."""
    cal = await workcalendar.load_calendar(db)
    if not cal.enabled:
        return False
    today_local = now_utc().astimezone(workcalendar.APP_TZ).date()
    return not workcalendar.is_workday(today_local, cal)


async def notify_user_telegram(db: AsyncSession, user_id: int, text: str) -> None:
    enabled = bool(await get_setting(db, "telegram_enabled", False))
    if not enabled:
        return
    token = await get_setting(db, "telegram_bot_token", "")
    if not token:
        return
    if await _quiet_today(db):
        return

    res = await db.execute(select(TelegramContact).where(TelegramContact.user_id == user_id))
    contact = res.scalar_one_or_none()
    if contact is None:
        return
    await send_message(token, contact.chat_id, text)


DIGEST_HEADER = {
    ("day", "ru"): "📋 Ваши задачи на сегодня:",
    ("day", "uz"): "📋 Bugungi vazifalaringiz:",
    ("week", "ru"): "📋 Ваши задачи на этой неделе:",
    ("week", "uz"): "📋 Shu haftadagi vazifalaringiz:",
}
DIGEST_EMPTY = {
    "ru": "На ближайшее время просроченных задач нет 👍",
    "uz": "Yaqin vaqtda bajarilishi kerak vazifalar yo'q 👍",
}


async def build_digest_text(db: AsyncSession, user: User, lang: str, period: str) -> str | None:
    now = now_utc()
    local_now = now.astimezone(workcalendar.APP_TZ)
    if period == "day":
        end_local = local_now.replace(hour=23, minute=59, second=59, microsecond=999999)
    else:
        end_local = local_now + timedelta(days=7)
    end_utc = end_local.astimezone(timezone.utc)

    res = await db.execute(
        select(Order)
        .where(
            Order.responsible_id == user.id,
            Order.is_closed.is_(False),
            Order.deleted_at.is_(None),
            or_(
                and_(Order.stage_deadline.is_not(None), Order.stage_deadline <= end_utc),
                and_(Order.deadline.is_not(None), Order.deadline <= end_utc),
            ),
        )
        .order_by(Order.stage_deadline.asc())
    )
    orders = list(res.scalars().all())

    ru = lang != "uz"
    header = DIGEST_HEADER[(period, "ru" if ru else "uz")]
    if not orders:
        return f"{header}\n\n{DIGEST_EMPTY['ru' if ru else 'uz']}"

    lines = [header, ""]
    for o in orders:
        stage_name = (o.stage.name_ru if ru else o.stage.name_uz) if o.stage else "—"
        dl = o.stage_deadline or o.deadline
        dl_str = dl.astimezone(workcalendar.APP_TZ).strftime("%d.%m %H:%M") if dl else "—"
        lines.append(f"• {o.number} «{o.title}» — {stage_name} ({dl_str})")

    return "\n".join(lines)
