"""Adminka: qo'shimcha maydonlar, bosqichdagi majburiy maydonlar,
bildirishnoma shablonlari, umumiy sozlamalar."""

from typing import Annotated

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func, select

from app.core.deps import CurrentUser, DbDep, require
from app.core.security import now_utc
from app.models import (
    SYSTEM_ORDER_FIELDS,
    ActivityLog,
    CustomField,
    CustomFieldValue,
    FieldEntity,
    FieldType,
    Holiday,
    LogCategory,
    NotifyEvent,
    NotifyTemplate,
    OrderFieldLayout,
    Recipient,
    RequirementMoment,
    Role,
    Stage,
    StageRequirement,
    TelegramContact,
    User,
)
from app.schemas.admin import (
    CustomFieldCreate,
    CustomFieldOut,
    CustomFieldUpdate,
    FieldRefOut,
    HolidayCreate,
    HolidayOut,
    NotifyMetaOut,
    NotifyTemplateOut,
    NotifyTemplateUpsert,
    SettingsOut,
    SettingsUpdate,
    StageRequirementCreate,
    StageRequirementOut,
    StageRequirementUpdate,
    TelegramContactOut,
    TelegramLinkBody,
    TelegramTestOut,
)
from app.schemas.common import Msg
from app.services import telegram
from app.services.logger import log_activity
from app.services.settings_store import all_settings, get_setting, set_setting
from app.services.telegram_poller import telegram_poller

router = APIRouter(prefix="/admin", tags=["admin"])


# ==========================================================================
# Qo'shimcha maydonlar («polya»)
# ==========================================================================


@router.get("/fields", response_model=list[CustomFieldOut])
async def list_fields(db: DbDep, user: CurrentUser, entity: str | None = None):
    """Formalarni qurish uchun hamma ko'ra oladi (sozlash esa admin.fields talab qiladi)."""
    q = select(CustomField)
    if entity:
        q = q.where(CustomField.entity == entity)
    if not (user.is_super or user.has_perm("admin.fields")):
        q = q.where(CustomField.is_active.is_(True))
    res = await db.execute(q.order_by(CustomField.entity, CustomField.sort, CustomField.id))
    return [CustomFieldOut.model_validate(f) for f in res.scalars().all()]


@router.get("/fields/meta", response_model=dict)
async def fields_meta(_: Annotated[User, Depends(require("admin.fields"))]):
    return {
        "entities": list(FieldEntity.ALL),
        "types": list(FieldType.ALL),
    }


@router.post("/fields", response_model=CustomFieldOut, status_code=201)
async def create_field(
    body: CustomFieldCreate,
    request: Request,
    db: DbDep,
    actor: Annotated[User, Depends(require("admin.fields"))],
):
    if body.entity not in FieldEntity.ALL:
        raise HTTPException(400, "bad_entity")
    if body.type not in FieldType.ALL:
        raise HTTPException(400, "bad_type")
    if body.type in (FieldType.SELECT, FieldType.MULTISELECT) and not body.options:
        raise HTTPException(400, "options_required")

    res = await db.execute(
        select(CustomField).where(
            CustomField.entity == body.entity, CustomField.code == body.code
        )
    )
    if res.scalar_one_or_none() is not None:
        raise HTTPException(409, "field_code_taken")

    field = CustomField(**body.model_dump())
    db.add(field)
    await db.flush()

    await log_activity(
        db, action="admin.field_created", category=LogCategory.ADMIN, actor=actor,
        entity="custom_field", entity_id=field.id,
        message_ru=f"Создано поле «{field.label_ru}» ({field.entity}.{field.code})",
        message_uz=f"«{field.label_uz}» maydoni yaratildi ({field.entity}.{field.code})",
        meta={"type": field.type}, request=request,
    )
    await db.commit()
    await db.refresh(field)
    return CustomFieldOut.model_validate(field)


@router.patch("/fields/{field_id}", response_model=CustomFieldOut)
async def update_field(
    field_id: int,
    body: CustomFieldUpdate,
    request: Request,
    db: DbDep,
    actor: Annotated[User, Depends(require("admin.fields"))],
):
    res = await db.execute(select(CustomField).where(CustomField.id == field_id))
    field = res.scalar_one_or_none()
    if field is None:
        raise HTTPException(404, "field_not_found")

    data = body.model_dump(exclude_unset=True)
    changes = {k: {"from": getattr(field, k), "to": v} for k, v in data.items()}
    for k, v in data.items():
        setattr(field, k, v)

    await log_activity(
        db, action="admin.field_updated", category=LogCategory.ADMIN, actor=actor,
        entity="custom_field", entity_id=field.id,
        message_ru=f"Изменено поле «{field.label_ru}»",
        message_uz=f"«{field.label_uz}» maydoni o'zgartirildi",
        meta=changes, request=request,
    )
    await db.commit()
    await db.refresh(field)
    return CustomFieldOut.model_validate(field)


