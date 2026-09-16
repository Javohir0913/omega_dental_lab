import json
import logging
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Setting
from app.realtime.hub import hub

log = logging.getLogger(__name__)

# `get_setting` deyarli har so'rovda (kanban, ro'yxat, ish kalendari, claim/move
# tekshiruvlari...) bir necha marta chaqiriladi, lekin sozlamalar o'zi juda kam
# o'zgaradi — shuning uchun Redis'da (worker'lar orasida umumiy) qisqa muddatga
# keshlanadi. `set_setting` yozganda keshni darhol o'chiradi; shunga qaramay TTL
# qisqa (30s) ushlanadi — chunki `set_setting` odatda callerning commit()idan OLDIN
# chaqiriladi, demak invalidatsiya bilan commit orasidagi juda tor oynada boshqa
# so'rov eski qiymatni o'qib ulgurib qayta keshlab qo'yishi nazariy mumkin;
# sozlamalar kamdan-kam va odatda bitta admin tomonidan o'zgartirilgani uchun bu
# amalda deyarli hech qachon yuz bermaydi, TTL esa har qanday holatda ham
# eskirishni 30 soniyagacha chegaralaydi.
_CACHE_PREFIX = "omega:setting:"
_CACHE_TTL_SEC = 30


async def get_setting(db: AsyncSession, key: str, default: Any = None) -> Any:
    redis = hub._redis
    cache_key = f"{_CACHE_PREFIX}{key}"

    if redis is not None:
        try:
            cached = await redis.get(cache_key)
        except Exception:
            cached = None
        if cached is not None:
            try:
                parsed = json.loads(cached)
                return parsed["v"] if parsed["has"] else default
            except Exception:
                pass  # buzilgan kesh yozuvi — DB'dan o'qishga o'tamiz

    res = await db.execute(select(Setting).where(Setting.key == key))
    row = res.scalar_one_or_none()
    has_value = row is not None and row.value is not None
    value = row.value.get("v") if has_value else None

    if redis is not None:
        try:
            await redis.set(
                cache_key, json.dumps({"has": has_value, "v": value}, default=str), ex=_CACHE_TTL_SEC
            )
        except Exception:
            log.warning("Setting keshga yozilmadi (%s)", key)

    return value if has_value else default


async def set_setting(db: AsyncSession, key: str, value: Any, description: str | None = None) -> None:
    res = await db.execute(select(Setting).where(Setting.key == key))
    row = res.scalar_one_or_none()
    if row is None:
        row = Setting(key=key, value={"v": value}, description=description)
        db.add(row)
    else:
        row.value = {"v": value}
        if description:
            row.description = description
    await db.flush()

    if hub._redis is not None:
        try:
            await hub._redis.delete(f"{_CACHE_PREFIX}{key}")
        except Exception:
            log.warning("Setting keshi tozalanmadi (%s)", key)


async def all_settings(db: AsyncSession) -> dict[str, Any]:
    res = await db.execute(select(Setting))
    return {r.key: (r.value or {}).get("v") for r in res.scalars().all()}
