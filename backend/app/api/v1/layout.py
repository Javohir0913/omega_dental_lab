from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func, select

from app.core.deps import CurrentUser, DbDep, require_super
from app.models import SYSTEM_ORDER_FIELDS, CustomField, FieldEntity, LogCategory, OrderFieldLayout, OrderFieldSection, User
from app.realtime.hub import hub
from app.schemas.admin import CustomFieldOut
from app.schemas.common import Msg
from app.schemas.layout import (
    LayoutFieldOut,
    LayoutSaveBody,
    LayoutSectionOut,
    OrderFieldSectionCreate,
    OrderFieldSectionOut,
    OrderFieldSectionUpdate,
    SectionReorder,
)
from app.services.logger import log_activity

router = APIRouter(prefix="/order-layout", tags=["order-layout"])

ENTITY = "order"


def _system_labels() -> dict[str, tuple[str, str]]:
    # sys:files — Fayllar tabiga tegishli, Info tab layoutiga joylashtirilmaydi
    return {ref: (ru, uz) for ref, ru, uz in SYSTEM_ORDER_FIELDS if ref != "sys:files"}


@router.get("", response_model=list[LayoutSectionOut])
async def get_layout(db: DbDep, _: CurrentUser):
    """Loyiha kartochkasi uchun to'liq yechilgan bo'lim+maydon tartibi. Hamma ko'ra oladi."""
    res = await db.execute(
        select(OrderFieldSection)
        .where(OrderFieldSection.entity == ENTITY)
        .order_by(OrderFieldSection.sort, OrderFieldSection.id)
    )
    sections = list(res.scalars().all())

    res = await db.execute(
        select(OrderFieldLayout)
        .where(OrderFieldLayout.entity == ENTITY)
        .order_by(OrderFieldLayout.sort, OrderFieldLayout.id)
    )
    layout_rows = list(res.scalars().all())

    res = await db.execute(
        select(CustomField)
        .where(CustomField.entity == FieldEntity.ORDER, CustomField.is_active.is_(True))
        .order_by(CustomField.sort, CustomField.id)
    )
    custom_fields = {f.id: f for f in res.scalars().all()}
    system_labels = _system_labels()

    def resolve(ref: str) -> LayoutFieldOut | None:
        if ref.startswith("cf:"):
            try:
                fid = int(ref[3:])
            except ValueError:
                return None
            f = custom_fields.get(fid)
            if f is None:
                return None
            return LayoutFieldOut(
                field_ref=ref, kind="custom", label_ru=f.label_ru, label_uz=f.label_uz,
                custom_field=CustomFieldOut.model_validate(f),
            )
        labels = system_labels.get(ref)
        if labels is None:
            return None
        return LayoutFieldOut(field_ref=ref, kind="system", label_ru=labels[0], label_uz=labels[1])

    by_section: dict[int, list[LayoutFieldOut]] = {}
    assigned_refs: set[str] = set()
    for row in layout_rows:
        lf = resolve(row.field_ref)
        if lf is None:
            continue
        lf.is_hidden = row.is_hidden
        assigned_refs.add(row.field_ref)
        by_section.setdefault(row.section_id, []).append(lf)

    out = [
        LayoutSectionOut(
            id=s.id, code=s.code, name_ru=s.name_ru, name_uz=s.name_uz, sort=s.sort,
            fields=by_section.get(s.id, []),
        )
        for s in sections
    ]

    all_refs = list(system_labels.keys()) + [f"cf:{fid}" for fid in custom_fields]
    other_fields = [f for f in (resolve(ref) for ref in all_refs if ref not in assigned_refs) if f is not None]
    if other_fields:
        out.append(
            LayoutSectionOut(
                id=None, code="_other", name_ru="Другое", name_uz="Boshqa",
                sort=10**9, fields=other_fields,
            )
        )
    return out


@router.get("/sections", response_model=list[OrderFieldSectionOut])
async def list_sections(db: DbDep, _: Annotated[User, Depends(require_super)]):
    res = await db.execute(
        select(OrderFieldSection)
        .where(OrderFieldSection.entity == ENTITY)
        .order_by(OrderFieldSection.sort, OrderFieldSection.id)
    )
    return [OrderFieldSectionOut.model_validate(s) for s in res.scalars().all()]


@router.post("/sections", response_model=OrderFieldSectionOut, status_code=201)
async def create_section(
    body: OrderFieldSectionCreate,
    request: Request,
    db: DbDep,
    actor: Annotated[User, Depends(require_super)],
):
    res = await db.execute(
        select(OrderFieldSection).where(
            OrderFieldSection.entity == ENTITY, OrderFieldSection.code == body.code
        )
    )
    if res.scalar_one_or_none() is not None:
        raise HTTPException(409, "section_code_taken")

    section = OrderFieldSection(entity=ENTITY, **body.model_dump())
    db.add(section)
    await db.flush()

    await log_activity(
        db, action="admin.layout_section_created", category=LogCategory.ADMIN, actor=actor,
        entity="order_field_section", entity_id=section.id,
        message_ru=f"Создан раздел «{section.name_ru}»",
        message_uz=f"«{section.name_uz}» bo'limi yaratildi",
        request=request,
    )
    await db.commit()
    await db.refresh(section)
    await hub.publish("kanban", "order_layout.changed", {})
    return OrderFieldSectionOut.model_validate(section)


