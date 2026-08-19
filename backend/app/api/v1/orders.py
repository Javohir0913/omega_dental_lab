from datetime import datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import Text, and_, case, cast, func, or_, select

from app.core.deps import CurrentUser, DbDep, require
from app.core.security import now_utc
from app.models import (
    DEFAULT_SETTINGS,
    Chat,
    ChatMember,
    CustomField,
    CustomFieldValue,
    Doctor,
    FieldEntity,
    FileAsset,
    FileEntity,
    Holiday,
    LogCategory,
    Message,
    NotifyEvent,
    Order,
    OrderFileRead,
    OrderStageHistory,
    Patient,
    Service,
    Stage,
    StageKind,
    User,
)
from app.schemas.catalog import StageOut
from app.schemas.common import Msg, Page
from app.schemas.order import (
    FileOut,
    KanbanColumn,
    KanbanColumnPage,
    KanbanCursor,
    KanbanOut,
    OrderAssign,
    OrderCard,
    OrderCreate,
    OrderDetail,
    OrderMove,
    OrderPause,
    OrderUpdate,
    StageHistoryOut,
    WorkCalendarStatus,
)
from app.services import orders as svc
from app.services import requirements as req_svc
from app.services import workcalendar
from app.services.custom_fields import get_values, get_values_bulk, set_values
from app.services.logger import log_activity
from app.services.notify import notify
from app.services.settings_store import get_setting

router = APIRouter(prefix="/orders", tags=["orders"])


# --------------------------------------------------------------------------
# Yordamchilar
# --------------------------------------------------------------------------


def _apply_search(query, q: str):  # noqa: ANN001
    """Nomi/raqami, bemor, shifokor, mas'ul, tavsif va qo'shimcha maydonlar bo'yicha qidiruv."""
    like = f"%{q}%"
    cf_match = (
        select(CustomFieldValue.entity_id)
        .join(CustomField, CustomFieldValue.field_id == CustomField.id)
        .where(
            CustomField.entity == FieldEntity.ORDER,
            cast(CustomFieldValue.value["v"], Text).ilike(like),
        )
    )
    return query.where(
        or_(
            Order.title.ilike(like),
            Order.number.ilike(like),
            Order.description.ilike(like),
            Order.patient.has(or_(Patient.full_name.ilike(like), Patient.phone.ilike(like))),
            Order.doctor.has(
                or_(Doctor.full_name.ilike(like), Doctor.phone.ilike(like), Doctor.clinic.ilike(like))
            ),
            Order.responsible.has(User.full_name.ilike(like)),
            Order.id.in_(cf_match),
        )
    )


def _visibility_filter(query, user: User):  # noqa: ANN001
    """Texnik faqat o'z bosqichlarini ko'rsin (order.view.own_stage huquqi bilan)."""
    if user.is_super or user.has_perm("order.view.all"):
        return query
    if user.has_perm("order.view.own_stage"):
        stage_ids = [s.id for s in (user.stages or [])]
        return query.where(
            or_(
                Order.stage_id.in_(stage_ids) if stage_ids else False,
                Order.responsible_id == user.id,
                Order.created_by_id == user.id,
            )
        )
    raise HTTPException(403, "forbidden")


async def _get_order(db, order_id: int, user: User) -> Order:  # noqa: ANN001
    res = await db.execute(select(Order).where(Order.id == order_id))
    order = res.scalar_one_or_none()
    if order is None or order.deleted_at is not None:
        raise HTTPException(404, "order_not_found")

    if not (user.is_super or user.has_perm("order.view.all")):
        visible = (
            order.responsible_id == user.id
            or order.created_by_id == user.id
            or any(s.id == order.stage_id for s in (user.stages or []))
        )
        if not visible:
            raise HTTPException(403, "forbidden")
    return order


async def _decorate(  # noqa: ANN001
    db, card: OrderCard, order: Order, user: User, cal: workcalendar.WorkCalendar | None = None
) -> OrderCard:
    now = now_utc()
    if cal is None:
        cal = await workcalendar.load_calendar(db)

    # Qolgan ISH vaqti — faqat kalendar yoqilganda beriladi (dam kuni/tun sanalmaydi,
    # shuning uchun bu son dam kunlari o'zgarmaydi va interfeysda vaqt to'xtagani ko'rinadi).
    # Kalendar o'chiq bo'lsa `null` qoladi — interfeys avvalgidek dedlayn sanasini ko'rsatadi.
    if cal.enabled and not order.is_closed:
        if order.is_paused:
            card.stage_remaining_seconds = order.stage_deadline_frozen_remaining_sec
        elif order.stage_deadline:
            card.stage_remaining_seconds = workcalendar.business_seconds_between(
                now, order.stage_deadline, cal
            )

    if (
        cal.enabled
        and not order.is_closed
        and not order.is_paused
        and order.stage_deadline is not None
    ):
        card.deadline_pause_reason = workcalendar.nonworking_reason(now, cal)
        card.deadline_paused = card.deadline_pause_reason is not None

    card.is_overdue = bool(
        not order.is_closed
        and (
            (order.stage_deadline and order.stage_deadline < now)
            or (order.deadline and order.deadline < now)
        )
    )
    card.can_move = svc.can_move(user, order)
    card.can_move_back = bool(
        not order.is_closed and not order.is_paused and svc.can_move_back(user, order)
    )
    card.can_claim = bool(
        order.responsible_id is None
        and not order.is_closed
        and order.stage.allow_claim
        and (user.is_super or user.has_perm("order.claim"))
        and svc.can_user_work_stage(user, order.stage)
    )
    card.can_resume = bool(
        order.is_paused and (user.is_super or user.id == order.paused_by_id)
    )
    if card.photo is not None:
        card.photo = card.photo.model_copy(update={"url": f"/api/v1/files/{card.photo.id}"})
    return card


