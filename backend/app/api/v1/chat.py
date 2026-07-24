import re
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import func, or_, select

from app.core.deps import CurrentUser, DbDep, require
from app.core.security import now_utc
from app.models import (
    Chat,
    ChatMember,
    ChatType,
    FileAsset,
    FileEntity,
    LogCategory,
    Message,
    Order,
    User,
)
from app.realtime.hub import hub
from app.schemas.chat import ChatOut, DirectOpen, HideChat, MessageCreate, MessageEdit, MessageOut
from app.schemas.common import Msg
from app.schemas.user import UserShort
from app.services.logger import log_activity
from app.services.notify import notify as notify_svc

router = APIRouter(prefix="/chats", tags=["chat"])


def direct_key(a: int, b: int) -> str:
    lo, hi = sorted((a, b))
    return f"{lo}:{hi}"


async def _membership(db, chat_id: int, user: User) -> ChatMember:  # noqa: ANN001
    res = await db.execute(
        select(ChatMember).where(ChatMember.chat_id == chat_id, ChatMember.user_id == user.id)
    )
    member = res.scalar_one_or_none()
    if member is None:
        # super admin yoki "barcha chatlarni ko'rish" huquqi — istalgan chatni
        # o'qiy oladi (nazorat uchun, adminkadan rolga beriladi)
        if user.is_super or user.has_perm("chat.view.all"):
            res = await db.execute(select(Chat).where(Chat.id == chat_id))
            if res.scalar_one_or_none() is not None:
                cm = ChatMember(chat_id=chat_id, user_id=user.id, joined_at=now_utc())
                db.add(cm)
                await db.flush()
                return cm

        # Order chatlari: proyektga kirish huquqi bor foydalanuvchini avtomatik qo'shish
        res = await db.execute(select(Chat).where(Chat.id == chat_id))
        chat = res.scalar_one_or_none()
        if chat and chat.order_id:
            res = await db.execute(select(Order).where(Order.id == chat.order_id))
            order = res.scalar_one_or_none()
            if order:
                has_access = (
                    user.has_perm("order.view.all")
                    or order.responsible_id == user.id
                    or order.created_by_id == user.id
                    or any(s.id == order.stage_id for s in (user.stages or []))
                )
                if has_access:
                    cm = ChatMember(chat_id=chat_id, user_id=user.id, joined_at=now_utc())
                    db.add(cm)
                    await db.flush()
                    return cm

        # Direct chatlari: agar foydalanuvchi shu chatning ishtirokchisi bo'lsa, avtomatik qo'shish
        if chat and chat.type == ChatType.DIRECT and chat.direct_key:
            parts = chat.direct_key.split(":")
            if len(parts) == 2 and str(user.id) in parts:
                cm = ChatMember(chat_id=chat_id, user_id=user.id, joined_at=now_utc())
                db.add(cm)
                await db.flush()
                return cm

        raise HTTPException(403, "not_a_member")
    return member


async def _unread_count(db, chat_id: int, last_read_id: int | None) -> int:  # noqa: ANN001
    q = select(func.count(Message.id)).where(
        Message.chat_id == chat_id, Message.deleted_at.is_(None)
    )
    if last_read_id:
        q = q.where(Message.id > last_read_id)
    return (await db.execute(q)).scalar() or 0


