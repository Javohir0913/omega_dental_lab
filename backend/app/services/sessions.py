"""Sessiya nazorati.

Har bir userda O'ZINING limiti bor (`users.session_limit`, 0 = cheksiz).
Limitdan oshganda global `kick_oldest_session` sozlamasiga qarab:
  True  -> eng eski aktiv sessiya uziladi (default)
  False -> yangi kirish rad etiladi
"""

from datetime import timedelta

from fastapi import Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from user_agents import parse as ua_parse

from app.core.config import settings
from app.core.security import now_utc
from app.models import User, UserSession
from app.realtime.hub import hub
from app.services.logger import client_ip
from app.services.settings_store import get_setting


class SessionLimitReached(Exception):
    def __init__(self, limit: int, active: int) -> None:
        self.limit = limit
        self.active = active
        super().__init__(f"session limit {active}/{limit}")


def describe_client(request: Request) -> dict:
    """IP, qurilma, brauzer, OS — sessiya ro'yxatida ko'rsatish uchun."""
    raw = request.headers.get("user-agent") or ""
    ua = ua_parse(raw)

    if ua.is_mobile:
        device = "Mobile"
    elif ua.is_tablet:
        device = "Tablet"
    elif ua.is_pc:
        device = "PC"
    elif ua.is_bot:
        device = "Bot"
    else:
        device = "Unknown"

    brand = " ".join(x for x in (ua.device.brand, ua.device.model) if x).strip()
    browser = " ".join(x for x in (ua.browser.family, ua.browser.version_string) if x).strip()
    os_name = " ".join(x for x in (ua.os.family, ua.os.version_string) if x).strip()

    return {
        "ip": client_ip(request),
        "user_agent": raw[:1000] or None,
        "device": device,
        "device_name": brand or None,
        "browser": browser or None,
        "os": os_name or None,
    }


async def active_sessions(db: AsyncSession, user_id: int) -> list[UserSession]:
    now = now_utc()
    res = await db.execute(
        select(UserSession)
        .where(
            UserSession.user_id == user_id,
            UserSession.revoked_at.is_(None),
            UserSession.expires_at > now,
        )
        .order_by(UserSession.created_at.asc())
    )
    return list(res.scalars().all())


async def revoke_session(
    db: AsyncSession, session: UserSession, reason: str, notify: bool = True
) -> None:
    if session.revoked_at is not None:
        return
    session.revoked_at = now_utc()
    session.revoked_reason = reason
    await db.flush()
    if notify:
        await hub.kick_user(session.user_id, reason)


async def enforce_limit(db: AsyncSession, user: User) -> list[UserSession]:
    """Yangi sessiya ochishdan OLDIN chaqiriladi.

    Uzilgan sessiyalar ro'yxatini qaytaradi (log uchun).
    Limit qat'iy rejimda bo'lsa SessionLimitReached ko'taradi.
    """
    limit = user.session_limit or 0
    if limit <= 0:
        return []

    current = await active_sessions(db, user.id)
    # yangisi qo'shilgach limitdan oshmasligi kerak => limit-1 tagacha qisqartiramiz
    excess = len(current) - (limit - 1)
    if excess <= 0:
        return []

    kick_oldest = bool(await get_setting(db, "kick_oldest_session", True))
    if not kick_oldest:
        raise SessionLimitReached(limit, len(current))

    revoked = current[:excess]  # eng eskilari
    for s in revoked:
        await revoke_session(db, s, "limit_exceeded")
    return revoked


async def create_session(
    db: AsyncSession, user: User, jti: str, request: Request
) -> UserSession:
    info = describe_client(request)
    now = now_utc()
    session = UserSession(
        user_id=user.id,
        jti=jti,
        created_at=now,
        last_seen_at=now,
        expires_at=now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
        **info,
    )
    db.add(session)
    await db.flush()
    return session


async def touch_session(db: AsyncSession, jti: str) -> UserSession | None:
    res = await db.execute(select(UserSession).where(UserSession.jti == jti))
    session = res.scalar_one_or_none()
    if session is None or session.revoked_at is not None:
        return None
    if session.expires_at <= now_utc():
        return None
    session.last_seen_at = now_utc()
    return session
