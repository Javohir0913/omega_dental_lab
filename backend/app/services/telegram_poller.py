"""Telegramdan /start bosganlarni long polling orqali kuzatib, TelegramContact yozadi."""

import asyncio
import logging

from sqlalchemy import select

from app.core.security import now_utc
from app.db.session import AsyncSessionLocal
from app.models import TelegramContact
from app.services import telegram

log = logging.getLogger("omega.telegram")


class TelegramPoller:
    def __init__(self) -> None:
        self._task: asyncio.Task | None = None
        self._token: str | None = None

    async def start(self, token: str) -> None:
        if not token or (self._task is not None and self._token == token):
            return
        await self.stop()
        self._token = token
        self._task = asyncio.create_task(self._run(token))
        log.info("Telegram poller ishga tushdi")

    async def stop(self) -> None:
        if self._task is None:
            return
        self._task.cancel()
        try:
            await self._task
        except asyncio.CancelledError:
            pass
        self._task = None
        self._token = None
        log.info("Telegram poller to'xtatildi")

    async def restart(self, token: str | None) -> None:
        await self.stop()
        if token:
            await self.start(token)

    async def _run(self, token: str) -> None:
        offset: int | None = None
        while True:
            try:
                updates = await telegram.get_updates(token, offset)
            except asyncio.CancelledError:
                raise
            except Exception:
                log.exception("Telegram getUpdates xatosi")
                await asyncio.sleep(5)
                continue

            for u in updates:
                offset = u["update_id"] + 1
                msg = u.get("message") or {}
                text = (msg.get("text") or "").strip()
                chat = msg.get("chat") or {}
                if text.startswith("/start") and chat.get("id") is not None:
                    await self._register(chat)

    async def _register(self, chat: dict) -> None:
        chat_id = chat["id"]
        try:
            async with AsyncSessionLocal() as db:
                res = await db.execute(
                    select(TelegramContact).where(TelegramContact.chat_id == chat_id)
                )
                contact = res.scalar_one_or_none()
                if contact is None:
                    db.add(TelegramContact(
                        chat_id=chat_id,
                        tg_username=chat.get("username"),
                        tg_first_name=chat.get("first_name"),
                        started_at=now_utc(),
                    ))
                else:
                    contact.tg_username = chat.get("username")
                    contact.tg_first_name = chat.get("first_name")
                await db.commit()
        except Exception:
            log.exception("Telegram contact saqlashda xato (chat_id=%s)", chat_id)


telegram_poller = TelegramPoller()
