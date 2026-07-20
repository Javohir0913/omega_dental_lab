from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func, select

from app.core.deps import CurrentUser, DbDep, require
from app.models import LogCategory, Order, Stage, StageKind, User
from app.realtime.hub import hub
from app.schemas.catalog import StageCreate, StageOut, StageReorder, StageUpdate
from app.schemas.common import Msg
from app.services.logger import log_activity

router = APIRouter(prefix="/stages", tags=["stages"])


@router.get("", response_model=list[StageOut])
async def list_stages(db: DbDep, user: CurrentUser, include_inactive: bool = False):
    """Kanban ustunlari. Hamma ko'ra oladi — bularsiz interfeys qurilmaydi."""
    q = select(Stage)
    if not include_inactive:
        q = q.where(Stage.is_active.is_(True))
    res = await db.execute(q.order_by(Stage.sort, Stage.id))
    return [StageOut.model_validate(s) for s in res.scalars().all()]


@router.post("", response_model=StageOut, status_code=201)
async def create_stage(
    body: StageCreate,
    request: Request,
    db: DbDep,
    actor: Annotated[User, Depends(require("admin.stages"))],
):
    res = await db.execute(select(Stage).where(Stage.code == body.code))
    if res.scalar_one_or_none() is not None:
        raise HTTPException(409, "stage_code_taken")

    stage = Stage(**body.model_dump(), kind=StageKind.WORK)
    db.add(stage)
    await db.flush()

    await log_activity(
        db,
        action="admin.stage_created",
        category=LogCategory.ADMIN,
        actor=actor,
        entity="stage",
        entity_id=stage.id,
        message_ru=f"Создан этап «{stage.name_ru}»",
        message_uz=f"«{stage.name_uz}» bosqichi yaratildi",
        request=request,
    )
    await db.commit()
    await db.refresh(stage)
    await hub.publish("kanban", "stages.changed", {})
    return StageOut.model_validate(stage)


@router.patch("/{stage_id}", response_model=StageOut)
async def update_stage(
    stage_id: int,
    body: StageUpdate,
    request: Request,
    db: DbDep,
    actor: Annotated[User, Depends(require("admin.stages"))],
):
    res = await db.execute(select(Stage).where(Stage.id == stage_id))
    stage = res.scalar_one_or_none()
    if stage is None:
        raise HTTPException(404, "stage_not_found")

    data = body.model_dump(exclude_unset=True)

    # Tizim ustunlari (Новый / Успех / Провал) o'chirilmaydi va yashirilmaydi —
    # nomi, rangi, tartibi esa o'zgartirilishi mumkin.
    if stage.is_system and data.get("is_active") is False:
        raise HTTPException(400, "system_stage_cannot_be_disabled")

    changes = {k: {"from": getattr(stage, k), "to": v} for k, v in data.items()}
    for k, v in data.items():
        setattr(stage, k, v)

    if data.get("is_active") is False:
        res = await db.execute(
            select(func.count(Order.id)).where(
                Order.stage_id == stage_id, Order.is_closed.is_(False)
            )
        )
        if (res.scalar() or 0) > 0:
            raise HTTPException(409, "stage_has_active_orders")

    await log_activity(
        db,
        action="admin.stage_updated",
        category=LogCategory.ADMIN,
        actor=actor,
        entity="stage",
        entity_id=stage.id,
        message_ru=f"Изменён этап «{stage.name_ru}»",
        message_uz=f"«{stage.name_uz}» bosqichi o'zgartirildi",
        meta=changes,
        request=request,
    )
    await db.commit()
    await db.refresh(stage)
    await hub.publish("kanban", "stages.changed", {})
    return StageOut.model_validate(stage)


@router.post("/reorder", response_model=Msg)
async def reorder_stages(
    body: StageReorder,
    request: Request,
    db: DbDep,
    actor: Annotated[User, Depends(require("admin.stages"))],
):
    """Kanban ustunlari ketma-ketligini o'zgartirish (drag&drop)."""
    res = await db.execute(select(Stage))
    stages = {s.id: s for s in res.scalars().all()}

    for item in body.items:
        stage = stages.get(int(item.get("id", 0)))
        if stage is not None:
            stage.sort = int(item.get("sort", stage.sort))

    await log_activity(
        db,
        action="admin.stages_reordered",
        category=LogCategory.ADMIN,
        actor=actor,
        message_ru="Изменён порядок этапов",
        message_uz="Bosqichlar tartibi o'zgartirildi",
        meta={"items": body.items},
        request=request,
    )
    await db.commit()
    await hub.publish("kanban", "stages.changed", {})
    return Msg(detail="reordered")


@router.delete("/{stage_id}", response_model=Msg)
async def delete_stage(
    stage_id: int,
    request: Request,
    db: DbDep,
    actor: Annotated[User, Depends(require("admin.stages"))],
):
    res = await db.execute(select(Stage).where(Stage.id == stage_id))
    stage = res.scalar_one_or_none()
    if stage is None:
        raise HTTPException(404, "stage_not_found")
    if stage.is_system:
        raise HTTPException(400, "system_stage_cannot_be_deleted")

    res = await db.execute(select(func.count(Order.id)).where(Order.stage_id == stage_id))
    if (res.scalar() or 0) > 0:
        # tarixni buzmaslik uchun o'chirmaymiz, arxivga olamiz
        raise HTTPException(
            409, detail={"error": "stage_has_orders", "hint": "deactivate_instead"}
        )

    name = stage.name_ru
    await db.delete(stage)
    await log_activity(
        db,
        action="admin.stage_deleted",
        category=LogCategory.ADMIN,
        actor=actor,
        entity="stage",
        entity_id=stage_id,
        message_ru=f"Удалён этап «{name}»",
        message_uz=f"«{name}» bosqichi o'chirildi",
        request=request,
    )
    await db.commit()
    await hub.publish("kanban", "stages.changed", {})
    return Msg(detail="stage_deleted")