@router.delete("/fields/{field_id}", response_model=Msg)
async def delete_field(
    field_id: int,
    request: Request,
    db: DbDep,
    actor: Annotated[User, Depends(require("admin.fields"))],
    hard: bool = False,
):
    res = await db.execute(select(CustomField).where(CustomField.id == field_id))
    field = res.scalar_one_or_none()
    if field is None:
        raise HTTPException(404, "field_not_found")

    label = field.label_ru
    if hard:
        # to'ldirilgan qiymatlar ham o'chadi — ogohlantirish frontendda
        await db.execute(
            CustomFieldValue.__table__.delete().where(CustomFieldValue.field_id == field_id)
        )
        await db.execute(
            StageRequirement.__table__.delete().where(
                StageRequirement.field_ref == f"cf:{field_id}"
            )
        )
        await db.execute(
            OrderFieldLayout.__table__.delete().where(
                OrderFieldLayout.field_ref == f"cf:{field_id}"
            )
        )
        await db.delete(field)
        action, msg_ru, msg_uz = (
            "admin.field_deleted",
            f"Удалено поле «{label}» вместе со значениями",
            f"«{label}» maydoni qiymatlari bilan o'chirildi",
        )
    else:
        field.is_active = False
        action, msg_ru, msg_uz = (
            "admin.field_archived",
            f"Поле «{label}» отключено",
            f"«{label}» maydoni o'chirildi (arxiv)",
        )

    await log_activity(
        db, action=action, category=LogCategory.ADMIN, actor=actor,
        entity="custom_field", entity_id=field_id,
        message_ru=msg_ru, message_uz=msg_uz, request=request,
    )
    await db.commit()
    return Msg(detail="deleted" if hard else "archived")


# ==========================================================================
# Bosqichdagi majburiy maydonlar
# ==========================================================================


@router.get("/field-refs", response_model=list[FieldRefOut])
async def field_refs(db: DbDep, _: Annotated[User, Depends(require("admin.fields"))]):
    """Majburiy qilib belgilash mumkin bo'lgan maydonlar ro'yxati."""
    out = [
        FieldRefOut(field_ref=ref, label_ru=ru, label_uz=uz, kind="system")
        for ref, ru, uz in SYSTEM_ORDER_FIELDS
    ]
    res = await db.execute(
        select(CustomField)
        .where(CustomField.entity == FieldEntity.ORDER, CustomField.is_active.is_(True))
        .order_by(CustomField.sort)
    )
    out += [
        FieldRefOut(
            field_ref=f"cf:{f.id}", label_ru=f.label_ru, label_uz=f.label_uz, kind="custom"
        )
        for f in res.scalars().all()
    ]
    return out


@router.get("/requirements", response_model=list[StageRequirementOut])
async def list_requirements(db: DbDep, user: CurrentUser, stage_id: int | None = None):
    q = select(StageRequirement)
    if stage_id:
        q = q.where(StageRequirement.stage_id == stage_id)
    res = await db.execute(q.order_by(StageRequirement.stage_id, StageRequirement.id))
    rows = list(res.scalars().all())

    labels = {ref: (ru, uz) for ref, ru, uz in SYSTEM_ORDER_FIELDS}
    cf_res = await db.execute(select(CustomField))
    for f in cf_res.scalars().all():
        labels[f"cf:{f.id}"] = (f.label_ru, f.label_uz)

    out = []
    for r in rows:
        row = StageRequirementOut.model_validate(r)
        row.label_ru, row.label_uz = labels.get(r.field_ref, (r.field_ref, r.field_ref))
        out.append(row)
    return out