@router.get("", response_model=list[ChatOut])
async def my_chats(db: DbDep, user: CurrentUser, type: str | None = None):
    """Mening chatlarim: proyekt chatlari + shaxsiy yozishmalar."""
    q = (
        select(Chat, ChatMember)
        .join(ChatMember, ChatMember.chat_id == Chat.id)
        .where(ChatMember.user_id == user.id)
    )
    if type:
        q = q.where(Chat.type == type)
    res = await db.execute(q.order_by(Chat.last_message_at.desc().nullslast()))

    out: list[ChatOut] = []
    for chat, member in res.all():
        members = [UserShort.model_validate(m.user) for m in chat.members if m.user]
        row = ChatOut(
            id=chat.id,
            type=chat.type,
            order_id=chat.order_id,
            last_message_at=chat.last_message_at,
            members=members,
        )
        row.unread = await _unread_count(db, chat.id, member.last_read_message_id)
        row.hidden = member.hidden

        if chat.type == ChatType.DIRECT:
            peer = next((m.user for m in chat.members if m.user_id != user.id), None)
            row.peer = UserShort.model_validate(peer) if peer else None
            row.title = peer.full_name if peer else "—"
        elif chat.order_id:
            o = await db.execute(select(Order.number, Order.title).where(Order.id == chat.order_id))
            found = o.first()
            if found:
                row.order_number = found[0]
                row.title = f"{found[0]} · {found[1]}"

        last = await db.execute(
            select(Message.text)
            .where(Message.chat_id == chat.id, Message.deleted_at.is_(None))
            .order_by(Message.id.desc())
            .limit(1)
        )
        row.last_message = last.scalar_one_or_none()
        out.append(row)
    return out


@router.get("/{chat_id}", response_model=ChatOut)
async def get_chat(
    chat_id: int,
    db: DbDep,
    user: CurrentUser,
):
    """Bitta chat haqida ma'lumot (a'zolari bilan)."""
    member = await _membership(db, chat_id, user)
    res = await db.execute(select(Chat).where(Chat.id == chat_id))
    chat = res.scalar_one()

    members = [UserShort.model_validate(m.user) for m in chat.members if m.user]
    row = ChatOut(
        id=chat.id,
        type=chat.type,
        order_id=chat.order_id,
        order_is_closed=bool(chat.order.is_closed) if chat.order else False,
        last_message_at=chat.last_message_at,
        members=members,
    )
    row.unread = await _unread_count(db, chat.id, member.last_read_message_id)
    row.hidden = member.hidden

    if chat.type == ChatType.DIRECT:
        peer = next((m.user for m in chat.members if m.user_id != user.id), None)
        row.peer = UserShort.model_validate(peer) if peer else None
        row.title = peer.full_name if peer else "—"
    elif chat.order_id:
        o = await db.execute(select(Order.number, Order.title).where(Order.id == chat.order_id))
        found = o.first()
        if found:
            row.order_number = found[0]
            row.title = f"{found[0]} · {found[1]}"

    last = await db.execute(
        select(Message.text)
        .where(Message.chat_id == chat.id, Message.deleted_at.is_(None))
        .order_by(Message.id.desc())
        .limit(1)
    )
    row.last_message = last.scalar_one_or_none()
    return row


@router.post("/{chat_id}/hide", response_model=Msg)
async def hide_chat(chat_id: int, body: HideChat, db: DbDep, user: CurrentUser):
    """Chatni ro'yxatda yashirish/qaytarish (faqat proyekt chatlari).

    Shaxsiy (direct) chatlarni yashirib bo'lmaydi. Yashirilgan chatga yangi xabar
    kelsa, avtomatik qaytadi.
    """
    member = await _membership(db, chat_id, user)
    if body.hidden:
        res = await db.execute(select(Chat).where(Chat.id == chat_id))
        chat = res.scalar_one()
        if chat.type != ChatType.ORDER:
            raise HTTPException(400, "only_order_chat")
    member.hidden = body.hidden
    await db.commit()
    return Msg(detail="ok")


