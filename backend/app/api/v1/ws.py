"""Real-time kanal.

Ulanish: ws://host/api/v1/ws?token=<access_token>
Klient yuboradigan xabarlar:
  {"action": "join",  "topic": "order:12"}
  {"action": "leave", "topic": "order:12"}
  {"action": "ping"}
"""

import json
import logging

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from sqlalchemy import select

from app.core.security import ACCESS, decode_token
from app.db.session import AsyncSessionLocal
from app.models import ChatMember, User, UserSession
from app.realtime.hub import hub

log = logging.getLogger(__name__)
router = APIRouter()

ALLOWED_PREFIXES = ("order:", "chat:")


async def _authenticate(token: str) -> User | None:
    payload = decode_token(token, ACCESS)
    if payload is None:
        return None

    async with AsyncSessionLocal() as db:
        res = await db.execute(select(UserSession).where(UserSession.jti == payload.get("jti")))
        session = res.scalar_one_or_none()
        if session is None or session.revoked_at is not None:
            return None

        res = await db.execute(select(User).where(User.id == int(payload.get("sub", 0))))
        user = res.scalar_one_or_none()
        return user if user and user.is_active else None


async def _can_join(user: User, topic: str) -> bool:
    if topic.startswith("chat:"):
        try:
            chat_id = int(topic.split(":", 1)[1])
        except ValueError:
            return False
        if user.is_super:
            return True
        async with AsyncSessionLocal() as db:
            res = await db.execute(
                select(ChatMember).where(
                    ChatMember.chat_id == chat_id, ChatMember.user_id == user.id
                )
            )
            return res.scalar_one_or_none() is not None

    if topic.startswith("order:"):
        # kartani ochish huquqi REST tomonda tekshiriladi; bu yerda faqat
        # o'zgarish signali keladi, maxfiy ma'lumot emas
        return True

    return False


@router.websocket("/ws")
async def websocket_endpoint(ws: WebSocket, token: str = Query(...)):
    user = await _authenticate(token)
    if user is None:
        await ws.close(code=4401, reason="unauthorized")
        return

    await ws.accept()

    topics = ["kanban", f"user:{user.id}"]
    await hub.connect(ws, user.id, topics)
    await ws.send_text(
        json.dumps({"type": "connected", "data": {"user_id": user.id, "topics": topics}})
    )

    try:
        while True:
            raw = await ws.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue

            action = msg.get("action")
            topic = msg.get("topic", "")

            if action == "ping":
                await ws.send_text(json.dumps({"type": "pong", "data": {}}))

            elif action == "join" and topic.startswith(ALLOWED_PREFIXES):
                if await _can_join(user, topic):
                    await hub.join(ws, topic)
                    await ws.send_text(json.dumps({"type": "joined", "data": {"topic": topic}}))
                else:
                    await ws.send_text(
                        json.dumps({"type": "error", "data": {"topic": topic, "error": "forbidden"}})
                    )

            elif action == "leave" and topic:
                await hub.leave(ws, topic)

    except WebSocketDisconnect:
        pass
    except Exception:
        log.exception("WS xatosi (user=%s)", user.id)
    finally:
        await hub.disconnect(ws)