@router.patch("/sections/{section_id}", response_model=OrderFieldSectionOut)
async def update_section(
    section_id: int,
    body: OrderFieldSectionUpdate,
    request: Request,
    db: DbDep,
    actor: Annotated[User, Depends(require_super)],
):
    res = await db.execute(select(OrderFieldSection).where(OrderFieldSection.id == section_id))
    section = res.scalar_one_or_none()
    if section is None:
        raise HTTPException(404, "section_not_found")

    data = body.model_dump(exclude_unset=True)
    changes = {k: {"from": getattr(section, k), "to": v} for k, v in data.items()}
    for k, v in data.items():
        setattr(section, k, v)

    await log_activity(
        db, action="admin.layout_section_updated", category=LogCategory.ADMIN, actor=actor,
        entity="order_field_section", entity_id=section.id,
        message_ru=f"Изменён раздел «{section.name_ru}»",
        message_uz=f"«{section.name_uz}» bo'limi o'zgartirildi",
        meta=changes, request=request,
    )
    await db.commit()
    await db.refresh(section)
    await hub.publish("kanban", "order_layout.changed", {})
    return OrderFieldSectionOut.model_validate(section)


@router.post("/sections/reorder", response_model=Msg)
async def reorder_sections(
    body: SectionReorder,
    request: Request,
    db: DbDep,
    actor: Annotated[User, Depends(require_super)],
):
    res = await db.execute(select(OrderFieldSection).where(OrderFieldSection.entity == ENTITY))
    sections = {s.id: s for s in res.scalars().all()}

    for item in body.items:
        section = sections.get(int(item.get("id", 0)))
        if section is not None:
            section.sort = int(item.get("sort", section.sort))

    await log_activity(
        db, action="admin.layout_sections_reordered", category=LogCategory.ADMIN, actor=actor,
        message_ru="Изменён порядок разделов", message_uz="Bo'limlar tartibi o'zgartirildi",
        meta={"items": body.items}, request=request,
    )
    await db.commit()
    await hub.publish("kanban", "order_layout.changed", {})
    return Msg(detail="reordered")


@router.delete("/sections/{section_id}", response_model=Msg)
async def delete_section(
    section_id: int,
    request: Request,
    db: DbDep,
    actor: Annotated[User, Depends(require_super)],
    force: bool = False,
):
    res = await db.execute(select(OrderFieldSection).where(OrderFieldSection.id == section_id))
    section = res.scalar_one_or_none()
    if section is None:
        raise HTTPException(404, "section_not_found")

    res = await db.execute(
        select(func.count(OrderFieldLayout.id)).where(OrderFieldLayout.section_id == section_id)
    )
    field_count = res.scalar() or 0
    if field_count > 0 and not force:
        raise HTTPException(409, detail={"error": "section_has_fields", "hint": "reassign_or_force"})
    if field_count > 0:
        await db.execute(
            OrderFieldLayout.__table__.delete().where(OrderFieldLayout.section_id == section_id)
        )

    name = section.name_ru
    await db.delete(section)
    await log_activity(
        db, action="admin.layout_section_deleted", category=LogCategory.ADMIN, actor=actor,
        entity="order_field_section", entity_id=section_id,
        message_ru=f"Удалён раздел «{name}»", message_uz=f"«{name}» bo'limi o'chirildi",
        request=request,
    )
    await db.commit()
    await hub.publish("kanban", "order_layout.changed", {})
    return Msg(detail="section_deleted")


@router.put("/assignments", response_model=Msg)
async def save_assignments(
    body: LayoutSaveBody,
    request: Request,
    db: DbDep,
    actor: Annotated[User, Depends(require_super)],
):
    """Butun bo'lim/maydon joylashuvini bir yo'la almashtiradi."""
    refs = [item.field_ref for item in body.items]
    if len(refs) != len(set(refs)):
        raise HTTPException(400, "duplicate_field_ref")

    section_ids = {item.section_id for item in body.items}
    if section_ids:
        res = await db.execute(
            select(OrderFieldSection.id).where(OrderFieldSection.id.in_(section_ids))
        )
        valid_section_ids = {row[0] for row in res.all()}
        if section_ids - valid_section_ids:
            raise HTTPException(400, "unknown_section_id")

    res = await db.execute(
        select(CustomField.id).where(CustomField.entity == FieldEntity.ORDER, CustomField.is_active.is_(True))
    )
    valid_cf_ids = {row[0] for row in res.all()}
    valid_sys_refs = set(_system_labels().keys())

    for item in body.items:
        if item.field_ref.startswith("cf:"):
            try:
                fid = int(item.field_ref[3:])
            except ValueError:
                raise HTTPException(400, f"bad_field_ref:{item.field_ref}")
            if fid not in valid_cf_ids:
                raise HTTPException(400, f"unknown_field_ref:{item.field_ref}")
        elif item.field_ref not in valid_sys_refs:
            raise HTTPException(400, f"unknown_field_ref:{item.field_ref}")

    await db.execute(OrderFieldLayout.__table__.delete().where(OrderFieldLayout.entity == ENTITY))
    for item in body.items:
        db.add(
            OrderFieldLayout(
                entity=ENTITY, section_id=item.section_id, field_ref=item.field_ref,
                sort=item.sort, is_hidden=item.is_hidden,
            )
        )

    await log_activity(
        db, action="admin.layout_assignments_saved", category=LogCategory.ADMIN, actor=actor,
        message_ru="Изменено расположение полей", message_uz="Maydonlar joylashuvi o'zgartirildi",
        meta={"count": len(body.items)}, request=request,
    )
    await db.commit()
    await hub.publish("kanban", "order_layout.changed", {})
    return Msg(detail="saved")