@router.post("/requirements", response_model=StageRequirementOut, status_code=201)
async def create_requirement(
    body: StageRequirementCreate,
    request: Request,
    db: DbDep,
    actor: Annotated[User, Depends(require("admin.fields"))],
):
    if body.moment not in RequirementMoment.ALL:
        raise HTTPException(400, "bad_moment")

    res = await db.execute(select(Stage).where(Stage.id == body.stage_id))
    stage = res.scalar_one_or_none()
    if stage is None:
        raise HTTPException(404, "stage_not_found")

    res = await db.execute(
        select(StageRequirement).where(
            StageRequirement.stage_id == body.stage_id,
            StageRequirement.field_ref == body.field_ref,
            StageRequirement.moment == body.moment,
        )
    )
    if res.scalar_one_or_none() is not None:
        raise HTTPException(409, "requirement_exists")

    req = StageRequirement(**body.model_dump())
    db.add(req)
    await db.flush()

    await log_activity(
        db, action="admin.requirement_created", category=LogCategory.ADMIN, actor=actor,
        entity="stage_requirement", entity_id=req.id,
        message_ru=f"Поле {req.field_ref} стало обязательным на этапе «{stage.name_ru}» ({req.moment})",
        message_uz=f"{req.field_ref} maydoni «{stage.name_uz}» bosqichida majburiy ({req.moment})",
        request=request,
    )
    await db.commit()
    await db.refresh(req)
    return StageRequirementOut.model_validate(req)


@router.patch("/requirements/{req_id}", response_model=StageRequirementOut)
async def update_requirement(
    req_id: int,
    body: StageRequirementUpdate,
    request: Request,
    db: DbDep,
    actor: Annotated[User, Depends(require("admin.fields"))],
):
    res = await db.execute(select(StageRequirement).where(StageRequirement.id == req_id))
    req = res.scalar_one_or_none()
    if req is None:
        raise HTTPException(404, "requirement_not_found")

    data = body.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(req, k, v)

    await log_activity(
        db, action="admin.requirement_updated", category=LogCategory.ADMIN, actor=actor,
        entity="stage_requirement", entity_id=req.id,
        message_ru="Изменено обязательное поле", message_uz="Majburiy maydon o'zgartirildi",
        meta=data, request=request,
    )
    await db.commit()
    await db.refresh(req)
    return StageRequirementOut.model_validate(req)


@router.delete("/requirements/{req_id}", response_model=Msg)
async def delete_requirement(
    req_id: int,
    request: Request,
    db: DbDep,
    actor: Annotated[User, Depends(require("admin.fields"))],
):
    res = await db.execute(select(StageRequirement).where(StageRequirement.id == req_id))
    req = res.scalar_one_or_none()
    if req is None:
        raise HTTPException(404, "requirement_not_found")

    ref, stage_id = req.field_ref, req.stage_id
    await db.delete(req)
    await log_activity(
        db, action="admin.requirement_deleted", category=LogCategory.ADMIN, actor=actor,
        entity="stage_requirement", entity_id=req_id,
        message_ru=f"Поле {ref} больше не обязательно (этап {stage_id})",
        message_uz=f"{ref} maydoni endi majburiy emas ({stage_id}-bosqich)",
        request=request,
    )
    await db.commit()
    return Msg(detail="deleted")


# ==========================================================================
# Bildirishnoma shablonlari
# ==========================================================================


