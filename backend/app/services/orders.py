"""Proyekt (zakaz) mantiqi: raqam, bosqich almashish, marshrut tarixi, claim."""

from datetime import datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import distinct, func, select
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
    role_move_stages,
    stage_transitions,
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


def can_move_back(user: User, order: Order) -> bool:
    """Orqaga qaytarish — joriy bosqichni bajara oladigan har qanday texnikka ochiq,
    proyekt o'ziga tayinlangan bo'lishi shart emas. Lekin agar proyekt BOSHQA odamga
    tayinlangan bo'lsa, alohida `order.move_back.others` huquqi kerak."""
    if user.is_super or user.has_perm("order.move.any"):
        return True
    if not can_user_work_stage(user, order.stage):
        return False
    if order.responsible_id is not None and order.responsible_id != user.id:
        return user.has_perm("order.move_back.others")
    return True


async def stage_access_allowed(db: AsyncSession, user: User, to_stage: Stage) -> bool:
    """Bosqichga o'tkazish rol bo'yicha cheklanganmi — «Роли и права» dagi sozlamadan.

    Agar bosqich uchun birorta ham rolga ruxsat berilmagan bo'lsa — cheklovsiz
    (hammaga ochiq). Birorta rol berilgan bo'lsa — faqat o'sha rol(lar)dagi
    foydalanuvchilar shu bosqichga o'tkaza oladi (super_admin va order.move.any
    bundan mustasno)."""
    if user.is_super or user.has_perm("order.move.any"):
        return True
    res = await db.execute(
        select(role_move_stages.c.role_id).where(role_move_stages.c.stage_id == to_stage.id)
    )
    allowed_role_ids = {row[0] for row in res.all()}
    if not allowed_role_ids:
        return True
    return user.role_id in allowed_role_ids


async def transition_allowed(db: AsyncSession, user: User, from_stage_id: int, to_stage_id: int) -> bool:
    """Bosqichdan-bosqichga o'tish «Этапы и канбан» dagi sozlamadan cheklanganmi.

    Agar `from_stage_id`dan hech qanday nishon bosqich sozlanmagan bo'lsa —
    cheklovsiz (istalgan bosqichga o'tish mumkin, hozirgidek). Sozlangan bo'lsa —
    faqat ko'rsatilgan nishon bosqichlarga o'tish mumkin (super_admin va
    order.move.any bundan mustasno)."""
    if user.is_super or user.has_perm("order.move.any"):
        return True
    res = await db.execute(
        select(stage_transitions.c.to_stage_id).where(
            stage_transitions.c.from_stage_id == from_stage_id
        )
    )
    allowed_ids = {row[0] for row in res.all()}
    if not allowed_ids:
        return True
    return to_stage_id in allowed_ids


def can_edit(user: User, order: Order) -> bool:
    """Proyekt maydonlarini tahrirlash. Agar boshqa odamga tayinlangan bo'lsa,
    alohida `order.edit.others` huquqi kerak."""
    if user.is_super or not user.has_perm("order.edit"):
        return user.is_super
    if order.responsible_id is not None and order.responsible_id != user.id:
        return user.has_perm("order.edit.others")
    return True


# --------------------------------------------------------------------------
# Bosqich dedlayni (ish kalendari bilan)
# --------------------------------------------------------------------------


async def remaining_stage_seconds(db: AsyncSession, now: datetime, deadline: datetime) -> int:
    """Dedlayngacha qolgan vaqt sekundlarda; manfiy bo'lsa — kechikish.

    Ish kalendari yoqilgan bo'lsa faqat ish vaqti sanaladi — ya'ni pauza yoki
    orqaga qaytarish paytida «qolgan vaqt» dam kunlari va tunlarni o'z ichiga olmaydi.
    """
    cal = await workcalendar.load_calendar(db)
    if cal.enabled:
        return workcalendar.business_seconds_between(now, deadline, cal)
    return int((deadline - now).total_seconds())


async def deadline_after(db: AsyncSession, start: datetime, seconds: float) -> datetime:
    """`start`dan `seconds` o'tgach keladigan dedlayn.

    Kalendar yoqilgan bo'lsa vaqt faqat ish kunlari/soatlarida «ketadi».
    """
    cal = await workcalendar.load_calendar(db)
    return workcalendar.shift_deadline(start, seconds, cal)


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
        row.remaining_seconds = await remaining_stage_seconds(db, now, order.stage_deadline)
    elif order.stage_deadline_frozen_remaining_sec is not None:
        # Pauzada turganda boshqa bosqichga ko'chirildi — muzlatilgan qoldiq yo'qolmasin
        row.remaining_seconds = order.stage_deadline_frozen_remaining_sec
        row.was_overdue = order.stage_deadline_frozen_remaining_sec < 0
    if comment:
        row.comment = comment
    await db.flush()