async def _order_unread_map(db, order_ids: list[int], user_id: int) -> dict[int, int]:  # noqa: ANN001
    """Har bir proyekt uchun o'qilmagan chat xabarlari soni."""
    if not order_ids:
        return {}
    res = await db.execute(select(Chat.order_id, Chat.id).where(Chat.order_id.in_(order_ids)))
    order_to_chat = {row[0]: row[1] for row in res.all()}
    if not order_to_chat:
        return {}

    chat_ids = list(order_to_chat.values())
    res = await db.execute(
        select(ChatMember.chat_id, ChatMember.last_read_message_id).where(
            ChatMember.chat_id.in_(chat_ids),
            ChatMember.user_id == user_id,
        )
    )
    last_read = dict(res.all())

    out: dict[int, int] = {}
    for order_id, chat_id in order_to_chat.items():
        lr = last_read.get(chat_id)
        q = select(func.count(Message.id)).where(
            Message.chat_id == chat_id, Message.deleted_at.is_(None)
        )
        if lr:
            q = q.where(Message.id > lr)
        n = (await db.execute(q)).scalar() or 0
        if n:
            out[order_id] = n
    return out


async def _order_unread_files_map(
    db, order_ids: list[int], user_id: int, files_count: dict[int, int]  # noqa: ANN001
) -> dict[int, int]:
    """Har bir proyekt uchun foydalanuvchi hali ko'rmagan (yangi) fayllar soni.

    Fayllar tabi hali umuman ochilmagan bo'lsa — umumiy son (birinchi tashrifda
    hammasi "yangi"). Ochilgan bo'lsa — oxirgi ko'rilgandan keyin qo'shilganlar soni.
    """
    if not order_ids:
        return {}
    res = await db.execute(
        select(OrderFileRead.order_id).where(
            OrderFileRead.order_id.in_(order_ids), OrderFileRead.user_id == user_id
        )
    )
    read_order_ids = {row[0] for row in res.all()}

    res = await db.execute(
        select(FileAsset.entity_id, func.count(FileAsset.id))
        .join(
            OrderFileRead,
            and_(OrderFileRead.order_id == FileAsset.entity_id, OrderFileRead.user_id == user_id),
        )
        .where(
            FileAsset.entity == FileEntity.ORDER,
            FileAsset.entity_id.in_(order_ids),
            FileAsset.deleted_at.is_(None),
            FileAsset.created_at > OrderFileRead.last_read_at,
        )
        .group_by(FileAsset.entity_id)
    )
    new_since_read = dict(res.all())

    return {
        oid: new_since_read.get(oid, 0) if oid in read_order_ids else files_count.get(oid, 0)
        for oid in order_ids
    }


async def _cards(db, orders: list[Order], user: User) -> list[OrderCard]:  # noqa: ANN001
    if not orders:
        return []
    ids = [o.id for o in orders]
    cf = await get_values_bulk(db, "order", ids)

    res = await db.execute(
        select(
            FileAsset.entity_id,
            func.count(FileAsset.id),
            func.sum(
                case(
                    (
                        or_(
                            FileAsset.name.ilike("%.stl"),
                            FileAsset.name.ilike("%.obj"),
                            FileAsset.name.ilike("%.ply"),
                        ),
                        1,
                    ),
                    else_=0,
                )
            ),
        )
        .where(
            FileAsset.entity == FileEntity.ORDER,
            FileAsset.entity_id.in_(ids),
            FileAsset.deleted_at.is_(None),
        )
        .group_by(FileAsset.entity_id)
    )
    files_count: dict[int, int] = {}
    has_3d_map: dict[int, bool] = {}
    for entity_id, count, has_3d in res.all():
        files_count[entity_id] = count
        has_3d_map[entity_id] = bool(has_3d)
    unread_map = await _order_unread_map(db, ids, user.id)
    unread_files_map = await _order_unread_files_map(db, ids, user.id, files_count)
    cal = await workcalendar.load_calendar(db)  # ro'yxat uchun bir marta yuklanadi

    out = []
    for o in orders:
        card = OrderCard.model_validate(o)
        card.custom_fields = cf.get(o.id, {})
        card.files_count = files_count.get(o.id, 0)
        card.has_3d_files = has_3d_map.get(o.id, False)
        card.unread_messages = unread_map.get(o.id, 0)
        card.unread_files_count = unread_files_map.get(o.id, 0)
        out.append(await _decorate(db, card, o, user, cal))
    return out


