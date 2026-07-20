import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.v1 import api_router
from app.core.config import settings
from app.db.session import AsyncSessionLocal
from app.models import LogCategory, LogLevel
from app.realtime.hub import hub
from app.services.logger import log_activity
from app.services.orders import check_overdue

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
log = logging.getLogger("omega")

OVERDUE_INTERVAL_SEC = 300  # dedlayn tekshiruvi — har 5 daqiqa


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


@asynccontextmanager
async def lifespan(app: FastAPI):  # noqa: ANN201
    await hub.start()
    task = asyncio.create_task(_overdue_worker())
    log.info("%s ishga tushdi", settings.PROJECT_NAME)
    try:
        yield
    finally:
        task.cancel()
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