@router.get("/notify/meta", response_model=NotifyMetaOut)
async def notify_meta(db: DbDep, _: Annotated[User, Depends(require("admin.notify"))]):
    res = await db.execute(select(Role).where(Role.is_active.is_(True)))
    roles = list(res.scalars().all())

    return NotifyMetaOut(
        events=[
            {"code": e, "label_ru": _EVENT_LABELS[e][0], "label_uz": _EVENT_LABELS[e][1]}
            for e in NotifyEvent.ALL
        ],
        recipient_tokens=[
            {"token": Recipient.RESPONSIBLE, "label_ru": "Ответственный", "label_uz": "Mas'ul"},
            {"token": Recipient.PREV_RESPONSIBLE, "label_ru": "Предыдущий исполнитель", "label_uz": "Oldingi bajaruvchi"},
            {"token": Recipient.CREATED_BY, "label_ru": "Создатель проекта", "label_uz": "Proyekt yaratuvchisi"},
            {"token": Recipient.STAGE_USERS, "label_ru": "Все техники этапа", "label_uz": "Bosqichning barcha texniklari"},
            {"token": Recipient.ORDER_PARTICIPANTS, "label_ru": "Все участники проекта", "label_uz": "Proyektning barcha ishtirokchilari"},
            {"token": Recipient.ACTOR, "label_ru": "Сам инициатор", "label_uz": "Harakat qilgan odam"},
            *[
                {"token": f"role:{r.code}", "label_ru": f"Роль: {r.name_ru}", "label_uz": f"Rol: {r.name_uz}"}
                for r in roles
            ],
        ],
        placeholders=[
            {"key": "{order_number}", "label_ru": "Номер проекта", "label_uz": "Proyekt raqami"},
            {"key": "{order_title}", "label_ru": "Название проекта", "label_uz": "Proyekt nomi"},
            {"key": "{stage}", "label_ru": "Текущий этап", "label_uz": "Joriy bosqich"},
            {"key": "{stage_prev}", "label_ru": "Предыдущий этап", "label_uz": "Oldingi bosqich"},
            {"key": "{actor}", "label_ru": "Кто сделал", "label_uz": "Kim qildi"},
            {"key": "{responsible}", "label_ru": "Ответственный", "label_uz": "Mas'ul"},
            {"key": "{patient}", "label_ru": "Пациент", "label_uz": "Patsent"},
            {"key": "{doctor}", "label_ru": "Врач", "label_uz": "Vrach"},
            {"key": "{deadline}", "label_ru": "Дедлайн", "label_uz": "Dedlayn"},
            {"key": "{comment}", "label_ru": "Комментарий", "label_uz": "Izoh"},
        ],
    )


_EVENT_LABELS: dict[str, tuple[str, str]] = {
    NotifyEvent.ORDER_CREATED: ("Проект создан", "Proyekt yaratildi"),
    NotifyEvent.ORDER_STAGE_CHANGED: ("Смена этапа", "Bosqich o'zgardi"),
    NotifyEvent.ORDER_ASSIGNED: ("Назначен ответственный", "Mas'ul biriktirildi"),
    NotifyEvent.ORDER_CLAIMED: ("Проект взят в работу", "Proyekt ishga olindi"),
    NotifyEvent.ORDER_UNASSIGNED: ("Снят ответственный", "Mas'ul olib tashlandi"),
    NotifyEvent.ORDER_RENAMED: ("Изменены данные проекта", "Proyekt ma'lumoti o'zgardi"),
    NotifyEvent.ORDER_SUCCESS: ("Проект успешно завершён", "Proyekt muvaffaqiyatli yakunlandi"),
    NotifyEvent.ORDER_FAIL: ("Проект провален", "Proyekt muvaffaqiyatsiz"),
    NotifyEvent.ORDER_OVERDUE: ("Просрочен дедлайн этапа", "Bosqich dedlayni kechikdi"),
    NotifyEvent.ORDER_DEADLINE_OVERDUE: ("Просрочен общий дедлайн проекта", "Proyektning umumiy dedlayni o'tdi"),
    NotifyEvent.ORDER_FILE: ("Загружен файл", "Fayl yuklandi"),
    NotifyEvent.CHAT_MESSAGE: ("Новое сообщение в чате", "Chatda yangi xabar"),
}


@router.get("/notify/templates", response_model=list[NotifyTemplateOut])
async def list_templates(
    db: DbDep, _: Annotated[User, Depends(require("admin.notify"))], event: str | None = None
):
    q = select(NotifyTemplate)
    if event:
        q = q.where(NotifyTemplate.event == event)
    res = await db.execute(q.order_by(NotifyTemplate.event, NotifyTemplate.stage_id))
    return [NotifyTemplateOut.model_validate(t) for t in res.scalars().all()]


@router.put("/notify/templates", response_model=NotifyTemplateOut)
async def upsert_template(
    body: NotifyTemplateUpsert,
    request: Request,
    db: DbDep,
    actor: Annotated[User, Depends(require("admin.notify"))],
):
    """Hodisa (+ixtiyoriy bosqich) uchun shablonni yaratadi yoki yangilaydi."""
    if body.event not in NotifyEvent.ALL:
        raise HTTPException(400, "bad_event")

    res = await db.execute(
        select(NotifyTemplate).where(
            NotifyTemplate.event == body.event, NotifyTemplate.stage_id == body.stage_id
        )
    )
    tpl = res.scalar_one_or_none()
    created = tpl is None
    if tpl is None:
        tpl = NotifyTemplate(event=body.event, stage_id=body.stage_id)
        db.add(tpl)

    for k, v in body.model_dump(exclude={"event", "stage_id"}).items():
        setattr(tpl, k, v)
    await db.flush()

    await log_activity(
        db,
        action="admin.notify_template_saved",
        category=LogCategory.ADMIN,
        actor=actor,
        entity="notify_template",
        entity_id=tpl.id,
        message_ru=f"{'Создан' if created else 'Изменён'} шаблон уведомления: {body.event}",
        message_uz=f"Bildirishnoma shabloni {'yaratildi' if created else 'yangilandi'}: {body.event}",
        meta={"recipients": body.recipients, "stage_id": body.stage_id},
        request=request,
    )
    await db.commit()
    await db.refresh(tpl)
    return NotifyTemplateOut.model_validate(tpl)