@router.get("/tooth-labels", response_model=dict[str, str])
async def tooth_labels(db: DbDep, _: CurrentUser):
    """Tish chizmasida ko'rsatiladigan yorliqlar (FDI kod -> ko'rinadigan raqam). Har qanday login qilgan foydalanuvchi ko'ra oladi."""
    return await get_setting(db, "tooth_labels", DEFAULT_SETTINGS["tooth_labels"][0]["v"])


@router.get("/tooth-chart-scale", response_model=int)
async def tooth_chart_scale(db: DbDep, _: CurrentUser):
    """Tish sxemasidagi katakchalar o'lchami (%, hammaga umumiy). Har qanday login qilgan foydalanuvchi ko'ra oladi."""
    return await get_setting(db, "tooth_chart_scale", DEFAULT_SETTINGS["tooth_chart_scale"][0]["v"])


@router.get("/work-calendar", response_model=WorkCalendarStatus)
async def work_calendar_status(db: DbDep, _: CurrentUser):
    """Hozir bosqich vaqti ketyaptimi yoki to'xtaganmi (dam kuni/bayram/ish soatidan tashqari)."""
    cal = await workcalendar.load_calendar(db)
    now = now_utc()
    out = WorkCalendarStatus(
        enabled=cal.enabled,
        working_now=True,
        work_hour_start=cal.start.strftime("%H:%M"),
        work_hour_end=cal.end.strftime("%H:%M"),
    )
    if not cal.enabled:
        return out

    out.reason = workcalendar.nonworking_reason(now, cal)
    out.working_now = out.reason is None
    if out.working_now:
        return out

    out.resumes_at = workcalendar.next_work_start(now, cal)
    if out.reason == "holiday":
        today = now.astimezone(workcalendar.APP_TZ).date()
        res = await db.execute(
            select(Holiday).where(
                Holiday.month == today.month,
                Holiday.day == today.day,
                or_(Holiday.year.is_(None), Holiday.year == today.year),
            )
        )
        holiday = res.scalars().first()
        if holiday is not None:
            out.holiday_name_ru = holiday.name_ru
            out.holiday_name_uz = holiday.name_uz
    return out


# --------------------------------------------------------------------------
# Kanban
# --------------------------------------------------------------------------


def _kanban_base_query(
    user: User,
    q: str | None,
    responsible_id: int | None,
    doctor_id: int | None,
    patient_id: int | None,
    service_id: int | None,
    only_mine: bool,
    only_free: bool,
    overdue: bool,
    paused: bool,
):
    base = select(Order).where(Order.deleted_at.is_(None))
    base = _visibility_filter(base, user)
    if q:
        base = _apply_search(base, q)
    if responsible_id:
        base = base.where(Order.responsible_id == responsible_id)
    if doctor_id:
        base = base.where(Order.doctor_id == doctor_id)
    if patient_id:
        base = base.where(Order.patient_id == patient_id)
    if service_id:
        base = base.where(Order.services.any(Service.id == service_id))
    if only_mine:
        base = base.where(Order.responsible_id == user.id)
    if only_free:
        base = base.where(Order.responsible_id.is_(None))
    if overdue:
        now = now_utc()
        base = base.where(
            Order.is_closed.is_(False),
            or_(
                and_(Order.stage_deadline.is_not(None), Order.stage_deadline < now),
                and_(Order.deadline.is_not(None), Order.deadline < now),
            ),
        )
    if paused:
        base = base.where(Order.is_paused.is_(True))
    return base


def _kanban_order_by(q_stage, stage: Stage):  # noqa: ANN001
    # yopiq ustunlarda (Успех/Провал) — eng yangilari, ish ustunlarida —
    # prioritet bo'yicha (kam = tepada), keyin qo'lda surilgan tartib
    if stage.is_final:
        return q_stage.order_by(Order.closed_at.desc().nullslast(), Order.id.desc())
    return q_stage.order_by(Order.priority.asc(), Order.sort.asc(), Order.id.desc())


@router.get("/kanban", response_model=KanbanOut)
async def kanban(
    db: DbDep,
    user: CurrentUser,
    q: str | None = None,
    responsible_id: int | None = None,
    doctor_id: int | None = None,
    patient_id: int | None = None,
    service_id: int | None = None,
    only_mine: bool = False,
    only_free: bool = False,
    overdue: bool = False,
    paused: bool = False,
    limit_per_column: int = Query(10, ge=5, le=200),
):
    """Kanban doskasi: ustunlar = bosqichlar, kartalar = proyektlar.

    Har bir ustunda dastlab faqat `limit_per_column` ta karta qaytariladi —
    qolganlari frontendda /orders/kanban/column orqali "yana yuklash" bilan olinadi,
    shu sababli ustunda ko'p karta to'planib ketsa ham sahifa qotib qolmaydi.
    """
    stages = await svc.active_stages(db)
    base = _kanban_base_query(
        user, q, responsible_id, doctor_id, patient_id, service_id, only_mine, only_free, overdue, paused
    )

    columns: list[KanbanColumn] = []
    from app.schemas.catalog import StageOut

    for stage in stages:
        q_stage = base.where(Order.stage_id == stage.id)
        total = (
            await db.execute(select(func.count()).select_from(q_stage.subquery()))
        ).scalar() or 0

        q_stage = _kanban_order_by(q_stage, stage)

        res = await db.execute(q_stage.limit(limit_per_column))
        rows = list(res.scalars().all())
        columns.append(
            KanbanColumn(
                stage=StageOut.model_validate(stage),
                total=total,
                orders=await _cards(db, rows, user),
            )
        )

    return KanbanOut(columns=columns)


