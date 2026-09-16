from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import now_utc
from app.models import CustomField, CustomFieldValue, FieldType
from app.services import workcalendar

# `default_value`da shu maxsus qiymat qo'yilsa — statik matn emas, proyekt
# yaratilayotgan ANIQ shu paytdagi sana/vaqt qo'yiladi (har safar boshqacha).
TODAY_SENTINEL = "__today__"


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


def _default_value_for(field: CustomField) -> Any:
    if field.default_value == TODAY_SENTINEL:
        local_now = now_utc().astimezone(workcalendar.APP_TZ)
        if field.type == FieldType.DATETIME:
            return local_now.replace(microsecond=0).isoformat()
        return local_now.date().isoformat()
    return field.default_value


async def apply_create_defaults(
    db: AsyncSession, entity: str, values: dict[str, Any]
) -> dict[str, Any]:
    """Yaratish payload'ida berilmagan maydonlarga `default_value`ni qo'yadi
    (`__today__` bo'lsa — joriy sana/vaqt). Foydalanuvchi allaqachon qiymat
    bergan bo'lsa (bo'sh bo'lmasa) — tegilmaydi."""
    fields = await fields_for(db, entity)
    out = dict(values)
    for f in fields:
        if not f.default_value:
            continue
        if out.get(f.code) not in (None, ""):
            continue
        out[f.code] = _default_value_for(f)
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
