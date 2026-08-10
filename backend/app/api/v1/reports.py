from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import func, select

from app.core.deps import DbDep, require
from app.models import OrderStageHistory, Stage, User
from app.schemas.reports import StageWorkRow

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/stage-work", response_model=list[StageWorkRow])
async def stage_work_report(
    db: DbDep,
    _: Annotated[User, Depends(require("report.view"))],
    date_from: datetime | None = None,
    date_to: datetime | None = None,
):
    """Xodim × bosqich bo'yicha jamlangan ish vaqti — faqat yakunlangan
    (left_at bor) bosqich vizitlari hisoblanadi."""
    q = (
        select(
            User.id,
            User.full_name,
            Stage.id,
            Stage.name_ru,
            Stage.name_uz,
            func.count(OrderStageHistory.id),
            func.coalesce(func.sum(OrderStageHistory.duration_sec), 0),
        )
        .select_from(OrderStageHistory)
        .join(User, User.id == OrderStageHistory.responsible_id)
        .join(Stage, Stage.id == OrderStageHistory.stage_id)
        .where(OrderStageHistory.left_at.is_not(None))
    )
    if date_from:
        q = q.where(OrderStageHistory.entered_at >= date_from)
    if date_to:
        q = q.where(OrderStageHistory.entered_at <= date_to)
    q = q.group_by(User.id, User.full_name, Stage.id, Stage.name_ru, Stage.name_uz)
    q = q.order_by(User.full_name, Stage.sort)

    res = await db.execute(q)
    rows = []
    for user_id, user_name, stage_id, name_ru, name_uz, count, total_seconds in res.all():
        rows.append(
            StageWorkRow(
                user_id=user_id,
                user_name=user_name,
                stage_id=stage_id,
                stage_name_ru=name_ru,
                stage_name_uz=name_uz,
                count=count,
                total_seconds=total_seconds,
                avg_seconds=int(total_seconds / count) if count else 0,
            )
        )
    return rows