@router.delete("/notify/templates/{tpl_id}", response_model=Msg)
async def delete_template(
    tpl_id: int,
    request: Request,
    db: DbDep,
    actor: Annotated[User, Depends(require("admin.notify"))],
):
    res = await db.execute(select(NotifyTemplate).where(NotifyTemplate.id == tpl_id))
    tpl = res.scalar_one_or_none()
    if tpl is None:
        raise HTTPException(404, "template_not_found")

    event = tpl.event
    await db.delete(tpl)
    await log_activity(
        db, action="admin.notify_template_deleted", category=LogCategory.ADMIN, actor=actor,
        entity="notify_template", entity_id=tpl_id,
        message_ru=f"Удалён шаблон уведомления: {event}",
        message_uz=f"Bildirishnoma shabloni o'chirildi: {event}",
        request=request,
    )
    await db.commit()
    return Msg(detail="deleted")


# ==========================================================================
# Umumiy sozlamalar
# ==========================================================================


@router.get("/settings", response_model=SettingsOut)
async def get_settings_(db: DbDep, _: Annotated[User, Depends(require("admin.settings"))]):
    return SettingsOut(values=await all_settings(db))


@router.patch("/settings", response_model=SettingsOut)
async def update_settings(
    body: SettingsUpdate,
    request: Request,
    db: DbDep,
    actor: Annotated[User, Depends(require("admin.settings"))],
):
    old = await all_settings(db)
    for key, value in body.values.items():
        await set_setting(db, key, value)

    await log_activity(
        db, action="admin.settings_updated", category=LogCategory.ADMIN, actor=actor,
        message_ru="Изменены общие настройки", message_uz="Umumiy sozlamalar o'zgartirildi",
        meta={k: {"from": old.get(k), "to": v} for k, v in body.values.items()},
        request=request,
    )
    await db.commit()

    if "telegram_bot_token" in body.values or "telegram_enabled" in body.values:
        enabled = await get_setting(db, "telegram_enabled", False)
        token = await get_setting(db, "telegram_bot_token", "")
        await telegram_poller.restart(token if enabled and token else None)

    return SettingsOut(values=await all_settings(db))


# ---------- Bayramlar ----------


@router.get("/holidays", response_model=list[HolidayOut])
async def list_holidays(db: DbDep, _: Annotated[User, Depends(require("admin.settings"))]):
    res = await db.execute(select(Holiday).order_by(Holiday.month, Holiday.day))
    return list(res.scalars().all())


@router.post("/holidays", response_model=HolidayOut)
async def create_holiday(
    body: HolidayCreate,
    request: Request,
    db: DbDep,
    actor: Annotated[User, Depends(require("admin.settings"))],
):
    h = Holiday(**body.model_dump())
    db.add(h)
    await log_activity(
        db, action="admin.holiday_created", category=LogCategory.ADMIN, actor=actor,
        message_ru=f"Добавлен праздник {body.day:02d}.{body.month:02d}"
        + (f".{body.year}" if body.year else ""),
        message_uz=f"Bayram qo'shildi {body.day:02d}.{body.month:02d}"
        + (f".{body.year}" if body.year else ""),
        request=request,
    )
    await db.commit()
    await db.refresh(h)
    return h


@router.delete("/holidays/{holiday_id}", response_model=Msg)
async def delete_holiday(
    holiday_id: int,
    request: Request,
    db: DbDep,
    actor: Annotated[User, Depends(require("admin.settings"))],
):
    h = await db.get(Holiday, holiday_id)
    if h is None:
        raise HTTPException(404, "not_found")
    await db.delete(h)
    await log_activity(
        db, action="admin.holiday_deleted", category=LogCategory.ADMIN, actor=actor,
        message_ru=f"Удалён праздник {h.day:02d}.{h.month:02d}",
        message_uz=f"Bayram o'chirildi {h.day:02d}.{h.month:02d}",
        request=request,
    )
    await db.commit()
    return Msg(detail="deleted")