@router.post("/direct", response_model=ChatOut)
async def open_direct(
    body: DirectOpen,
    db: DbDep,
    user: CurrentUser,
):
    """Xodim bilan shaxsiy chatni ochish (bo'lmasa yaratiladi)."""
    if body.user_id == user.id:
        raise HTTPException(400, "cannot_chat_with_self")

    res = await db.execute(select(User).where(User.id == body.user_id, User.is_active.is_(True)))
    peer = res.scalar_one_or_none()
    if peer is None:
        raise HTTPException(404, "user_not_found")

    key = direct_key(user.id, peer.id)
    res = await db.execute(select(Chat).where(Chat.direct_key == key))
    chat = res.scalar_one_or_none()
    if chat is None:
        chat = Chat(type=ChatType.DIRECT, direct_key=key)
        db.add(chat)
        await db.flush()
        db.add(ChatMember(chat_id=chat.id, user_id=user.id, joined_at=now_utc()))
        db.add(ChatMember(chat_id=chat.id, user_id=peer.id, joined_at=now_utc()))
        await db.commit()
        await db.refresh(chat)

    # members va user relationlarni yuklab, manual ChatOut quramiz
    res = await db.execute(
        select(ChatMember).where(ChatMember.chat_id == chat.id)
    )
    chat_members: list[UserShort] = [
        UserShort.model_validate(m.user) for m in res.scalars().all() if m.user
    ]
    row = ChatOut(
        id=chat.id,
        type=chat.type,
        order_id=chat.order_id,
        order_is_closed=bool(chat.order.is_closed) if chat.order else False,
        last_message_at=chat.last_message_at,
        title=peer.full_name,
        peer=UserShort.model_validate(peer),
        members=chat_members,
    )
    return row


@router.get("/by-order/{order_id}", response_model=ChatOut)
async def chat_by_order(
    order_id: int, db: DbDep, user: CurrentUser
):
    res = await db.execute(select(Order).where(Order.id == order_id))
    order = res.scalar_one_or_none()
    if order is None:
        raise HTTPException(404, "order_not_found")

    from app.services.orders import ensure_order_chat

    chat = await ensure_order_chat(db, order, user.id)
    await db.commit()
    await db.refresh(chat)

    members = [UserShort.model_validate(m.user) for m in chat.members if m.user]
    row = ChatOut(
        id=chat.id,
        type=chat.type,
        order_id=chat.order_id,
        last_message_at=chat.last_message_at,
        members=members,
        order_number=order.number,
        title=f"{order.number} · {order.title}",
    )
    return row


@router.get("/{chat_id}/messages", response_model=list[MessageOut])
async def messages(
    chat_id: int,
    db: DbDep,
    user: CurrentUser,
    before_id: int | None = None,
    limit: int = Query(50, ge=1, le=200),
):
    await _membership(db, chat_id, user)

    q = select(Message).where(Message.chat_id == chat_id)
    if before_id:
        q = q.where(Message.id < before_id)
    res = await db.execute(q.order_by(Message.id.desc()).limit(limit))
    rows = list(res.scalars().all())
    rows.reverse()

    out = []
    for m in rows:
        row = MessageOut.model_validate(m)
        if m.deleted_at is not None:
            row.text = None
            row.attachments = []
        else:
            row.attachments = [
                a.model_copy(update={"url": f"/api/v1/files/{a.id}"}) for a in row.attachments
            ]
        out.append(row)
    return out