@router.get("/kanban/column", response_model=KanbanColumnPage)
async def kanban_column(
    db: DbDep,
    user: CurrentUser,
    stage_id: int,
    q: str | None = None,
    responsible_id: int | None = None,
    doctor_id: int | None = None,
    patient_id: int | None = None,
    service_id: int | None = None,
    only_mine: bool = False,
    only_free: bool = False,
    overdue: bool = False,
    paused: bool = False,
    limit: int = Query(10, ge=1, le=100),
    after_id: int | None = None,
    after_closed_at: datetime | None = None,
    after_priority: int | None = None,
    after_sort: int | None = None,
):
    """Kanban ustunidagi keyingi kartalarni sahifalab olish ("yana yuklash").

    Keyset (cursor) bo'yicha sahifalanadi — oldingi so'rovda qaytgan oxirgi
    kartaning tartib maydonlari (`next_cursor`) shu yerga qaytarib beriladi.
    Oddiy offset'dan farqli o'laroq, shu orada boshqa foydalanuvchi yangi
    karta qo'shsa ham (masalan Success/Fail ustuniga), allaqachon yuklangan
    kartalar takrorlanmaydi va tushib qolmaydi.
    """
    stage = await db.get(Stage, stage_id)
    if stage is None:
        raise HTTPException(404, "stage_not_found")

    base = _kanban_base_query(
        user, q, responsible_id, doctor_id, patient_id, service_id, only_mine, only_free, overdue, paused
    )
    q_stage = base.where(Order.stage_id == stage_id)
    total = (await db.execute(select(func.count()).select_from(q_stage.subquery()))).scalar() or 0

    if stage.is_final:
        if after_id is not None:
            if after_closed_at is not None:
                q_stage = q_stage.where(
                    or_(
                        Order.closed_at < after_closed_at,
                        and_(Order.closed_at == after_closed_at, Order.id < after_id),
                        Order.closed_at.is_(None),
                    )
                )
            else:
                q_stage = q_stage.where(Order.closed_at.is_(None), Order.id < after_id)
        q_stage = q_stage.order_by(Order.closed_at.desc().nullslast(), Order.id.desc())
    else:
        if after_id is not None and after_priority is not None and after_sort is not None:
            q_stage = q_stage.where(
                or_(
                    Order.priority > after_priority,
                    and_(Order.priority == after_priority, Order.sort > after_sort),
                    and_(
                        Order.priority == after_priority,
                        Order.sort == after_sort,
                        Order.id < after_id,
                    ),
                )
            )
        q_stage = q_stage.order_by(Order.priority.asc(), Order.sort.asc(), Order.id.desc())

    res = await db.execute(q_stage.limit(limit))
    rows = list(res.scalars().all())

    next_cursor = None
    if len(rows) == limit:
        last = rows[-1]
        next_cursor = KanbanCursor(
            id=last.id,
            closed_at=last.closed_at if stage.is_final else None,
            priority=last.priority if not stage.is_final else None,
            sort=last.sort if not stage.is_final else None,
        )

    return KanbanColumnPage(items=await _cards(db, rows, user), total=total, next_cursor=next_cursor)


# --------------------------------------------------------------------------
# Ro'yxat / karta
# --------------------------------------------------------------------------


@router.get("", response_model=Page[OrderCard])
async def list_orders(
    db: DbDep,
    user: CurrentUser,
    q: str | None = None,
    stage_id: list[int] | None = Query(None),
    responsible_id: int | None = None,
    patient_id: int | None = None,
    doctor_id: int | None = None,
    is_closed: bool | None = None,
    paused: bool | None = None,
    closed_from: datetime | None = None,
    closed_to: datetime | None = None,
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
):
    query = _visibility_filter(select(Order).where(Order.deleted_at.is_(None)), user)
    if q:
        query = _apply_search(query, q)
    if stage_id:
        query = query.where(Order.stage_id.in_(stage_id))
    if responsible_id:
        query = query.where(Order.responsible_id == responsible_id)
    if patient_id:
        query = query.where(Order.patient_id == patient_id)
    if doctor_id:
        query = query.where(Order.doctor_id == doctor_id)
    if is_closed is not None:
        query = query.where(Order.is_closed.is_(is_closed))
    if paused is not None:
        query = query.where(Order.is_paused.is_(paused))
    if closed_from:
        query = query.where(Order.closed_at >= closed_from)
    if closed_to:
        query = query.where(Order.closed_at <= closed_to)

    total = (await db.execute(select(func.count()).select_from(query.subquery()))).scalar() or 0
    res = await db.execute(
        query.order_by(Order.id.desc()).offset((page - 1) * size).limit(size)
    )
    return Page[OrderCard](
        items=await _cards(db, list(res.scalars().all()), user),
        total=total, page=page, size=size,
    )


