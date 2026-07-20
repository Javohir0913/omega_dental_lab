"""WebSocket hub.

Bir nechta uvicorn worker/konteyner bo'lganda ham hodisa hammaga yetib borishi
uchun Redis pub/sub orqali ishlaydi: har bir process o'z lokal socketlariga
tarqatadi, processlar orasida esa Redis kanali.

Kanallar (topic):
  kanban              — kanban o'zgarishlari (hamma ko'radi)
  order:<id>          — bitta proyekt kartasi ochiq bo'lganlar
  chat:<id>           — chat xonasi
  user:<id>           — shaxsiy (bildirishnoma, sessiya uzilishi)
"""

import asyncio
import json
import logging
from collections import defaultdict

import redis.asyncio as aioredis
from fastapi import WebSocket

from app.core.config import settings

log = logging.getLogger(__name__)

REDIS_CHANNEL = "omega:events"


class Hub:
    def __init__(self) -> None:
        # topic -> set of websockets
        self._rooms: dict[str, set[WebSocket]] = defaultdict(set)
        # websocket -> user_id
        self._owner: dict[WebSocket, int] = {}
        self._lock = asyncio.Lock()
        self._redis: aioredis.Redis | None = None
        self._task: asyncio.Task | None = None

    # --- hayotiy sikl ---

    async def start(self) -> None:
        try:
            self._redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
            await self._redis.ping()
            self._task = asyncio.create_task(self._listen())
            log.info("Hub: redis pub/sub ulandi")
        except Exception as e:  # redis yo'q bo'lsa ham CRM ishlayversin
            log.warning("Hub: redis ulanmadi (%s), lokal rejimda ishlaymiz", e)
            self._redis = None

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
        if self._redis:
            await self._redis.aclose()

    async def _listen(self) -> None:
        assert self._redis is not None
        pubsub = self._redis.pubsub()
        await pubsub.subscribe(REDIS_CHANNEL)
        async for msg in pubsub.listen():
            if msg.get("type") != "message":
                continue
            try:
                payload = json.loads(msg["data"])
                await self._local_send(payload["topic"], payload["event"])
            except Exception:
                log.exception("Hub: xabarni tarqatishda xato")

    # --- ulanish ---

    async def connect(self, ws: WebSocket, user_id: int, topics: list[str]) -> None:
        async with self._lock:
            self._owner[ws] = user_id
            for t in topics:
                self._rooms[t].add(ws)
            self._rooms[f"user:{user_id}"].add(ws)

    async def disconnect(self, ws: WebSocket) -> None:
        async with self._lock:
            self._owner.pop(ws, None)
            for subs in self._rooms.values():
                subs.discard(ws)

    async def join(self, ws: WebSocket, topic: str) -> None:
        async with self._lock:
            self._rooms[topic].add(ws)

    async def leave(self, ws: WebSocket, topic: str) -> None:
        async with self._lock:
            self._rooms[topic].discard(ws)

    # --- yuborish ---

    async def publish(self, topic: str, event_type: str, data: dict) -> None:
        event = {"type": event_type, "data": data}
        if self._redis is not None:
            try:
                await self._redis.publish(
                    REDIS_CHANNEL, json.dumps({"topic": topic, "event": event}, default=str)
                )
                return
            except Exception:
                log.warning("Hub: redis publish ishlamadi, lokal yuborilyapti")
        await self._local_send(topic, event)

    async def _local_send(self, topic: str, event: dict) -> None:
        targets = list(self._rooms.get(topic, ()))
        if not targets:
            return
        text = json.dumps(event, default=str, ensure_ascii=False)
        dead: list[WebSocket] = []
        for ws in targets:
            try:
                await ws.send_text(text)
            except Exception:
                dead.append(ws)
        for ws in dead:
            await self.disconnect(ws)

    async def kick_user(self, user_id: int, reason: str = "session_revoked") -> None:
        """Sessiya uzilganda userning ochiq socketlariga xabar beramiz."""
        await self.publish(f"user:{user_id}", "session.revoked", {"reason": reason})

    def online_user_ids(self) -> set[int]:
        return set(self._owner.values())


hub = Hub()
