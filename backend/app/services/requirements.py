"""Majburiy maydonlar tekshiruvi.

Bitrix24 dagi «обязательные поля на стадии» ga o'xshash: adminkada har bosqich
uchun qaysi maydon qachon (yaratishda / bosqichga kirishda / bosqichdan
chiqishda) majburiy ekani belgilanadi.
"""

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import CustomField, Order, RequirementMoment, StageRequirement
from app.models.custom_field import SYSTEM_ORDER_FIELDS
from app.services.custom_fields import get_values

SYS_LABELS = {ref: (ru, uz) for ref, ru, uz in SYSTEM_ORDER_FIELDS}


@dataclass
class MissingField:
    field_ref: str
    label_ru: str
    label_uz: str
    message_ru: str
    message_uz: str


class RequirementError(Exception):
    def __init__(self, missing: list[MissingField], moment: str, stage_id: int) -> None:
        self.missing = missing
        self.moment = moment
        self.stage_id = stage_id
        super().__init__(f"{len(missing)} required field(s) missing")

    def to_detail(self) -> dict:
        return {
            "error": "required_fields",
            "moment": self.moment,
            "stage_id": self.stage_id,
            "fields": [
                {
                    "field_ref": m.field_ref,
                    "label_ru": m.label_ru,
                    "label_uz": m.label_uz,
                    "message_ru": m.message_ru,
                    "message_uz": m.message_uz,
                }
                for m in self.missing
            ],
        }


def _is_empty(value) -> bool:  # noqa: ANN001
    if value is None:
        return True
    if isinstance(value, str):
        return value.strip() == ""
    if isinstance(value, (list, tuple, set, dict)):
        return len(value) == 0
    return False


async def requirements_for(
    db: AsyncSession, stage_id: int, moment: str
) -> list[StageRequirement]:
    res = await db.execute(
        select(StageRequirement).where(
            StageRequirement.stage_id == stage_id,
            StageRequirement.moment == moment,
            StageRequirement.is_active.is_(True),
        )
    )
    return list(res.scalars().all())


async def _label(db: AsyncSession, field_ref: str) -> tuple[str, str]:
    if field_ref.startswith("sys:"):
        return SYS_LABELS.get(field_ref, (field_ref, field_ref))
    if field_ref.startswith("cf:"):
        try:
            fid = int(field_ref.split(":", 1)[1])
        except ValueError:
            return (field_ref, field_ref)
        res = await db.execute(select(CustomField).where(CustomField.id == fid))
        f = res.scalar_one_or_none()
        if f:
            return (f.label_ru, f.label_uz)
    return (field_ref, field_ref)


async def _value_of(db: AsyncSession, field_ref: str, order: Order, payload: dict):  # noqa: ANN001
    """Qiymatni avval kelayotgan payload'dan, bo'lmasa order'dan oladi."""
    if field_ref.startswith("sys:"):
        name = field_ref.split(":", 1)[1]
        if name in payload:
            return payload[name]
        if name == "services":
            return list(order.services or [])
        if name == "files":
            return payload.get("files")
        return getattr(order, name, None)

    if field_ref.startswith("cf:"):
        res = await db.execute(select(CustomField).where(CustomField.id == int(field_ref[3:])))
        f = res.scalar_one_or_none()
        if f is None:
            return None
        cf_payload = payload.get("custom_fields") or {}
        if f.code in cf_payload:
            return cf_payload[f.code]
        values = await get_values(db, "order", order.id) if order.id else {}
        return values.get(f.code)

    return None


async def validate(
    db: AsyncSession,
    *,
    order: Order,
    stage_id: int,
    moment: str,
    payload: dict | None = None,
) -> None:
    """Majburiy maydonlar to'lganini tekshiradi, bo'lmasa RequirementError."""
    payload = payload or {}
    reqs = await requirements_for(db, stage_id, moment)
    if not reqs:
        return

    missing: list[MissingField] = []
    for r in reqs:
        value = await _value_of(db, r.field_ref, order, payload)
        if not _is_empty(value):
            continue
        label_ru, label_uz = await _label(db, r.field_ref)
        missing.append(
            MissingField(
                field_ref=r.field_ref,
                label_ru=label_ru,
                label_uz=label_uz,
                message_ru=r.message_ru or f"Заполните поле «{label_ru}»",
                message_uz=r.message_uz or f"«{label_uz}» maydonini to'ldiring",
            )
        )

    if missing:
        raise RequirementError(missing, moment, stage_id)


async def validate_create(db: AsyncSession, order: Order, stage_id: int, payload: dict) -> None:
    await validate(db, order=order, stage_id=stage_id, moment=RequirementMoment.CREATE, payload=payload)


async def validate_move(
    db: AsyncSession, order: Order, from_stage_id: int, to_stage_id: int, payload: dict
) -> None:
    # avval joriy bosqichdan CHIQISH sharti, keyin yangi bosqichga KIRISH sharti
    await validate(
        db, order=order, stage_id=from_stage_id, moment=RequirementMoment.MOVE_OUT, payload=payload
    )
    await validate(
        db, order=order, stage_id=to_stage_id, moment=RequirementMoment.MOVE_IN, payload=payload
    )