@router.get("/{order_id}", response_model=OrderDetail)
async def get_order(order_id: int, db: DbDep, user: CurrentUser):
    order = await _get_order(db, order_id, user)

    detail = OrderDetail.model_validate(order)
    detail.custom_fields = await get_values(db, "order", order.id)
    await _decorate(db, detail, order, user)

    res = await db.execute(select(Chat.id).where(Chat.order_id == order.id))
    detail.chat_id = res.scalar_one_or_none()
    if detail.chat_id:
        unread = await _order_unread_map(db, [order.id], user.id)
        detail.unread_messages = unread.get(order.id, 0)

    res = await db.execute(
        select(FileAsset)
        .where(
            FileAsset.entity == FileEntity.ORDER,
            FileAsset.entity_id == order.id,
            FileAsset.deleted_at.is_(None),
        )
        .order_by(FileAsset.created_at.desc())
    )
    files = list(res.scalars().all())
    detail.files = [
        FileOut.model_validate(f).model_copy(update={"url": f"/api/v1/files/{f.id}"})
        for f in files
    ]
    detail.files_count = len(files)
    unread_files = await _order_unread_files_map(db, [order.id], user.id, {order.id: len(files)})
    detail.unread_files_count = unread_files.get(order.id, 0)
    return detail


@router.get("/{order_id}/history", response_model=list[StageHistoryOut])
async def order_history(order_id: int, db: DbDep, user: CurrentUser):
    """Marshrut tarixi: qaysi bosqichda kim, qancha vaqt ishlagan."""
    await _get_order(db, order_id, user)
    res = await db.execute(
        select(OrderStageHistory)
        .where(OrderStageHistory.order_id == order_id)
        .order_by(OrderStageHistory.entered_at.asc())
    )
    out = []
    for h in res.scalars().all():
        row = StageHistoryOut.model_validate(h)
        row.stage_name_ru = h.stage.name_ru if h.stage else ""
        row.stage_name_uz = h.stage.name_uz if h.stage else ""
        out.append(row)
    return out


# --------------------------------------------------------------------------
# Yaratish / tahrirlash
# --------------------------------------------------------------------------


@router.post("", response_model=OrderDetail, status_code=201)
async def create_order(
    body: OrderCreate,
    request: Request,
    db: DbDep,
    actor: Annotated[User, Depends(require("order.create"))],
):
    stage = (
        await svc.get_stage(db, body.stage_id) if body.stage_id else await svc.first_stage(db)
    )

    number = await svc.next_number(db)
    order = Order(
        number=number,
        title=body.title.strip() or number,
        patient_id=body.patient_id,
        doctor_id=body.doctor_id,
        stage_id=stage.id,
        responsible_id=body.responsible_id,
        created_by_id=actor.id,
        deadline=body.deadline,
        priority=body.priority,
        description=body.description,
        color=body.color,
        photo_file_id=body.photo_file_id,
        teeth=body.teeth,
    )
    order.stage = stage
    await svc.apply_stage_deadline(db, order, stage)

    if body.service_ids:
        res = await db.execute(select(Service).where(Service.id.in_(body.service_ids)))
        order.services = list(res.scalars().all())

    # Majburiy maydonlar (adminkada CREATE momenti uchun sozlangan)
    payload = body.model_dump()
    payload["services"] = order.services
    try:
        await req_svc.validate_create(db, order, stage.id, payload)
    except req_svc.RequirementError as e:
        await log_activity(
            db, action="order.create", category=LogCategory.ORDER, is_success=False,
            actor=actor,
            message_ru="Проект не создан: не заполнены обязательные поля",
            message_uz="Proyekt yaratilmadi: majburiy maydonlar to'ldirilmagan",
            meta=e.to_detail(), request=request, commit=True,
        )
        raise HTTPException(422, detail=e.to_detail()) from e

    db.add(order)
    await db.flush()

    if body.custom_fields:
        await set_values(db, "order", order.id, body.custom_fields)

    await svc.open_history(db, order, actor)
    chat = await svc.ensure_order_chat(db, order, actor.id)
    if order.responsible_id:
        await svc.add_chat_member(db, chat, order.responsible_id)

    await log_activity(
        db, action="order.created", category=LogCategory.ORDER, actor=actor,
        order_id=order.id, entity="order", entity_id=order.id,
        message_ru=f"Создан проект {order.number} «{order.title}»",
        message_uz=f"Proyekt yaratildi: {order.number} «{order.title}»",
        meta={"stage": stage.name_ru, "responsible_id": order.responsible_id},
        request=request,
    )
    await db.commit()
    await db.refresh(order)

    await notify(db, NotifyEvent.ORDER_CREATED, order=order, actor=actor, stage_id=stage.id)
    await db.commit()
    await svc.broadcast_order(order, "order.created", {})

    detail = OrderDetail.model_validate(order)
    detail.custom_fields = await get_values(db, "order", order.id)
    detail.chat_id = chat.id
    return await _decorate(db, detail, order, actor)


