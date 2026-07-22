import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from sqlalchemy import select

from app.api.v1 import api_router
from app.core.config import settings
from app.core.security import now_utc
from app.db.session import AsyncSessionLocal
from app.models import LogCategory, LogLevel, TelegramContact
from app.realtime.hub import hub
from app.services import telegram, workcalendar
from app.services.logger import log_activity
from app.services.orders import check_deadline_overdue, check_overdue
from app.services.settings_store import get_setting
from app.services.telegram_poller import telegram_poller

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
log = logging.getLogger("omega")

OVERDUE_INTERVAL_SEC = 300  # dedlayn tekshiruvi — har 5 daqiqa
TELEGRAM_DIGEST_INTERVAL_SEC = 300  # digest tekshiruvi — har 5 daqiqa


async def _overdue_worker() -> None:
    while True:
        await asyncio.sleep(OVERDUE_INTERVAL_SEC)
        try:
            async with AsyncSessionLocal() as db:
                n = await check_overdue(db)
                if n:
                    log.info("Dedlayn ogohlantirishlari: %s", n)
        except Exception:
            log.exception("Dedlayn tekshiruvida xato")
        try:
            async with AsyncSessionLocal() as db:
                n = await check_deadline_overdue(db)
                if n:
                    log.info("Umumiy dedlayn ogohlantirishlari: %s", n)
        except Exception:
            log.exception("Umumiy dedlayn tekshiruvida xato")


async def _telegram_digest_worker() -> None:
    while True:
        await asyncio.sleep(TELEGRAM_DIGEST_INTERVAL_SEC)
        try:
            async with AsyncSessionLocal() as db:
                await _send_due_digests(db)
        except Exception:
            log.exception("Telegram digest tekshiruvida xato")


async def _send_due_digests(db) -> None:  # noqa: ANN001
    if not await get_setting(db, "telegram_enabled", False):
        return
    if not await get_setting(db, "telegram_digest_enabled", False):
        return
    token = await get_setting(db, "telegram_bot_token", "")
    if not token:
        return

    cal = await workcalendar.load_calendar(db)
    local_now = now_utc().astimezone(workcalendar.APP_TZ)
    if cal.enabled and not workcalendar.is_workday(local_now.date(), cal):
        return  # dam kuni/bayram — bezovta qilinmaydi

    daily_on = bool(await get_setting(db, "telegram_digest_daily", True))
    daily_time = workcalendar.parse_hm(
        await get_setting(db, "telegram_digest_daily_time", "08:00"), local_now.time()
    )
    weekly_on = bool(await get_setting(db, "telegram_digest_weekly", False))
    weekly_day = int(await get_setting(db, "telegram_digest_weekly_day", 0))
    weekly_time = workcalendar.parse_hm(
        await get_setting(db, "telegram_digest_weekly_time", "08:00"), local_now.time()
    )

    res = await db.execute(select(TelegramContact).where(TelegramContact.user_id.is_not(None)))
    contacts = list(res.scalars().all())

    for c in contacts:
        if c.user is None or not c.user.is_active:
            continue
        lang = c.user.lang

        if (
            daily_on
            and local_now.time() >= daily_time
            and (c.last_digest_sent_at is None
                 or c.last_digest_sent_at.astimezone(workcalendar.APP_TZ).date() != local_now.date())
        ):
            text = await telegram.build_digest_text(db, c.user, lang, "day")
            if text and await telegram.send_message(token, c.chat_id, text):
                c.last_digest_sent_at = now_utc()

        if (
            weekly_on
            and local_now.weekday() == weekly_day
            and local_now.time() >= weekly_time
            and (c.last_digest_week_sent_at is None
                 or c.last_digest_week_sent_at.astimezone(workcalendar.APP_TZ).isocalendar()[:2]
                 != local_now.isocalendar()[:2])
        ):
            text = await telegram.build_digest_text(db, c.user, lang, "week")
            if text and await telegram.send_message(token, c.chat_id, text):
                c.last_digest_week_sent_at = now_utc()

    await db.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):  # noqa: ANN201
    await hub.start()
    task = asyncio.create_task(_overdue_worker())
    digest_task = asyncio.create_task(_telegram_digest_worker())

    async with AsyncSessionLocal() as db:
        if await get_setting(db, "telegram_enabled", False):
            token = await get_setting(db, "telegram_bot_token", "")
            if token:
                await telegram_poller.start(token)

    log.info("%s ishga tushdi", settings.PROJECT_NAME)
    try:
        yield
    finally:
        task.cancel()
        digest_task.cancel()
        await telegram_poller.stop()
        await hub.stop()


app = FastAPI(
    title=settings.PROJECT_NAME,
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    # 4xx larni tizim logiga yozmaymiz (juda ko'p shovqin), 5xx esa pastdagi handlerda
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


@app.exception_handler(RequestValidationError)
async def validation_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422, content={"detail": {"error": "validation", "fields": exc.errors()}}
    )


@app.exception_handler(Exception)
async def unhandled_handler(request: Request, exc: Exception):
    """Ushlanmagan xato — tizim logiga traceback bilan tushadi (super admin ko'radi)."""
    log.exception("Ushlanmagan xato: %s %s", request.method, request.url.path)
    try:
        async with AsyncSessionLocal() as db:
            user = getattr(request.state, "user", None)
            await log_activity(
                db,
                action="system.unhandled_error",
                category=LogCategory.SYSTEM,
                level=LogLevel.ERROR,
                is_success=False,
                actor=user,
                message_ru=f"Внутренняя ошибка: {type(exc).__name__}",
                message_uz=f"Ichki xato: {type(exc).__name__}",
                request=request,
                error=exc,
                commit=True,
            )
    except Exception:
        log.exception("Xatoni logga yozib bo'lmadi")

    return JSONResponse(status_code=500, content={"detail": "internal_error"})


@app.get("/api/health", tags=["system"])
async def health():
    return {"status": "ok", "project": settings.PROJECT_NAME}


app.include_router(api_router, prefix=settings.API_V1)
