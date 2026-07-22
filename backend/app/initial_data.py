"""Boshlang'ich ma'lumot (idempotent).

Har ishga tushishda xavfsiz qayta chaqirilishi mumkin: mavjud yozuvlar
o'zgartirilmaydi, faqat yetishmayotgani qo'shiladi. Adminkada qilingan
sozlamalar ustidan YOZILMAYDI.
"""

import asyncio
import logging

from sqlalchemy import select

from app.core.config import settings
from app.core.permissions import PERMISSIONS, ROLE_DEFAULTS, SYSTEM_ROLES
from app.core.security import hash_password
from app.db.session import AsyncSessionLocal
from app.models import (
    DEFAULT_SETTINGS,
    Holiday,
    Permission,
    Role,
    Setting,
    Stage,
    StageKind,
    User,
)

DEFAULT_HOLIDAYS: list[tuple[int, int, str, str]] = [
    (1, 1, "Новый год", "Yangi yil"),
    (1, 2, "Новый год (2-й день)", "Yangi yil (2-kun)"),
    (1, 14, "День защитников Родины", "Vatan himoyachilari kuni"),
    (3, 8, "Международный женский день", "Xalqaro xotin-qizlar kuni"),
    (3, 21, "Навруз", "Navro'z"),
]

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
log = logging.getLogger("seed")

# (code, name_ru, name_uz, kind, color, sort, duration_hours)
DEFAULT_STAGES = [
    ("new", "Новый", "Yangi", StageKind.NEW, "#64748b", 0, None),
    ("model", "Модель", "Model", StageKind.WORK, "#0ea5e9", 100, 24),
    ("modelshik", "Модельщик", "Modelshik", StageKind.WORK, "#6366f1", 200, 24),
    ("peresovka", "Пересовщик", "Peresovshik", StageKind.WORK, "#8b5cf6", 300, 24),
    ("karkas", "Каркасщик", "Karkasshik", StageKind.WORK, "#d946ef", 400, 24),
    ("keramist", "Керамист", "Keramist", StageKind.WORK, "#f59e0b", 500, 48),
    ("ready", "Готово к выдаче", "Topshirishga tayyor", StageKind.WORK, "#14b8a6", 600, None),
    ("success", "Успех", "Muvaffaqiyat", StageKind.SUCCESS, "#22c55e", 9000, None),
    ("fail", "Провал", "Muvaffaqiyatsiz", StageKind.FAIL, "#ef4444", 9100, None),
]

DEFAULT_SERVICES = [
    ("MK", "Металлокерамика", "Metallokeramika"),
    ("ZR", "Цирконий", "Sirkoniy"),
    ("BUGEL", "Бюгельный протез", "Bugel protez"),
    ("PLAST", "Пластиночный протез", "Plastinkali protez"),
    ("VINIR", "Винир", "Vinir"),
    ("INLAY", "Вкладка", "Qo'yilma"),
]


async def seed_permissions(db) -> None:  # noqa: ANN001
    res = await db.execute(select(Permission))
    existing = {p.code: p for p in res.scalars().all()}
    added = 0
    for p in PERMISSIONS:
        row = existing.get(p.code)
        if row is None:
            db.add(
                Permission(
                    code=p.code,
                    group_ru=p.group_ru, group_uz=p.group_uz,
                    name_ru=p.name_ru, name_uz=p.name_uz,
                )
            )
            added += 1
        else:
            # nomlarni kodga moslab yangilaymiz (huquq bog'lanishlariga tegmasdan)
            row.group_ru, row.group_uz = p.group_ru, p.group_uz
            row.name_ru, row.name_uz = p.name_ru, p.name_uz
    await db.flush()
    if added:
        log.info("Huquqlar qo'shildi: %s", added)