@router.patch("/{order_id}", response_model=OrderDetail)
async def update_order(
    order_id: int,
    body: OrderUpdate,
    request: Request,
    db: DbDep,
    user: CurrentUser,
):
    order = await _get_order(db, order_id, user)

    if not (user.is_super or user.has_perm("order.edit") or user.has_perm("order.rename")):
        raise HTTPException(403, "forbidden")

    # Proyekt BOSHQA xodimga tayinlangan bo'lsa — alohida `order.edit.others` huquqi kerak
    if (
        not user.is_super
        and order.responsible_id is not None
        and order.responsible_id != user.id
        and not user.has_perm("order.edit.others")
    ):
        raise HTTPException(403, "forbidden")

    data = body.model_dump(exclude_unset=True)
    service_ids = data.pop("service_ids", None)
    cf = data.pop("custom_fields", None)
    if "title" in data:
        data["title"] = data["title"].strip() or order.title

    # order.rename — faqat nom/vrach/patsent; boshqa maydonlar order.edit talab qiladi
    rename_only = {"title", "doctor_id", "patient_id"}
    if not (user.is_super or user.has_perm("order.edit")):
        forbidden = set(data) - rename_only
        if forbidden or service_ids is not None:
            raise HTTPException(403, {"error": "forbidden", "fields": sorted(forbidden)})

    changes = {k: {"from": str(getattr(order, k)), "to": str(v)} for k, v in data.items()}
    for k, v in data.items():
        setattr(order, k, v)

    # Dedlayn o'zgartirilsa — eski ogohlantirish belgisi bekor qilinadi, aks holda yangi
    # (yaqinroq yoki uzoqroq) dedlayn o'tganda ham 24 soatlik "reminder_hours" cooldown
    # eski bildirishnoma vaqtidan hisoblanib, yangi ogohlantirish jim yuborilmay qolardi.
    if "deadline" in data:
        order.deadline_overdue_notified_at = None

    if service_ids is not None:
        res = await db.execute(select(Service).where(Service.id.in_(service_ids)))
        old = [s.name_ru for s in order.services]
        order.services = list(res.scalars().all())
        changes["services"] = {"from": old, "to": [s.name_ru for s in order.services]}

    if cf:
        changes.update(await set_values(db, "order", order.id, cf))

    await log_activity(
        db, action="order.updated", category=LogCategory.ORDER, actor=user,
        order_id=order.id, entity="order", entity_id=order.id,
        message_ru=f"Изменён проект {order.number}",
        message_uz=f"Proyekt o'zgartirildi: {order.number}",
        meta=changes, request=request,
    )
    await db.commit()
    await db.refresh(order)

    if "title" in data or "doctor_id" in data or "patient_id" in data:
        await notify(db, NotifyEvent.ORDER_RENAMED, order=order, actor=user)
        await db.commit()

    await svc.broadcast_order(order, "order.updated", {})

    detail = OrderDetail.model_validate(order)
    detail.custom_fields = await get_values(db, "order", order.id)
    return await _decorate(db, detail, order, user)


@router.delete("/{order_id}", response_model=Msg)
async def delete_order(
    order_id: int,
    request: Request,
    db: DbDep,
    actor: Annotated[User, Depends(require("order.delete"))],
):
    res = await db.execute(select(Order).where(Order.id == order_id))
    order = res.scalar_one_or_none()
    if order is None or order.deleted_at is not None:
        raise HTTPException(404, "order_not_found")

    number, title = order.number, order.title
    order.deleted_at = now_utc()
    await log_activity(
        db, action="order.deleted", category=LogCategory.ORDER, actor=actor,
        entity="order", entity_id=order_id,
        message_ru=f"Проект {number} «{title}» помещён в корзину",
        message_uz=f"Proyekt {number} «{title}» savatga tashlandi",
        request=request,
    )
    await db.commit()
    from app.realtime.hub import hub

    await hub.publish("kanban", "order.deleted", {"id": order_id})
    return Msg(detail="deleted")


@router.post("/{order_id}/restore", response_model=Msg)
async def restore_order(
    order_id: int,
    request: Request,
    db: DbDep,
    actor: Annotated[User, Depends(require("order.delete"))],
):
    res = await db.execute(select(Order).where(Order.id == order_id))
    order = res.scalar_one_or_none()
    if order is None or order.deleted_at is None:
        raise HTTPException(404, "order_not_found")

    number, title = order.number, order.title
    order.deleted_at = None
    await log_activity(
        db, action="order.restored", category=LogCategory.ORDER, actor=actor,
        entity="order", entity_id=order_id,
        message_ru=f"Проект {number} «{title}» восстановлен из корзины",
        message_uz=f"Proyekt {number} «{title}» savatdan tiklandi",
        request=request,
    )
    await db.commit()
    from app.realtime.hub import hub

    await hub.publish("kanban", "order.created", {"id": order_id})
    return Msg(detail="restored")