@router.post("/{chat_id}/messages", response_model=MessageOut, status_code=201)
async def send_message(
    chat_id: int,
    body: MessageCreate,
    request: Request,
    db: DbDep,
    user: CurrentUser,
):
    if not (body.text and body.text.strip()) and not body.file_ids:
        raise HTTPException(400, "empty_message")

    member = await _membership(db, chat_id, user)
    res = await db.execute(select(Chat).where(Chat.id == chat_id))
    chat = res.scalar_one()

    if chat.type == ChatType.DIRECT:
        is_participant = bool(
            chat.direct_key
            and len(parts := chat.direct_key.split(":")) == 2
            and str(user.id) in parts
        )
        if not (user.is_super or user.has_perm("chat.direct") or is_participant):
            raise HTTPException(403, "forbidden")
    elif chat.type == ChatType.ORDER and not (user.is_super or user.has_perm("chat.order")):
        raise HTTPException(403, "forbidden")

    msg = Message(
        chat_id=chat_id,
        author_id=user.id,
        text=(body.text or "").strip() or None,
        reply_to_id=body.reply_to_id,
        created_at=now_utc(),
    )
    db.add(msg)
    await db.flush()

    # yuklangan fayllarni shu xabarga bog'laymiz
    if body.file_ids:
        res = await db.execute(
            select(FileAsset).where(
                FileAsset.id.in_(body.file_ids), FileAsset.uploaded_by_id == user.id
            )
        )
        for f in res.scalars().all():
            f.entity = FileEntity.MESSAGE
            f.entity_id = msg.id

    chat.last_message_at = msg.created_at
    if member.id:
        member.last_read_message_id = msg.id

    # Yashirilgan chatga yangi xabar kelsa — barcha a'zolarda avtomatik qaytariladi
    res_hidden = await db.execute(
        select(ChatMember).where(ChatMember.chat_id == chat_id, ChatMember.hidden.is_(True))
    )
    for hidden_member in res_hidden.scalars().all():
        hidden_member.hidden = False

    await db.commit()
    await db.refresh(msg)

    row = MessageOut.model_validate(msg)
    row.attachments = [
        a.model_copy(update={"url": f"/api/v1/files/{a.id}"}) for a in row.attachments
    ]

    msg_payload = row.model_dump(mode="json")
    if chat.order_id:
        msg_payload["order_id"] = chat.order_id
    await hub.publish(f"chat:{chat_id}", "chat.message", msg_payload)

    res_m = await db.execute(
        select(ChatMember.user_id).where(ChatMember.chat_id == chat_id)
    )
    for uid in res_m.scalars().all():
        await hub.publish(f"user:{uid}", "chat.message", msg_payload)

    # @mention — xabarda tilga olingan foydalanuvchilarni aniqlaymiz.
    # Faqat shu chatning a'zolarini otmetka qilish mumkin (begona userga bildirishnoma ketmasin)
    mentioned_ids: list[int] = []
    if msg.text:
        for match in re.finditer(r"@(\S+)", msg.text):
            text = match.group(1)
            # avval username bo'yicha, topilmasa full_name bo'yicha (case-insensitive)
            uid = None
            res = await db.execute(
                select(User.id)
                .join(ChatMember, ChatMember.user_id == User.id)
                .where(
                    ChatMember.chat_id == chat_id,
                    User.username == text,
                    User.is_active.is_(True),
                )
            )
            uid = res.scalar_one_or_none()
            if uid is None:
                res = await db.execute(
                    select(User.id)
                    .join(ChatMember, ChatMember.user_id == User.id)
                    .where(
                        ChatMember.chat_id == chat_id,
                        User.full_name.ilike(text),
                        User.is_active.is_(True),
                    )
                )
                uid = res.scalar_one_or_none()
            if uid and uid != user.id:
                mentioned_ids.append(uid)

    # chat a'zolariga bildirishnoma (o'zidan tashqari)
    res = await db.execute(
        select(ChatMember.user_id).where(
            ChatMember.chat_id == chat_id,
            ChatMember.user_id != user.id,
            ChatMember.muted.is_(False),
        )
    )
    recipients = list(res.scalars().all())

    # @mention qilinganlarni ham qo'shamiz (agar muted bo'lsa ham)
    for uid in mentioned_ids:
        if uid not in recipients:
            recipients.append(uid)

    if recipients:
        order = None
        if chat.order_id:
            r = await db.execute(select(Order).where(Order.id == chat.order_id))
            order = r.scalar_one_or_none()
        preview = (msg.text or "📎 файл")[:120]
        ctx: dict = {"message": preview}
        if mentioned_ids:
            ctx["mentioned"] = mentioned_ids
        await notify_svc(
            db,
            "chat.message",
            order=order,
            actor=user,
            extra_user_ids=recipients,
            ctx=ctx,
            link={"type": "chat", "id": chat_id, "order_id": chat.order_id},
        )
        await db.commit()

    await log_activity(
        db, action="chat.message", category=LogCategory.CHAT, actor=user,
        order_id=chat.order_id, entity="chat", entity_id=chat_id,
        message_ru=f"Сообщение в чат #{chat_id}",
        message_uz=f"#{chat_id} chatiga xabar",
        request=request, commit=True,
    )
    return row


