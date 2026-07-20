from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select

from app.core.deps import CurrentUser, DbDep, require
from app.models import ActivityLog, LogCategory, LogLevel, Order, User
from app.schemas.common import Page
from app.schemas.log import LogOut, SystemLogOut

router = APIRouter(prefix="/logs", tags=["logs"])


@router.get("/order/{order_id}", response_model=Page[LogOut])
async def order_log(
    order_id: int,
    db: DbDep,
    user: Annotated[User, Depends(require("log.order"))],
    action: str | None = None,
    is_success: bool | None = None,
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
):
    """Proyekt logi: shu proyektga tegishli hamma harakat — kim nima qilgani,
    muvaffaqiyatli va muvaffaqiyatsizi bilan."""
    res = await db.execute(select(Order).where(Order.id == order_id))
    order = res.scalar_one_or_none()
    if order is None:
        raise HTTPException(404, "order_not_found")

    if not (user.is_super or user.has_perm("order.view.all")):
        visible = (
            order.responsible_id == user.id
            or order.created_by_id == user.id
            or any(s.id == order.stage_id for s in (user.stages or []))
        )
        if not visible:
            raise HTTPException(403, "forbidden")

    query = select(ActivityLog).where(ActivityLog.order_id == order_id)
    if action:
        query = query.where(ActivityLog.action == action)
    if is_success is not None:
        query = query.where(ActivityLog.is_success.is_(is_success))

    total = (await db.execute(select(func.count()).select_from(query.subquery()))).scalar() or 0
    res = await db.execute(
        query.order_by(ActivityLog.created_at.desc(), ActivityLog.id.desc())
        .offset((page - 1) * size)
        .limit(size)
    )
    return Page[LogOut](
        items=[LogOut.model_validate(r) for r in res.scalars().all()],
        total=total, page=page, size=size,
    )


@router.get("/system", response_model=Page[SystemLogOut])
async def system_log(
    db: DbDep,
    user: Annotated[User, Depends(require("log.system"))],
    q: str | None = None,
    level: str | None = None,
    category: str | None = None,
    action: str | None = None,
    actor_id: int | None = None,
    order_id: int | None = None,
    is_success: bool | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
):
    """Tizim logi — HAMMA hodisa va xatolar. Amalda faqat super adminda."""
    query = select(ActivityLog)
    if q:
        like = f"%{q}%"
        query = query.where(
            or_(
                ActivityLog.message_ru.ilike(like),
                ActivityLog.message_uz.ilike(like),
                ActivityLog.actor_name.ilike(like),
                ActivityLog.error_text.ilike(like),
                ActivityLog.path.ilike(like),
            )
        )
    if level:
        query = query.where(ActivityLog.level == level)
    if category:
        query = query.where(ActivityLog.category == category)
    if action:
        query = query.where(ActivityLog.action.ilike(f"{action}%"))
    if actor_id:
        query = query.where(ActivityLog.actor_id == actor_id)
    if order_id:
        query = query.where(ActivityLog.order_id == order_id)
    if is_success is not None:
        query = query.where(ActivityLog.is_success.is_(is_success))
    if date_from:
        query = query.where(ActivityLog.created_at >= date_from)
    if date_to:
        query = query.where(ActivityLog.created_at <= date_to)

    total = (await db.execute(select(func.count()).select_from(query.subquery()))).scalar() or 0
    res = await db.execute(
        query.order_by(ActivityLog.created_at.desc(), ActivityLog.id.desc())
        .offset((page - 1) * size)
        .limit(size)
    )
    return Page[SystemLogOut](
        items=[SystemLogOut.model_validate(r) for r in res.scalars().all()],
        total=total, page=page, size=size,
    )


@router.get("/system/stats", response_model=dict)
async def system_stats(
    db: DbDep,
    user: Annotated[User, Depends(require("log.system"))],
    date_from: datetime | None = None,
):
    """Tizim logi bosh sahifasi uchun qisqa statistika."""
    base = select(ActivityLog)
    if date_from:
        base = base.where(ActivityLog.created_at >= date_from)

    async def _count(*conds) -> int:  # noqa: ANN002
        q = base
        for c in conds:
            q = q.where(c)
        res = await db.execute(select(func.count()).select_from(q.subquery()))
        return res.scalar() or 0

    by_level = {lv: await _count(ActivityLog.level == lv) for lv in LogLevel.ALL}
    by_category = {c: await _count(ActivityLog.category == c) for c in LogCategory.ALL}

    return {
        "total": await _count(),
        "errors": by_level.get(LogLevel.ERROR, 0),
        "failed": await _count(ActivityLog.is_success.is_(False)),
        "by_level": by_level,
        "by_category": by_category,
    }


@router.get("/meta", response_model=dict)
async def log_meta(user: CurrentUser):
    """Filtrlar uchun ma'lumotnoma."""
    return {"levels": list(LogLevel.ALL), "categories": list(LogCategory.ALL)}
