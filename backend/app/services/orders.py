"""Proyekt (zakaz) mantiqi: raqam, bosqich almashish, marshrut tarixi, claim."""

from datetime import timedelta

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import now_utc
from app.models import (
    Chat,
    ChatMember,
    ChatType,
    LogCategory,
    LogLevel,
    Message,
    NotifyEvent,
    Order,
    OrderStageHistory,
    Stage,
    StageKind,
    User,
)
from app.realtime.hub import hub
from app.services import notify as notify_svc
from app.services import workcalendar
from app.services.logger import log_activity
from app.services.settings_store import get_setting


# --------------------------------------------------------------------------
# Raqam
# --------------------------------------------------------------------------


async def next_number(db: AsyncSession) -> str:
    prefix = await get_setting(db, "order_number_prefix", "OM-")
    padding = int(await get_setting(db, "order_number_padding", 6))
    res = await db.execute(select(func.count(Order.id)))
    seq = (res.scalar() or 0) + 1
    # takrorlanmasligini kafolatlash (o'chirilgan proyektlar bo'lsa)
    while True:
        candidate = f"{prefix}{str(seq).zfill(padding)}"
        exists = await db.execute(select(Order.id).where(Order.number == candidate))
        if exists.scalar_one_or_none() is None:
            return candidate
        seq += 1


# --------------------------------------------------------------------------
# Bosqichlar
# --------------------------------------------------------------------------


async def get_stage(db: AsyncSession, stage_id: int) -> Stage:
    res = await db.execute(select(Stage).where(Stage.id == stage_id))
    stage = res.scalar_one_or_none()
    if stage is None:
        raise HTTPException(404, "stage_not_found")
    return stage


async def first_stage(db: AsyncSession) -> Stage:
    """Proyekt yaratiladigan bosqich = «Новый»."""
    res = await db.execute(
        select(Stage).where(Stage.kind == StageKind.NEW, Stage.is_active.is_(True))
    )
    stage = res.scalars().first()
    if stage is None:
        raise HTTPException(500, "stage_new_missing")
    return stage


async def active_stages(db: AsyncSession) -> list[Stage]:
    res = await db.execute(
        select(Stage).where(Stage.is_active.is_(True)).order_by(Stage.sort, Stage.id)
    )
    return list(res.scalars().all())


def can_user_work_stage(user: User, stage: Stage) -> bool:
    """Texnik shu bosqichni bajara oladimi."""
    if user.is_super or user.has_perm("order.move.any"):
        return True
    return any(s.id == stage.id for s in (user.stages or []))


def can_move(user: User, order: Order) -> bool:
    if user.is_super or user.has_perm("order.move.any"):
        return True
    if user.has_perm("order.move.own"):
        return order.responsible_id == user.id
    return False


# --------------------------------------------------------------------------
# Marshrut tarixi
# --------------------------------------------------------------------------


async def open_history(
    db: AsyncSession, order: Order, moved_by: User | None
) -> OrderStageHistory:
    row = OrderStageHistory(
        order_id=order.id,
        stage_id=order.stage_id,
        responsible_id=order.responsible_id,
        moved_by_id=moved_by.id if moved_by else None,
        entered_at=now_utc(),
    )
    db.add(row)
    await db.flush()
    return row


async def close_history(db: AsyncSession, order: Order, comment: str | None = None) -> None:
    res = await db.execute(
        select(OrderStageHistory)
        .where(OrderStageHistory.order_id == order.id, OrderStageHistory.left_at.is_(None))
        .order_by(OrderStageHistory.entered_at.desc())
    )
    row = res.scalars().first()
    if row is None:
        return
    now = now_utc()
    row.left_at = now
    row.duration_sec = int((now - row.entered_at).total_seconds())
    row.responsible_id = order.responsible_id  # kim yakunda ishlagan bo'lsa
    if order.stage_deadline:
        row.was_overdue = now > order.stage_deadline
        row.remaining_seconds = int((order.stage_deadline - now).total_seconds())
    if comment:
        row.comment = comment
    await db.flush()


async def apply_stage_deadline(
    db: AsyncSession, order: Order, stage: Stage, *, from_stage: Stage | None = None
) -> None:
    order.stage_entered_at = now_utc()
    if not stage.duration_hours:
        order.stage_deadline = None
        return

    # Orqaga (oldingi bosqichga) qaytarilganda — dedlaynni qaytadan to'liq boshlash
    # o'rniga, o'sha bosqichda oxirgi marta turganda qancha vaqt qolgan bo'lsa, o'shani tiklaymiz.
    if from_stage is not None and stage.sort < from_stage.sort:
        res = await db.execute(
            select(OrderStageHistory.remaining_seconds)
            .where(
                OrderStageHistory.order_id == order.id,
                OrderStageHistory.stage_id == stage.id,
                OrderStageHistory.left_at.is_not(None),
                OrderStageHistory.remaining_seconds.is_not(None),
            )
            .order_by(OrderStageHistory.left_at.desc())
            .limit(1)
        )
        remaining = res.scalar_one_or_none()
        if remaining is not None:
            order.stage_deadline = order.stage_entered_at + timedelta(seconds=max(0, remaining))
            return

    cal = await workcalendar.load_calendar(db)
    if cal.enabled:
        order.stage_deadline = workcalendar.add_business_hours(
            order.stage_entered_at, stage.duration_hours, cal
        )
    else:
        order.stage_deadline = order.stage_entered_at + timedelta(hours=stage.duration_hours)