@router.patch("/{chat_id}/messages/{message_id}", response_model=MessageOut)
async def edit_message(
    chat_id: int, message_id: int, body: MessageEdit, request: Request, db: DbDep, user: CurrentUser
):
    res = await db.execute(
        select(Message).where(Message.id == message_id, Message.chat_id == chat_id)
    )
    msg = res.scalar_one_or_none()
    if msg is None or msg.deleted_at is not None:
        raise HTTPException(404, "message_not_found")
    if msg.author_id != user.id:
        raise HTTPException(403, "not_your_message")

    msg.text = body.text.strip()
    msg.edited_at = now_utc()
    await db.commit()
    await db.refresh(msg)

    row = MessageOut.model_validate(msg)
    edit_payload = row.model_dump(mode="json")
    await hub.publish(f"chat:{chat_id}", "chat.message_edited", edit_payload)
    res_m = await db.execute(
        select(ChatMember.user_id).where(ChatMember.chat_id == chat_id)
    )
    for uid in res_m.scalars().all():
        await hub.publish(f"user:{uid}", "chat.message_edited", edit_payload)

    await log_activity(
        db, action="chat.message_edited", category=LogCategory.CHAT, actor=user,
        order_id=None,
        entity="chat", entity_id=chat_id,
        message_ru=f"Сообщение #{message_id} отредактировано в чате #{chat_id}",
        message_uz=f"#{message_id}-xabar #{chat_id} chatida tahrirlandi",
        request=request, commit=True,
    )
    return row


@router.delete("/{chat_id}/messages/{message_id}", response_model=Msg)
async def delete_message(chat_id: int, message_id: int, db: DbDep, user: CurrentUser):
    res = await db.execute(
        select(Message).where(Message.id == message_id, Message.chat_id == chat_id)
    )
    msg = res.scalar_one_or_none()
    if msg is None:
        raise HTTPException(404, "message_not_found")
    if msg.author_id != user.id and not user.is_super:
        raise HTTPException(403, "not_your_message")

    msg.deleted_at = now_utc()
    await db.commit()
    del_payload = {"id": message_id, "chat_id": chat_id}
    await hub.publish(f"chat:{chat_id}", "chat.message_deleted", del_payload)
    res_m = await db.execute(
        select(ChatMember.user_id).where(ChatMember.chat_id == chat_id)
    )
    for uid in res_m.scalars().all():
        await hub.publish(f"user:{uid}", "chat.message_deleted", del_payload)
    return Msg(detail="deleted")


@router.post("/{chat_id}/read", response_model=Msg)
async def mark_read(chat_id: int, db: DbDep, user: CurrentUser, message_id: int | None = None):
    member = await _membership(db, chat_id, user)
    if member.id is None:
        return Msg(detail="ok")

    if message_id is None:
        res = await db.execute(
            select(func.max(Message.id)).where(Message.chat_id == chat_id)
        )
        message_id = res.scalar()

    member.last_read_message_id = message_id
    await db.commit()

    await hub.publish(
        f"user:{user.id}",
        "chat.read",
        {"chat_id": chat_id, "last_read_id": message_id},
    )
    return Msg(detail="ok")


@router.get("/unread/total", response_model=dict)
async def unread_total(db: DbDep, user: CurrentUser):
    res = await db.execute(
        select(ChatMember.chat_id, ChatMember.last_read_message_id).where(
            ChatMember.user_id == user.id
        )
    )
    total = 0
    per_chat: dict[int, int] = {}
    for chat_id, last_read in res.all():
        n = await _unread_count(db, chat_id, last_read)
        if n:
            per_chat[chat_id] = n
            total += n
    return {"total": total, "chats": per_chat}


class MemberAdd(BaseModel):
    user_ids: list[int]


