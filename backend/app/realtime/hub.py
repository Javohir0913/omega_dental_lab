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
from collections.abc import Awaitable, Callable

import redis.asyncio as aioredis
from fastapi import WebSocket

from app.core.config import settings

log = logging.getLogger(__name__)

REDIS_CHANNEL = "omega:events"
LEADER_KEY = "omega:bg_leader"
LEADER_TTL_SEC = 90
# Websocket xonalari bilan aralashmasin deb alohida nom fazosi — bular haqiqiy
# ulanishga emas, faqat jarayonlararo boshqaruv signaliga (masalan "faqat
# yetakchi worker telegram poller'ni qayta ishga tushirsin") ishlatiladi.
CONTROL_TOPIC_PREFIX = "control:"


class Hub:
    def __init__(self) -> None:
        # topic -> set of websockets
        self._rooms: dict[str, set[WebSocket]] = defaultdict(set)
        # websocket -> user_id
        self._owner: dict[WebSocket, int] = {}
        self._lock = asyncio.Lock()
        self._redis: aioredis.Redis | None = None
        self._task: asyncio.Task | None = None
        # control: <topic> -> handlerlar (masalan telegram poller restart)
        self._control_handlers: dict[str, list[Callable[[dict], Awaitable[None]]]] = defaultdict(list)

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
                topic = payload["topic"]
                event = payload["event"]
                if topic.startswith(CONTROL_TOPIC_PREFIX):
                    for handler in self._control_handlers.get(topic, ()):
                        await handler(event.get("data") or {})
                else:
                    await self._local_send(topic, event)
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
            empty_topics = []
            for topic, subs in self._rooms.items():
                subs.discard(ws)
                if not subs:
                    empty_topics.append(topic)
            for topic in empty_topics:
                del self._rooms[topic]

    async def join(self, ws: WebSocket, topic: str) -> None:
        async with self._lock:
            self._rooms[topic].add(ws)

    async def leave(self, ws: WebSocket, topic: str) -> None:
        async with self._lock:
            subs = self._rooms.get(topic)
            if subs is None:
                return
            subs.discard(ws)
            if not subs:
                del self._rooms[topic]

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

    # --- boshqaruv signallari (control) — jarayonlararo, websocket bilan bog'liq emas ---

    def on_control(self, topic: str, handler: Callable[[dict], Awaitable[None]]) -> None:
        """`send_control` orqali kelgan signalni ushlab oladi (faqat shu handler'ni
        ro'yxatdan o'tkazgan process — odatda leader — uni bajaradi)."""
        self._control_handlers[f"{CONTROL_TOPIC_PREFIX}{topic}"].append(handler)

    async def send_control(self, topic: str, data: dict | None = None) -> None:
        """Boshqa (yetakchi) process'ga signal yuboradi. Redis bo'lmasa — shu
        process'dagi handler'lar to'g'ridan-to'g'ri chaqiriladi (bitta-process rejimi)."""
        full_topic = f"{CONTROL_TOPIC_PREFIX}{topic}"
        payload = {"data": data or {}}
        if self._redis is not None:
            try:
                await self._redis.publish(
                    REDIS_CHANNEL, json.dumps({"topic": full_topic, "event": payload}, default=str)
                )
                return
            except Exception:
                log.warning("Hub: control signal redis orqali yuborilmadi, lokal bajarilyapti")
        for handler in self._control_handlers.get(full_topic, ()):
            await handler(data or {})

    # --- leader election (bir nechta uvicorn worker/konteynerdan faqat bittasi
    # fon vazifalarni — dedlayn tekshiruvi, telegram digest, telegram poller —
    # bajarishi uchun) ---

    async def try_acquire_leader(self) -> bool:
        """Redis yo'q bo'lsa ham CRM ishlayversin degan qoidaga muvofiq — redis
        ulanmagan holatda True qaytaradi (bitta-process rejimida hammasi "leader")."""
        if self._redis is None:
            return True
        try:
            return bool(await self._redis.set(LEADER_KEY, "1", nx=True, ex=LEADER_TTL_SEC))
        except Exception:
            log.warning("Hub: leader lock olishda xato, fon vazifalar ishga tushmaydi")
            return False

    async def renew_leader(self) -> bool:
        """Leader TTL'ni yangilaydi; agar boshqa process lock'ni tortib olgan
        bo'lsa (masalan bu process qotib qolgan bo'lsa) — False qaytaradi."""
        if self._redis is None:
            return True
        try:
            return bool(await self._redis.expire(LEADER_KEY, LEADER_TTL_SEC))
        except Exception:
            log.warning("Hub: leader lock yangilashda xato")
            return False


hub = Hub()