async def seed_roles(db) -> None:  # noqa: ANN001
    res = await db.execute(select(Permission))
    perms = {p.code: p for p in res.scalars().all()}

    for code, name_ru, name_uz in SYSTEM_ROLES:
        res = await db.execute(select(Role).where(Role.code == code))
        role = res.scalar_one_or_none()
        if role is None:
            # Huquqlarni flush'dan OLDIN beramiz: flush'dan keyin biriktirsak,
            # SQLAlchemy bo'sh kolleksiyani lazy-load qilmoqchi bo'lib
            # async kontekstda MissingGreenlet beradi.
            granted = [perms[c] for c in ROLE_DEFAULTS.get(code, []) if c in perms]
            role = Role(
                code=code, name_ru=name_ru, name_uz=name_uz, is_system=True,
                default_session_limit=1 if code == "technician" else 2,
                permissions=granted,
            )
            db.add(role)
            await db.flush()
            log.info("Rol yaratildi: %s (%s huquq)", code, len(granted))
        else:
            role.is_system = True
            if code == "super_admin":
                # super admin doimo hamma huquqqa ega bo'lib ko'rinsin
                role.permissions = list(perms.values())
    await db.flush()


async def seed_stages(db) -> None:  # noqa: ANN001
    for code, ru, uz, kind, color, sort, dur in DEFAULT_STAGES:
        res = await db.execute(select(Stage).where(Stage.code == code))
        if res.scalar_one_or_none() is not None:
            continue
        db.add(
            Stage(
                code=code, name_ru=ru, name_uz=uz, kind=kind, color=color,
                sort=sort, duration_hours=dur,
                allow_claim=kind == StageKind.WORK,
            )
        )
        log.info("Bosqich qo'shildi: %s", ru)
    await db.flush()


async def seed_services(db) -> None:  # noqa: ANN001
    from app.models import Service

    res = await db.execute(select(Service))
    if res.scalars().first() is not None:
        return
    for i, (code, ru, uz) in enumerate(DEFAULT_SERVICES):
        db.add(Service(code=code, name_ru=ru, name_uz=uz, sort=(i + 1) * 10))
    await db.flush()
    log.info("Xizmatlar qo'shildi: %s", len(DEFAULT_SERVICES))


async def seed_settings(db) -> None:  # noqa: ANN001
    for key, (value, desc) in DEFAULT_SETTINGS.items():
        res = await db.execute(select(Setting).where(Setting.key == key))
        if res.scalar_one_or_none() is None:
            db.add(Setting(key=key, value=value, description=desc))
    await db.flush()


async def seed_holidays(db) -> None:  # noqa: ANN001
    for month, day, name_ru, name_uz in DEFAULT_HOLIDAYS:
        res = await db.execute(
            select(Holiday).where(
                Holiday.month == month, Holiday.day == day, Holiday.year.is_(None)
            )
        )
        if res.scalar_one_or_none() is None:
            db.add(Holiday(month=month, day=day, year=None, name_ru=name_ru, name_uz=name_uz))
    await db.flush()


async def seed_superadmin(db) -> None:  # noqa: ANN001
    res = await db.execute(select(Role).where(Role.code == "super_admin"))
    role = res.scalar_one()

    res = await db.execute(select(User).where(User.role_id == role.id))
    if res.scalars().first() is not None:
        return

    user = User(
        username=settings.FIRST_SUPERADMIN_USERNAME,
        password_hash=hash_password(settings.FIRST_SUPERADMIN_PASSWORD),
        full_name=settings.FIRST_SUPERADMIN_NAME,
        role_id=role.id,
        lang=settings.DEFAULT_LANG,
        session_limit=0,  # super admin — cheksiz
        is_active=True,
    )
    db.add(user)
    await db.flush()
    log.warning(
        "SUPER ADMIN yaratildi: login=%s parol=%s  <-- birinchi kirishdan keyin o'zgartiring!",
        settings.FIRST_SUPERADMIN_USERNAME, settings.FIRST_SUPERADMIN_PASSWORD,
    )


async def main() -> None:
    async with AsyncSessionLocal() as db:
        await seed_permissions(db)
        await seed_roles(db)
        await seed_stages(db)
        await seed_services(db)
        await seed_settings(db)
        await seed_holidays(db)
        await seed_superadmin(db)
        await db.commit()
    log.info("Seed tayyor.")


if __name__ == "__main__":
    asyncio.run(main())