@router.post("/{chat_id}/members", response_model=list[UserShort], status_code=201)
async def add_members(
    chat_id: int,
    body: MemberAdd,
    request: Request,
    db: DbDep,
    user: CurrentUser,
):
    """Chatga yangi a'zolarni qo'shish (faqat order chatlari)."""
    member = await _membership(db, chat_id, user)
    res = await db.execute(select(Chat).where(Chat.id == chat_id))
    chat = res.scalar_one()
    if chat.type != ChatType.ORDER:
        raise HTTPException(400, "only_order_chat")
    if not (user.is_super or user.has_perm("chat.order")):
        raise HTTPException(403, "forbidden")

    added: list[UserShort] = []
    for uid in body.user_ids:
        res = await db.execute(select(User).where(User.id == uid, User.is_active.is_(True)))
        target = res.scalar_one_or_none()
        if target is None:
            continue
        res = await db.execute(
            select(ChatMember).where(ChatMember.chat_id == chat_id, ChatMember.user_id == uid)
        )
        if res.scalar_one_or_none() is not None:
            continue
        db.add(ChatMember(chat_id=chat_id, user_id=uid, joined_at=now_utc()))
        added.append(UserShort.model_validate(target))

    if added:
        names = ", ".join(u.full_name for u in added)
        msg = Message(
            chat_id=chat.id, text=f"Добавлены: {names}", is_system=True, created_at=now_utc()
        )
        db.add(msg)
        chat.last_message_at = msg.created_at
        await db.commit()
        sys_msg_payload = {
            "id": msg.id,
            "chat_id": chat.id,
            "order_id": chat.order_id,
            "text": msg.text,
            "is_system": True,
            "author": None,
            "created_at": msg.created_at.isoformat(),
        }
        await hub.publish(f"chat:{chat_id}", "chat.message", sys_msg_payload)
        res_m = await db.execute(
            select(ChatMember.user_id).where(ChatMember.chat_id == chat_id)
        )
        for uid in res_m.scalars().all():
            await hub.publish(f"user:{uid}", "chat.message", sys_msg_payload)

    return added


@router.delete("/{chat_id}/members/{user_id}", response_model=Msg)
async def remove_member(
    chat_id: int,
    user_id: int,
    request: Request,
    db: DbDep,
    user: CurrentUser,
):
    """Chatdan a'zoni olib tashlash."""
    member = await _membership(db, chat_id, user)
    res = await db.execute(select(Chat).where(Chat.id == chat_id))
    chat = res.scalar_one()
    if chat.type != ChatType.ORDER:
        raise HTTPException(400, "only_order_chat")
    if not (user.is_super or user.has_perm("chat.order")):
        raise HTTPException(403, "forbidden")
    if user_id == user.id:
        raise HTTPException(400, "cannot_remove_self")

    res = await db.execute(
        select(ChatMember).where(ChatMember.chat_id == chat_id, ChatMember.user_id == user_id)
    )
    target = res.scalar_one_or_none()
    if target is None:
        return Msg(detail="not_a_member")

    await db.delete(target)
    await db.commit()
    return Msg(detail="removed")


@router.post("/{chat_id}/leave", response_model=Msg)
async def leave_chat(chat_id: int, db: DbDep, user: CurrentUser):
    """O'zingizni chatdan olib tashlash (faqat order chatlari)."""
    res = await db.execute(select(Chat).where(Chat.id == chat_id))
    chat = res.scalar_one_or_none()
    if chat is None:
        raise HTTPException(404, "chat_not_found")
    if chat.type != ChatType.ORDER:
        raise HTTPException(400, "only_order_chat")
    res = await db.execute(
        select(ChatMember).where(ChatMember.chat_id == chat_id, ChatMember.user_id == user.id)
    )
    member = res.scalar_one_or_none()
    if member is None:
        return Msg(detail="not_a_member")
    await db.delete(member)
    await db.commit()
    return Msg(detail="left")