# --------------------------------------------------------------------------
# Chat
# --------------------------------------------------------------------------


async def ensure_order_chat(db: AsyncSession, order: Order, creator_id: int | None) -> Chat:
    res = await db.execute(select(Chat).where(Chat.order_id == order.id))
    chat = res.scalar_one_or_none()
    if chat is None:
        chat = Chat(type=ChatType.ORDER, order_id=order.id, title=order.number)
        db.add(chat)
        await db.flush()
    if creator_id:
        await add_chat_member(db, chat, creator_id)
    return chat


async def add_chat_member(db: AsyncSession, chat: Chat, user_id: int) -> None:
    res = await db.execute(
        select(ChatMember).where(ChatMember.chat_id == chat.id, ChatMember.user_id == user_id)
    )
    if res.scalar_one_or_none() is None:
        db.add(ChatMember(chat_id=chat.id, user_id=user_id, joined_at=now_utc()))
        await db.flush()


async def hide_order_chat(db: AsyncSession, order: Order) -> None:
    """Proyekt muvaffaqiyatli yakunlanganda uning chatini barcha a'zolarda avtomatik yashiradi."""
    res = await db.execute(select(Chat.id).where(Chat.order_id == order.id))
    chat_id = res.scalar_one_or_none()
    if chat_id is None:
        return
    res = await db.execute(select(ChatMember).where(ChatMember.chat_id == chat_id))
    for member in res.scalars().all():
        member.hidden = True


async def system_message(db: AsyncSession, order: Order, text: str, actor_id: int | None = None) -> None:
    """Proyekt chatiga kulrang tizim qatorchasi."""
    res = await db.execute(select(Chat).where(Chat.order_id == order.id))
    chat = res.scalar_one_or_none()
    if chat is None:
        return
    msg = Message(chat_id=chat.id, text=text, is_system=True, created_at=now_utc())
    db.add(msg)
    chat.last_message_at = msg.created_at
    await db.flush()
    payload = {
        "id": msg.id,
        "chat_id": chat.id,
        "order_id": chat.order_id,
        "text": msg.text,
        "is_system": True,
        "author": None,
        "created_at": msg.created_at.isoformat(),
    }
    await hub.publish(f"chat:{chat.id}", "chat.message", payload)
    res_m = await db.execute(select(ChatMember).where(ChatMember.chat_id == chat.id))
    for member in res_m.scalars().all():
        if actor_id is not None and member.user_id == actor_id:
            member.last_read_message_id = msg.id
        await hub.publish(f"user:{member.user_id}", "chat.message", payload)


# --------------------------------------------------------------------------
# Asosiy: bosqichni almashtirish
# --------------------------------------------------------------------------