@router.get("/trash/list", response_model=list[OrderCard])
async def trash_orders(
    db: DbDep,
    user: CurrentUser,
):
    """Korzinkadagi o'chirilgan proyektlar (30 kungacha)."""
    query = select(Order).where(
        Order.deleted_at.is_not(None),
        Order.deleted_at > now_utc() - timedelta(days=30),
    )
    query = _visibility_filter(query, user)
    query = query.order_by(Order.deleted_at.desc())
    res = await db.execute(query)
    return await _cards(db, list(res.scalars().all()), user)


# --------------------------------------------------------------------------
# Kanban harakatlari
# --------------------------------------------------------------------------


@router.get("/{order_id}/prev-stage", response_model=StageOut | None)
async def order_prev_stage(order_id: int, db: DbDep, user: CurrentUser):
    """«Вернуть назад» uchun: proyekt haqiqatda oldin qaysi bosqichda bo'lganini
    marshrut tarixidan qaytaradi (statik katalog tartibi emas)."""
    order = await _get_order(db, order_id, user)
    stage = await svc.previous_stage(db, order)
    return StageOut.model_validate(stage) if stage else None


@router.post("/{order_id}/move", response_model=OrderDetail)
async def move_order(
    order_id: int,
    body: OrderMove,
    request: Request,
    db: DbDep,
    user: CurrentUser,
):
    """Kartani boshqa bosqichga surish (drag&drop yoki tugma)."""
    order = await _get_order(db, order_id, user)

    to_stage = await svc.get_stage(db, body.stage_id)
    if not to_stage.is_active:
        raise HTTPException(400, "stage_inactive")

    from_stage_id = order.stage_id
    is_backward = to_stage.sort < order.stage.sort
    allowed = svc.can_move_back(user, order) if is_backward else svc.can_move(user, order)
    if allowed:
        allowed = await svc.stage_access_allowed(db, user, to_stage)
    if allowed:
        allowed = await svc.transition_allowed(db, user, from_stage_id, to_stage.id)
    if allowed:
        allowed = await svc.incoming_allowed(db, user, from_stage_id, to_stage.id)

    if not allowed:
        await log_activity(
            db, action="order.stage_changed", category=LogCategory.ORDER, is_success=False,
            actor=user, order_id=order.id,
            message_ru="Нет прав двигать этот проект",
            message_uz="Bu proyektni surishga huquq yo'q",
            request=request, commit=True,
        )
        raise HTTPException(403, "forbidden")

    # Shu surishning o'zida kelgan qiymatlarni avval yozamiz —
    # majburiy maydon modali shu tarzda to'ldiradi.
    payload: dict = dict(body.fields or {})
    if body.custom_fields:
        payload["custom_fields"] = body.custom_fields
    if body.next_responsible_id:
        payload["responsible_id"] = body.next_responsible_id

    try:
        await req_svc.validate_move(db, order, from_stage_id, to_stage.id, payload)
    except req_svc.RequirementError as e:
        await log_activity(
            db, action="order.stage_changed", category=LogCategory.ORDER, is_success=False,
            actor=user, order_id=order.id,
            message_ru=f"Переход на «{to_stage.name_ru}» отклонён: не заполнены обязательные поля",
            message_uz=f"«{to_stage.name_uz}» ga o'tish rad etildi: majburiy maydonlar bo'sh",
            meta=e.to_detail(), request=request, commit=True,
        )
        raise HTTPException(422, detail=e.to_detail()) from e

    # Bosqich «keyingi mas'ulni majburiy tanlash» rejimida bo'lsa
    if (
        to_stage.require_next_assignee
        and not body.next_responsible_id
        and to_stage.kind == StageKind.WORK
    ):
        raise HTTPException(
            422,
            detail={
                "error": "next_assignee_required",
                "stage_id": to_stage.id,
                "message_ru": f"Выберите, кто будет делать этап «{to_stage.name_ru}»",
                "message_uz": f"«{to_stage.name_uz}» bosqichini kim qilishini tanlang",
            },
        )

    # tizim maydonlarini yozamiz
    sys_fields = {
        k: v for k, v in (body.fields or {}).items()
        if k in {"title", "patient_id", "doctor_id", "deadline", "description", "priority"}
    }
    for k, v in sys_fields.items():
        if k == "deadline" and isinstance(v, str):
            try:
                v = datetime.fromisoformat(v)
            except ValueError:
                raise HTTPException(422, "bad_deadline") from None
        setattr(order, k, v)
    if body.custom_fields:
        await set_values(db, "order", order.id, body.custom_fields)

    if body.next_responsible_id:
        res = await db.execute(
            select(User).where(User.id == body.next_responsible_id, User.is_active.is_(True))
        )
        target = res.scalar_one_or_none()
        if target is None:
            raise HTTPException(404, "user_not_found")
        if not svc.can_user_work_stage(target, to_stage):
            raise HTTPException(
                422,
                detail={
                    "error": "user_cannot_work_stage",
                    "message_ru": f"{target.full_name} не назначен на этап «{to_stage.name_ru}»",
                    "message_uz": f"{target.full_name} «{to_stage.name_uz}» bosqichiga biriktirilmagan",
                },
            )

    if body.sort is not None:
        order.sort = body.sort

    await svc.move_to_stage(
        db,
        order=order,
        to_stage=to_stage,
        actor=user,
        next_responsible_id=body.next_responsible_id,
        comment=body.comment,
        request=request,
    )
    await db.commit()
    await db.refresh(order)

    detail = OrderDetail.model_validate(order)
    detail.custom_fields = await get_values(db, "order", order.id)
    return await _decorate(db, detail, order, user)