async def previous_stage(db: AsyncSession, order: Order) -> Stage | None:
    """«Вернуть назад» uchun nishon bosqichni marshrut tarixidan (OrderStageHistory)
    topadi — statik katalog tartibi emas, haqiqiy o'tilgan yo'l bo'yicha.

    Oddiy «oxirgi yopilgan yozuv» — orqaga qaytarilgan zahoti o'ziga yangi yozuv
    ochib qo'yadi va keyingi «orqaga» bosilganda o'sha yozuvni «oldingi» deb olib,
    ikki bosqich orasida abadiy pinpong qiladi. Shuning uchun butun tarix
    xronologik tartibda qayta o'ynatiladi va oddiy undo-stek simulyatsiya qilinadi:
    har bir o'tish oldingi bosqichni stekka qo'shadi, agar u stek tepasidagi
    bosqichga qaytish bo'lsa — stekdan olib tashlaydi. Natijada «orqaga» tugmasi
    orqaga ketma-ket bosilganda haqiqiy yo'l bo'ylab izchil orqaga qaytaveradi."""
    res = await db.execute(
        select(OrderStageHistory.stage_id)
        .where(OrderStageHistory.order_id == order.id)
        .order_by(OrderStageHistory.entered_at.asc())
    )
    seq = [row[0] for row in res.all()]
    if len(seq) < 2:
        return None

    stack: list[int] = []
    for i in range(1, len(seq)):
        prev_id, curr_id = seq[i - 1], seq[i]
        if stack and stack[-1] == curr_id:
            stack.pop()
        else:
            stack.append(prev_id)

    if not stack:
        return None
    return await get_stage(db, stack[-1])


async def last_responsible_at_stage(
    db: AsyncSession, order: Order, stage_id: int
) -> int | None:
    """Orqaga qaytarilgan bosqichda oxirgi marta kim mas'ul bo'lganini qaytaradi."""
    res = await db.execute(
        select(OrderStageHistory.responsible_id)
        .where(
            OrderStageHistory.order_id == order.id,
            OrderStageHistory.stage_id == stage_id,
            OrderStageHistory.left_at.is_not(None),
            OrderStageHistory.responsible_id.is_not(None),
        )
        .order_by(OrderStageHistory.left_at.desc())
        .limit(1)
    )
    return res.scalar_one_or_none()