async def move_to_stage(
    db: AsyncSession,
    *,
    order: Order,
    to_stage: Stage,
    actor: User,
    next_responsible_id: int | None = None,
    comment: str | None = None,
    request=None,  # noqa: ANN001
) -> Order:
    """Proyektni yangi bosqichga o'tkazadi.

    Majburiy maydonlar tekshiruvi bu funksiyadan OLDIN (endpointda) qilinadi —
    chunki u yerda foydalanuvchi yuborgan payload ham hisobga olinadi.
    """
    from_stage = order.stage
    prev_responsible_id = order.responsible_id

    if from_stage.id == to_stage.id:
        return order

    await close_history(db, order, comment)

    order.stage_id = to_stage.id
    order.stage = to_stage
    await apply_stage_deadline(db, order, to_stage, from_stage=from_stage)

    # Yangi bosqich mas'uli:
    #  1) chaqiruvda aniq berilgan bo'lsa — o'sha
    #  2) bo'lmasa — bo'sh (texnik «Olaman» tugmasi bilan oladi yoki HR biriktiradi)
    if next_responsible_id:
        order.responsible_id = next_responsible_id
    else:
        order.responsible_id = None

    if to_stage.kind == StageKind.SUCCESS:
        order.is_closed = True
        order.closed_at = now_utc()
        order.close_reason = None
        await hide_order_chat(db, order)
    elif to_stage.kind == StageKind.FAIL:
        order.is_closed = True
        order.closed_at = now_utc()
        order.close_reason = comment
    else:
        order.is_closed = False
        order.closed_at = None

    await open_history(db, order, actor)
    await db.flush()
    await db.refresh(order, ["responsible", "stage"])

    await log_activity(
        db,
        action="order.stage_changed",
        category=LogCategory.ORDER,
        actor=actor,
        order_id=order.id,
        entity="order",
        entity_id=order.id,
        message_ru=f"Этап: {from_stage.name_ru} → {to_stage.name_ru}",
        message_uz=f"Bosqich: {from_stage.name_uz} → {to_stage.name_uz}",
        meta={
            "from": {"id": from_stage.id, "name": from_stage.name_ru},
            "to": {"id": to_stage.id, "name": to_stage.name_ru},
            "responsible": order.responsible_id,
            "comment": comment,
        },
        request=request,
    )

    await system_message(
        db,
        order,
        f"Этап: {from_stage.name_ru} → {to_stage.name_ru}"
        + (f" · {order.responsible.full_name}" if order.responsible else "")
        + (f"\n{comment}" if comment else ""),
        actor_id=actor.id,
    )

    if order.responsible_id:
        res = await db.execute(select(Chat).where(Chat.order_id == order.id))
        chat = res.scalar_one_or_none()
        if chat:
            await add_chat_member(db, chat, order.responsible_id)

    event = {
        StageKind.SUCCESS: NotifyEvent.ORDER_SUCCESS,
        StageKind.FAIL: NotifyEvent.ORDER_FAIL,
    }.get(to_stage.kind, NotifyEvent.ORDER_STAGE_CHANGED)

    await notify_svc.notify(
        db,
        event,
        order=order,
        actor=actor,
        stage_id=to_stage.id,
        prev_responsible_id=prev_responsible_id,
        ctx={"stage_prev": from_stage.name_ru, "comment": comment or "—"},
    )

    await broadcast_order(order, "order.moved", {"from_stage_id": from_stage.id})
    return order


async def claim(db: AsyncSession, order: Order, user: User, request=None) -> Order:  # noqa: ANN001
    """Texnik proyektni o'ziga oladi."""
    if not (user.has_perm("order.claim") or user.is_super):
        raise HTTPException(403, "forbidden")
    if not await get_setting(db, "claim_enabled", True) and not user.is_super:
        raise HTTPException(403, "claim_disabled")
    if not order.stage.allow_claim and not user.is_super:
        raise HTTPException(400, "claim_not_allowed_on_stage")
    if order.responsible_id is not None:
        raise HTTPException(409, "already_taken")
    if not can_user_work_stage(user, order.stage):
        raise HTTPException(403, "stage_not_allowed_for_user")

    order.responsible_id = user.id
    await db.flush()
    await db.refresh(order, ["responsible"])

    res = await db.execute(select(Chat).where(Chat.order_id == order.id))
    chat = res.scalar_one_or_none()
    if chat:
        await add_chat_member(db, chat, user.id)

    await log_activity(
        db,
        action="order.claimed",
        category=LogCategory.ORDER,
        actor=user,
        order_id=order.id,
        entity="order",
        entity_id=order.id,
        message_ru=f"{user.full_name} взял проект на этапе {order.stage.name_ru}",
        message_uz=f"{user.full_name} proyektni {order.stage.name_uz} bosqichida oldi",
        request=request,
    )
    await system_message(db, order, f"{user.full_name} взял проект в работу", actor_id=user.id)
    await notify_svc.notify(
        db, NotifyEvent.ORDER_CLAIMED, order=order, actor=user, stage_id=order.stage_id
    )
    await broadcast_order(order, "order.updated", {})
    return order


async def assign(
    db: AsyncSession, order: Order, user_id: int | None, actor: User, request=None  # noqa: ANN001
) -> Order:
    """HR/admin mas'ulni belgilaydi yoki olib tashlaydi (user_id=None)."""
    if not (actor.has_perm("order.assign.any") or actor.is_super):
        raise HTTPException(403, "forbidden")

    old_id = order.responsible_id
    if user_id is not None:
        res = await db.execute(select(User).where(User.id == user_id, User.is_active.is_(True)))
        target = res.scalar_one_or_none()
        if target is None:
            raise HTTPException(404, "user_not_found")
        order.responsible_id = target.id
    else:
        order.responsible_id = None

    await db.flush()
    await db.refresh(order, ["responsible"])

    if order.responsible_id:
        res = await db.execute(select(Chat).where(Chat.order_id == order.id))
        chat = res.scalar_one_or_none()
        if chat:
            await add_chat_member(db, chat, order.responsible_id)

    name = order.responsible.full_name if order.responsible else "—"
    await log_activity(
        db,
        action="order.assigned" if user_id else "order.unassigned",
        category=LogCategory.ORDER,
        actor=actor,
        order_id=order.id,
        entity="order",
        entity_id=order.id,
        message_ru=f"Ответственный: {name}",
        message_uz=f"Mas'ul: {name}",
        meta={"from": old_id, "to": order.responsible_id},
        request=request,
    )
    await system_message(db, order, f"Ответственный: {name}", actor_id=actor.id)
    await notify_svc.notify(
        db,
        NotifyEvent.ORDER_ASSIGNED if user_id else NotifyEvent.ORDER_UNASSIGNED,
        order=order,
        actor=actor,
        stage_id=order.stage_id,
        prev_responsible_id=old_id,
    )
    await broadcast_order(order, "order.updated", {})
    return order


