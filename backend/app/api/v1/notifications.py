from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import func, select, update

from app.core.deps import CurrentUser, DbDep
from app.core.security import now_utc
from app.models import Notification
from app.schemas.admin import NotificationOut
from app.schemas.common import Msg, Page

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=Page[NotificationOut])
async def my_notifications(
    db: DbDep,
    user: CurrentUser,
    only_unread: bool = False,
    page: int = Query(1, ge=1),
    size: int = Query(30, ge=1, le=100),
):
    query = select(Notification).where(Notification.user_id == user.id)
    if only_unread:
        query = query.where(Notification.is_read.is_(False))

    total = (await db.execute(select(func.count()).select_from(query.subquery()))).scalar() or 0
    res = await db.execute(
        query.order_by(Notification.created_at.desc()).offset((page - 1) * size).limit(size)
    )
    return Page[NotificationOut](
        items=[NotificationOut.model_validate(n) for n in res.scalars().all()],
        total=total, page=page, size=size,
    )


@router.get("/unread-count", response_model=dict)
async def unread_count(db: DbDep, user: CurrentUser):
    res = await db.execute(
        select(func.count(Notification.id)).where(
            Notification.user_id == user.id, Notification.is_read.is_(False)
        )
    )
    return {"count": res.scalar() or 0}


@router.post("/{notification_id}/read", response_model=Msg)
async def mark_read(notification_id: int, db: DbDep, user: CurrentUser):
    res = await db.execute(
        select(Notification).where(
            Notification.id == notification_id, Notification.user_id == user.id
        )
    )
    n = res.scalar_one_or_none()
    if n is None:
        raise HTTPException(404, "notification_not_found")
    if not n.is_read:
        n.is_read = True
        n.read_at = now_utc()
        await db.commit()
    return Msg(detail="ok")


@router.post("/read-all", response_model=Msg)
async def mark_all_read(db: DbDep, user: CurrentUser):
    await db.execute(
        update(Notification)
        .where(Notification.user_id == user.id, Notification.is_read.is_(False))
        .values(is_read=True, read_at=now_utc())
    )
    await db.commit()
    return Msg(detail="ok")
