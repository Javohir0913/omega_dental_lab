from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Setting


async def get_setting(db: AsyncSession, key: str, default: Any = None) -> Any:
    res = await db.execute(select(Setting).where(Setting.key == key))
    row = res.scalar_one_or_none()
    if row is None or row.value is None:
        return default
    return row.value.get("v", default)


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


async def all_settings(db: AsyncSession) -> dict[str, Any]:
    res = await db.execute(select(Setting))
    return {r.key: (r.value or {}).get("v") for r in res.scalars().all()}