# --------------------------------------------------------------------------
# Real-time
# --------------------------------------------------------------------------


async def broadcast_order(order: Order, event: str, extra: dict) -> None:
    payload = {
        "id": order.id,
        "number": order.number,
        "title": order.title,
        "stage_id": order.stage_id,
        "responsible_id": order.responsible_id,
        "responsible_name": order.responsible.full_name if order.responsible else None,
        "is_closed": order.is_closed,
        "deadline": order.deadline.isoformat() if order.deadline else None,
        "stage_deadline": order.stage_deadline.isoformat() if order.stage_deadline else None,
        "priority": order.priority,
        **extra,
    }
    await hub.publish("kanban", event, payload)
    await hub.publish(f"order:{order.id}", event, payload)


async def check_overdue(db: AsyncSession) -> int:
    """Fon vazifasi: dedlayni o'tgan proyektlar bo'yicha (takrorlanuvchi) ogohlantirish."""
    now = now_utc()
    reminder_hours = float(await get_setting(db, "overdue_reminder_hours", 24))
    # Mas'ul biriktirilmagan yoki HR yo'q bo'lsa ham, hech kim bildirishnomasiz qolmasin.
    fallback_ids = await notify_svc.resolve_recipients(db, ["role:hr", "role:super_admin"])

    res = await db.execute(
        select(Order).where(
            Order.is_closed.is_(False),
            Order.deleted_at.is_(None),
            Order.stage_deadline.is_not(None),
            Order.stage_deadline < now,
        )
    )
    orders = list(res.scalars().all())
    count = 0
    for order in orders:
        h = await db.execute(
            select(OrderStageHistory)
            .where(OrderStageHistory.order_id == order.id, OrderStageHistory.left_at.is_(None))
            .order_by(OrderStageHistory.entered_at.desc())
        )
        row = h.scalars().first()
        if row is None:
            continue
        if row.overdue_notified_at is not None and (
            now - row.overdue_notified_at < timedelta(hours=reminder_hours)
        ):
            continue

        row.was_overdue = True
        row.overdue_notified_at = now
        await notify_svc.notify(
            db, NotifyEvent.ORDER_OVERDUE, order=order, stage_id=order.stage_id,
            extra_user_ids=list(fallback_ids),
        )
        await log_activity(
            db,
            action="order.overdue",
            category=LogCategory.ORDER,
            level=LogLevel.WARNING,
            is_success=False,
            order_id=order.id,
            message_ru=f"Просрочен дедлайн этапа {order.stage.name_ru}",
            message_uz=f"{order.stage.name_uz} bosqichi dedlayni o'tdi",
        )
        count += 1
    await db.commit()
    return count


async def check_deadline_overdue(db: AsyncSession) -> int:
    """Fon vazifasi: proyektning UMUMIY dedlayni (stage_deadline emas) o'tganda adminga (takrorlanuvchi) ogohlantirish."""
    now = now_utc()
    reminder_hours = float(await get_setting(db, "order_deadline_reminder_hours", 24))

    res = await db.execute(
        select(Order).where(
            Order.is_closed.is_(False),
            Order.deleted_at.is_(None),
            Order.deadline.is_not(None),
            Order.deadline < now,
        )
    )
    orders = list(res.scalars().all())
    count = 0
    for order in orders:
        if order.deadline_overdue_notified_at is not None and (
            now - order.deadline_overdue_notified_at < timedelta(hours=reminder_hours)
        ):
            continue

        order.deadline_overdue_notified_at = now
        await notify_svc.notify(db, NotifyEvent.ORDER_DEADLINE_OVERDUE, order=order, stage_id=order.stage_id)
        await log_activity(
            db,
            action="order.deadline_overdue",
            category=LogCategory.ORDER,
            level=LogLevel.WARNING,
            is_success=False,
            order_id=order.id,
            message_ru=f"Просрочен общий дедлайн проекта {order.number}",
            message_uz=f"{order.number} proyektining umumiy dedlayni o'tdi",
        )
        count += 1
    await db.commit()
    return count