# ---------- Telegram ----------


@router.get("/telegram/contacts", response_model=list[TelegramContactOut])
async def list_telegram_contacts(db: DbDep, _: Annotated[User, Depends(require("admin.settings"))]):
    res = await db.execute(select(TelegramContact).order_by(TelegramContact.started_at.desc()))
    return list(res.scalars().all())


@router.post("/telegram/contacts/{contact_id}/link", response_model=TelegramContactOut)
async def link_telegram_contact(
    contact_id: int,
    body: TelegramLinkBody,
    request: Request,
    db: DbDep,
    actor: Annotated[User, Depends(require("admin.settings"))],
):
    contact = await db.get(TelegramContact, contact_id)
    if contact is None:
        raise HTTPException(404, "not_found")

    res = await db.execute(
        select(TelegramContact).where(TelegramContact.user_id == body.user_id)
    )
    existing = res.scalar_one_or_none()
    if existing is not None and existing.id != contact_id:
        raise HTTPException(409, "already_linked")

    contact.user_id = body.user_id
    await log_activity(
        db, action="admin.telegram_linked", category=LogCategory.ADMIN, actor=actor,
        message_ru=f"Telegram-аккаунт привязан к пользователю #{body.user_id}",
        message_uz=f"Telegram akkaunt #{body.user_id} foydalanuvchiga biriktirildi",
        request=request,
    )
    await db.commit()
    await db.refresh(contact)
    return contact


@router.post("/telegram/contacts/{contact_id}/unlink", response_model=TelegramContactOut)
async def unlink_telegram_contact(
    contact_id: int,
    request: Request,
    db: DbDep,
    actor: Annotated[User, Depends(require("admin.settings"))],
):
    contact = await db.get(TelegramContact, contact_id)
    if contact is None:
        raise HTTPException(404, "not_found")
    contact.user_id = None
    await log_activity(
        db, action="admin.telegram_unlinked", category=LogCategory.ADMIN, actor=actor,
        message_ru="Telegram-аккаунт отвязан", message_uz="Telegram akkaunt bo'shatildi",
        request=request,
    )
    await db.commit()
    await db.refresh(contact)
    return contact


@router.delete("/telegram/contacts/{contact_id}", response_model=Msg)
async def delete_telegram_contact(
    contact_id: int,
    db: DbDep,
    _: Annotated[User, Depends(require("admin.settings"))],
):
    contact = await db.get(TelegramContact, contact_id)
    if contact is None:
        raise HTTPException(404, "not_found")
    await db.delete(contact)
    await db.commit()
    return Msg(detail="deleted")


@router.post("/telegram/test", response_model=TelegramTestOut)
async def test_telegram(db: DbDep, _: Annotated[User, Depends(require("admin.settings"))]):
    token = await get_setting(db, "telegram_bot_token", "")
    if not token:
        return TelegramTestOut(ok=False, detail="no_token")
    me = await telegram.get_me(token)
    if me is None:
        return TelegramTestOut(ok=False, detail="invalid_token")
    return TelegramTestOut(ok=True, bot_username=me.get("username"))


@router.post("/logs/cleanup", response_model=Msg)
async def cleanup_logs(
    request: Request,
    db: DbDep,
    actor: Annotated[User, Depends(require("admin.settings"))],
):
    """Tizim loglarini sozlamadagi saqlash muddatidan eski yozuvlarni o'chiradi (OrderStageHistory ga tegilmaydi)."""
    settings = await all_settings(db)
    days = int(settings.get("log_retention_days", 90))
    cutoff = now_utc() - timedelta(days=days)

    res = await db.execute(select(func.count()).where(ActivityLog.created_at < cutoff))
    total = res.scalar() or 0

    await db.execute(ActivityLog.__table__.delete().where(ActivityLog.created_at < cutoff))
    await log_activity(
        db, action="admin.logs_cleanup", category=LogCategory.ADMIN, actor=actor,
        message_ru=f"Удалено {total} записей логов старше {days} дней",
        message_uz=f"{days} kundan eski {total} ta log yozuvi o'chirildi",
        request=request,
    )
    await db.commit()
    return Msg(detail=f"deleted {total}")
