from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import CustomField, CustomFieldValue


async def fields_for(db: AsyncSession, entity: str, active_only: bool = True) -> list[CustomField]:
    q = select(CustomField).where(CustomField.entity == entity)
    if active_only:
        q = q.where(CustomField.is_active.is_(True))
    res = await db.execute(q.order_by(CustomField.sort, CustomField.id))
    return list(res.scalars().all())


async def get_values(db: AsyncSession, entity: str, entity_id: int) -> dict[str, Any]:
    """{field_code: value} ko'rinishida qaytaradi."""
    res = await db.execute(
        select(CustomFieldValue, CustomField)
        .join(CustomField, CustomField.id == CustomFieldValue.field_id)
        .where(CustomField.entity == entity, CustomFieldValue.entity_id == entity_id)
    )
    out: dict[str, Any] = {}
    for value_row, field in res.all():
        out[field.code] = (value_row.value or {}).get("v")
    return out


async def get_values_bulk(
    db: AsyncSession, entity: str, entity_ids: list[int]
) -> dict[int, dict[str, Any]]:
    if not entity_ids:
        return {}
    res = await db.execute(
        select(CustomFieldValue, CustomField)
        .join(CustomField, CustomField.id == CustomFieldValue.field_id)
        .where(CustomField.entity == entity, CustomFieldValue.entity_id.in_(entity_ids))
    )
    out: dict[int, dict[str, Any]] = {i: {} for i in entity_ids}
    for value_row, field in res.all():
        out.setdefault(value_row.entity_id, {})[field.code] = (value_row.value or {}).get("v")
    return out


async def set_values(
    db: AsyncSession, entity: str, entity_id: int, data: dict[str, Any]
) -> dict[str, Any]:
    """Faqat berilgan kalitlarni yangilaydi. Qaytaradi: {code: (eski, yangi)} o'zgarishlar."""
    if not data:
        return {}

    fields = {f.code: f for f in await fields_for(db, entity, active_only=False)}
    res = await db.execute(
        select(CustomFieldValue)
        .join(CustomField, CustomField.id == CustomFieldValue.field_id)
        .where(CustomField.entity == entity, CustomFieldValue.entity_id == entity_id)
    )
    existing = {r.field_id: r for r in res.scalars().all()}

    changes: dict[str, Any] = {}
    for code, new_val in data.items():
        field = fields.get(code)
        if field is None:
            continue
        row = existing.get(field.id)
        old_val = (row.value or {}).get("v") if row else None
        if old_val == new_val:
            continue
        if row is None:
            db.add(CustomFieldValue(field_id=field.id, entity_id=entity_id, value={"v": new_val}))
        else:
            row.value = {"v": new_val}
        changes[code] = {"from": old_val, "to": new_val}

    await db.flush()
    return changes