async def skipped_stage_workers(
    db: AsyncSession, order: Order, from_stage: Stage, to_stage: Stage
) -> list[int]:
    """Orqaga qaytarilganda o'tib ketilgan bosqichlar (to_stage va from_stage oralig'i,
    to_stage ham kiradi) da oxirgi marta kim mas'ul bo'lganini qaytaradi."""
    res = await db.execute(
        select(Stage.id).where(Stage.sort >= to_stage.sort, Stage.sort < from_stage.sort)
    )
    stage_ids = list(res.scalars().all())
    if not stage_ids:
        return []

    res = await db.execute(
        select(distinct(OrderStageHistory.responsible_id))
        .where(
            OrderStageHistory.order_id == order.id,
            OrderStageHistory.stage_id.in_(stage_ids),
            OrderStageHistory.left_at.is_not(None),
            OrderStageHistory.responsible_id.is_not(None),
        )
    )
    return [uid for uid in res.scalars().all() if uid]


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
            order.stage_deadline = await deadline_after(
                db, order.stage_entered_at, max(0, remaining)
            )
            return

    order.stage_deadline = await deadline_after(
        db, order.stage_entered_at, stage.duration_hours * 3600
    )


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

    was_paused = order.is_paused

    is_backward = to_stage.sort < from_stage.sort
    skipped_ids = (
        await skipped_stage_workers(db, order, from_stage, to_stage) if is_backward else []
    )

    # Tarix pauza tozalanishidan OLDIN yopiladi — aks holda pauzada turgan
    # proyektning muzlatilgan qoldiq vaqti tarixga yozilmay yo'qolib ketardi.
    await close_history(db, order, comment)

    if was_paused:
        order.is_paused = False
        order.paused_at = None
        order.pause_reason = None
        order.paused_by_id = None
        order.stage_deadline_frozen_remaining_sec = None

    order.stage_id = to_stage.id
    order.stage = to_stage
    await apply_stage_deadline(db, order, to_stage, from_stage=from_stage)

    # Yangi bosqich mas'uli:
    #  1) chaqiruvda aniq berilgan bo'lsa — o'sha
    #  2) orqaga qaytarilganda — o'sha bosqichda oxirgi marta kim mas'ul bo'lgan bo'lsa, o'sha
    #     (odam qayta «Olaman» bosmasin, o'z ishini davom ettiraversin)
    #  3) aks holda — bo'sh (texnik «Olaman» tugmasi bilan oladi yoki HR biriktiradi)
    if next_responsible_id:
        order.responsible_id = next_responsible_id
    elif is_backward:
        order.responsible_id = await last_responsible_at_stage(db, order, to_stage.id)
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
        message_ru=f"Этап: {from_stage.name_ru} → {to_stage.name_ru}"
        + (" (снято с паузы)" if was_paused else ""),
        message_uz=f"Bosqich: {from_stage.name_uz} → {to_stage.name_uz}"
        + (" (pauzadan chiqarildi)" if was_paused else ""),
        meta={
            "from": {"id": from_stage.id, "name": from_stage.name_ru},
            "to": {"id": to_stage.id, "name": to_stage.name_ru},
            "responsible": order.responsible_id,
            "comment": comment,
            "was_paused": was_paused,
        },
        request=request,
    )

    await system_message(
        db,
        order,
        f"Этап: {from_stage.name_ru} → {to_stage.name_ru}"
        + (f" · {order.responsible.full_name}" if order.responsible else "")
        + (" · снято с паузы" if was_paused else "")
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

    skipped_ids = [uid for uid in skipped_ids if uid != actor.id]
    if is_backward and skipped_ids:
        await notify_svc.notify(
            db,
            NotifyEvent.ORDER_MOVED_BACK,
            order=order,
            actor=actor,
            stage_id=to_stage.id,
            extra_user_ids=skipped_ids,
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


async def pause(
    db: AsyncSession, order: Order, user: User, reason: str, request=None  # noqa: ANN001
) -> Order:
    """Ishni pauza qilish — sabab majburiy, bosqich dedlayni muzlaydi."""
    if order.is_closed:
        raise HTTPException(400, "order_closed")
    if order.is_paused:
        raise HTTPException(409, "already_paused")

    now = now_utc()
    if order.stage_deadline:
        order.stage_deadline_frozen_remaining_sec = await remaining_stage_seconds(
            db, now, order.stage_deadline
        )
        order.stage_deadline = None
    else:
        order.stage_deadline_frozen_remaining_sec = None

    order.is_paused = True
    order.paused_at = now
    order.pause_reason = reason
    order.paused_by_id = user.id
    await db.flush()
    await db.refresh(order, ["paused_by"])

    await log_activity(
        db,
        action="order.paused",
        category=LogCategory.ORDER,
        actor=user,
        order_id=order.id,
        entity="order",
        entity_id=order.id,
        message_ru=f"Приостановлено на этапе {order.stage.name_ru}. Причина: {reason}",
        message_uz=f"{order.stage.name_uz} bosqichida to'xtatildi. Sababi: {reason}",
        meta={"stage_id": order.stage_id, "reason": reason},
        request=request,
    )
    await system_message(
        db, order, f"Пауза: {user.full_name} поставил проект на паузу — {reason}", actor_id=user.id
    )
    await notify_svc.notify(
        db,
        NotifyEvent.ORDER_PAUSED,
        order=order,
        actor=user,
        stage_id=order.stage_id,
        ctx={"reason": reason},
    )
    await broadcast_order(order, "order.paused", {})
    return order


async def resume(db: AsyncSession, order: Order, user: User, request=None) -> Order:  # noqa: ANN001
    """Pauzadan chiqarish — faqat pauzani qo'ygan xodim yoki admin."""
    if not order.is_paused:
        raise HTTPException(409, "not_paused")
    if not (user.is_super or user.id == order.paused_by_id):
        raise HTTPException(403, "forbidden")

    reason = order.pause_reason
    now = now_utc()
    if order.stage_deadline_frozen_remaining_sec is not None:
        order.stage_deadline = await deadline_after(
            db, now, max(0, order.stage_deadline_frozen_remaining_sec)
        )
        order.stage_deadline_frozen_remaining_sec = None

    order.is_paused = False
    order.paused_at = None
    order.pause_reason = None
    order.paused_by_id = None
    await db.flush()

    await log_activity(
        db,
        action="order.resumed",
        category=LogCategory.ORDER,
        actor=user,
        order_id=order.id,
        entity="order",
        entity_id=order.id,
        message_ru=f"Возобновлено на этапе {order.stage.name_ru}",
        message_uz=f"{order.stage.name_uz} bosqichida davom ettirildi",
        meta={"stage_id": order.stage_id, "prev_reason": reason},
        request=request,
    )
    await system_message(db, order, f"Возобновлено: {user.full_name} снял проект с паузы", actor_id=user.id)
    await notify_svc.notify(
        db, NotifyEvent.ORDER_RESUMED, order=order, actor=user, stage_id=order.stage_id
    )
    await broadcast_order(order, "order.resumed", {})
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
