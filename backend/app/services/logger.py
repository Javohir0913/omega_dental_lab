import traceback

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import now_utc
from app.models import ActivityLog, LogCategory, LogLevel, User


async def log_activity(
    db: AsyncSession,
    *,
    action: str,
    category: str = LogCategory.SYSTEM,
    level: str = LogLevel.INFO,
    is_success: bool = True,
    actor: User | None = None,
    actor_name: str | None = None,
    order_id: int | None = None,
    entity: str | None = None,
    entity_id: int | None = None,
    message_ru: str = "",
    message_uz: str = "",
    meta: dict | None = None,
    request: Request | None = None,
    error: BaseException | None = None,
    commit: bool = False,
) -> ActivityLog:
    """Bitta log yozuvi.

    order_id berilsa — proyekt logida ham ko'rinadi. Tizim logida (super admin)
    esa hamma yozuv ko'rinadi.
    """
    row = ActivityLog(
        created_at=now_utc(),
        action=action,
        category=category,
        level=level,
        is_success=is_success,
        actor_id=actor.id if actor else None,
        actor_name=actor_name or (actor.full_name if actor else None),
        order_id=order_id,
        entity=entity,
        entity_id=entity_id,
        message_ru=message_ru,
        message_uz=message_uz,
        meta=meta,
    )
    if request is not None:
        row.ip = client_ip(request)
        row.user_agent = request.headers.get("user-agent")
        row.path = str(request.url.path)
        row.method = request.method
    if error is not None:
        row.level = LogLevel.ERROR
        row.is_success = False
        row.error_text = "".join(
            traceback.format_exception(type(error), error, error.__traceback__)
        )[:8000]

    db.add(row)
    if commit:
        await db.commit()
    else:
        await db.flush()
    return row


def client_ip(request: Request) -> str | None:
    """Nginx orqasida ham to'g'ri IP."""
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    real = request.headers.get("x-real-ip")
    if real:
        return real.strip()
    return request.client.host if request.client else None
