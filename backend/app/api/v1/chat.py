from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request
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
from app.schemas.chat import ChatOut, DirectOpen, MessageCreate, MessageEdit, MessageOut
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
        # super admin istalgan proyekt chatini o'qiy oladi (nazorat uchun)
        if user.is_super:
            res = await db.execute(select(Chat).where(Chat.id == chat_id))
            if res.scalar_one_or_none() is not None:
                return ChatMember(chat_id=chat_id, user_id=user.id, joined_at=now_utc())
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
        row = ChatOut.model_validate(chat)
        row.unread = await _unread_count(db, chat.id, member.last_read_message_id)
        row.members = [UserShort.model_validate(m.user) for m in chat.members if m.user]

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


@router.post("/direct", response_model=ChatOut)
async def open_direct(
    body: DirectOpen,
    db: DbDep,
    user: Annotated[User, Depends(require("chat.direct"))],
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

    row = ChatOut.model_validate(chat)
    row.title = peer.full_name
    row.peer = UserShort.model_validate(peer)
    return row


@router.get("/by-order/{order_id}", response_model=ChatOut)
async def chat_by_order(
    order_id: int, db: DbDep, user: Annotated[User, Depends(require("chat.order"))]
):
    res = await db.execute(select(Order).where(Order.id == order_id))
    order = res.scalar_one_or_none()
    if order is None:
        raise HTTPException(404, "order_not_found")

    from app.services.orders import ensure_order_chat

    chat = await ensure_order_chat(db, order, user.id)
    await db.commit()
    await db.refresh(chat)

    row = ChatOut.model_validate(chat)
    row.order_number = order.number
    row.title = f"{order.number} · {order.title}"
    row.members = [UserShort.model_validate(m.user) for m in chat.members if m.user]
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

    perm = "chat.order" if chat.type == ChatType.ORDER else "chat.direct"
    if not (user.is_super or user.has_perm(perm)):
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
    await db.commit()
    await db.refresh(msg)

    row = MessageOut.model_validate(msg)
    row.attachments = [
        a.model_copy(update={"url": f"/api/v1/files/{a.id}"}) for a in row.attachments
    ]

    await hub.publish(
        f"chat:{chat_id}",
        "chat.message",
        row.model_dump(mode="json"),
    )

    # chat a'zolariga bildirishnoma (o'zidan tashqari)
    res = await db.execute(
        select(ChatMember.user_id).where(
            ChatMember.chat_id == chat_id,
            ChatMember.user_id != user.id,
            ChatMember.muted.is_(False),
        )
    )
    recipients = list(res.scalars().all())
    if recipients:
        order = None
        if chat.order_id:
            r = await db.execute(select(Order).where(Order.id == chat.order_id))
            order = r.scalar_one_or_none()
        preview = (msg.text or "📎 файл")[:120]
        await notify_svc(
            db,
            "chat.message",
            order=order,
            actor=user,
            extra_user_ids=recipients,
            ctx={"message": preview},
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
    chat_id: int, message_id: int, body: MessageEdit, db: DbDep, user: CurrentUser
):
    res = await db.execute(
        select(Message).where(Message.id == message_id, Message.chat_id == chat_id)
    )
    msg = res.scalar_one_or_none()
    if msg is None or msg.deleted_at is not None:
        raise HTTPException(404, "message_not_found")
    if msg.author_id != user.id:
        raise HTTPException(403, "not_your_message")  # o'zganikini tahrirlab bo'lmaydi

    msg.text = body.text.strip()
    msg.edited_at = now_utc()
    await db.commit()
    await db.refresh(msg)

    row = MessageOut.model_validate(msg)
    await hub.publish(f"chat:{chat_id}", "chat.message_edited", row.model_dump(mode="json"))
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
    await hub.publish(f"chat:{chat_id}", "chat.message_deleted", {"id": message_id})
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