@router.post("/{order_id}/pause", response_model=OrderDetail)
async def pause_order(order_id: int, body: OrderPause, request: Request, db: DbDep, user: CurrentUser):
    """Ishni pauza qilish — sababi majburiy, bosqich dedlayni to'xtaydi."""
    order = await _get_order(db, order_id, user)
    if not svc.can_move(user, order):
        raise HTTPException(403, "forbidden")
    await svc.pause(db, order, user, body.reason, request)
    await db.commit()
    await db.refresh(order)

    detail = OrderDetail.model_validate(order)
    detail.custom_fields = await get_values(db, "order", order.id)
    return await _decorate(db, detail, order, user)


@router.post("/{order_id}/resume", response_model=OrderDetail)
async def resume_order(order_id: int, request: Request, db: DbDep, user: CurrentUser):
    """Pauzadan chiqarish — faqat pauzani qo'ygan xodim yoki admin."""
    order = await _get_order(db, order_id, user)
    await svc.resume(db, order, user, request)
    await db.commit()
    await db.refresh(order)

    detail = OrderDetail.model_validate(order)
    detail.custom_fields = await get_values(db, "order", order.id)
    return await _decorate(db, detail, order, user)


@router.post("/{order_id}/claim", response_model=OrderDetail)
async def claim_order(order_id: int, request: Request, db: DbDep, user: CurrentUser):
    """«Beru» / «Olaman» — texnik proyektni o'ziga oladi."""
    order = await _get_order(db, order_id, user)
    await svc.claim(db, order, user, request)
    await db.commit()
    await db.refresh(order)

    detail = OrderDetail.model_validate(order)
    detail.custom_fields = await get_values(db, "order", order.id)
    return await _decorate(db, detail, order, user)


@router.post("/{order_id}/files/read", response_model=Msg)
async def mark_files_read(order_id: int, db: DbDep, user: CurrentUser):
    """Fayllar tabini ochganda chaqiriladi — shu foydalanuvchi uchun "yangi fayl" hisoblagichini nolga tushiradi."""
    order = await _get_order(db, order_id, user)
    now = now_utc()

    res = await db.execute(
        select(OrderFileRead).where(
            OrderFileRead.order_id == order.id, OrderFileRead.user_id == user.id
        )
    )
    row = res.scalar_one_or_none()
    if row is None:
        db.add(OrderFileRead(order_id=order.id, user_id=user.id, last_read_at=now))
    else:
        row.last_read_at = now
    await db.commit()

    from app.realtime.hub import hub

    await hub.publish(f"user:{user.id}", "order.files_read", {"order_id": order.id})
    return Msg(detail="ok")


@router.post("/{order_id}/assign", response_model=OrderDetail)
async def assign_order(
    order_id: int, body: OrderAssign, request: Request, db: DbDep, user: CurrentUser
):
    """HR/admin mas'ulni belgilaydi yoki bo'shatadi (user_id: null)."""
    order = await _get_order(db, order_id, user)
    await svc.assign(db, order, body.user_id, user, request)
    await db.commit()
    await db.refresh(order)

    detail = OrderDetail.model_validate(order)
    detail.custom_fields = await get_values(db, "order", order.id)
    return await _decorate(db, detail, order, user)


@router.get("/{order_id}/available-assignees", response_model=list[dict])
async def available_assignees(
    order_id: int, db: DbDep, user: CurrentUser, stage_id: int | None = None
):
    """Berilgan bosqichni bajara oladigan texniklar — «kim qiladi?» tanlovi uchun."""
    order = await _get_order(db, order_id, user)
    target_stage_id = stage_id or order.stage_id

    res = await db.execute(
        select(User)
        .where(User.is_active.is_(True), User.stages.any(Stage.id == target_stage_id))
        .order_by(User.full_name)
    )
    users = list(res.scalars().all())

    # har birining joriy yuki (nechta ochiq proyekt)
    load_res = await db.execute(
        select(Order.responsible_id, func.count(Order.id))
        .where(Order.is_closed.is_(False), Order.responsible_id.in_([u.id for u in users] or [0]))
        .group_by(Order.responsible_id)
    )
    load = dict(load_res.all())

    return [
        {
            "id": u.id,
            "full_name": u.full_name,
            "avatar": u.avatar,
            "active_orders": load.get(u.id, 0),
        }
        for u in users
    ]
