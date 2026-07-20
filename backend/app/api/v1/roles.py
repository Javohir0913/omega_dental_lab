from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func, select

from app.core.deps import DbDep, require
from app.models import LogCategory, Permission, Role, User
from app.schemas.common import Msg
from app.schemas.user import PermissionOut, RoleCreate, RoleOut, RoleUpdate
from app.services.logger import log_activity
from app.services.sessions import active_sessions, revoke_session

router = APIRouter(prefix="/roles", tags=["roles"])


@router.get("/permissions", response_model=list[PermissionOut])
async def list_permissions(db: DbDep, _: Annotated[User, Depends(require("admin.roles"))]):
    """Huquqlar reestri — adminkadagi matritsa uchun."""
    res = await db.execute(select(Permission).order_by(Permission.group_ru, Permission.id))
    return [PermissionOut.model_validate(p) for p in res.scalars().all()]


@router.get("", response_model=list[RoleOut])
async def list_roles(db: DbDep, _: Annotated[User, Depends(require("user.view", "admin.roles", any_of=True))]):
    res = await db.execute(select(Role).order_by(Role.id))
    return [RoleOut.model_validate(r) for r in res.scalars().all()]


@router.post("", response_model=RoleOut, status_code=201)
async def create_role(
    body: RoleCreate,
    request: Request,
    db: DbDep,
    actor: Annotated[User, Depends(require("admin.roles"))],
):
    res = await db.execute(select(Role).where(Role.code == body.code))
    if res.scalar_one_or_none() is not None:
        raise HTTPException(409, "role_code_taken")
    if body.code == "super_admin":
        raise HTTPException(400, "reserved_code")

    role = Role(
        code=body.code,
        name_ru=body.name_ru,
        name_uz=body.name_uz,
        default_session_limit=body.default_session_limit,
        is_system=False,
    )
    db.add(role)
    await db.flush()

    res = await db.execute(select(Permission).where(Permission.code.in_(body.permission_codes)))
    role.permissions = list(res.scalars().all())

    await log_activity(
        db,
        action="admin.role_created",
        category=LogCategory.ADMIN,
        actor=actor,
        entity="role",
        entity_id=role.id,
        message_ru=f"Создана роль «{role.name_ru}»",
        message_uz=f"«{role.name_uz}» roli yaratildi",
        meta={"permissions": body.permission_codes},
        request=request,
    )
    await db.commit()
    await db.refresh(role)
    return RoleOut.model_validate(role)


@router.patch("/{role_id}", response_model=RoleOut)
async def update_role(
    role_id: int,
    body: RoleUpdate,
    request: Request,
    db: DbDep,
    actor: Annotated[User, Depends(require("admin.roles"))],
):
    res = await db.execute(select(Role).where(Role.id == role_id))
    role = res.scalar_one_or_none()
    if role is None:
        raise HTTPException(404, "role_not_found")
    if role.code == "super_admin":
        raise HTTPException(400, "super_admin_immutable")

    data = body.model_dump(exclude_unset=True)
    perm_codes = data.pop("permission_codes", None)

    if role.is_system and data.get("is_active") is False:
        raise HTTPException(400, "system_role_cannot_be_disabled")

    old_perms = sorted(role.perm_codes)
    for k, v in data.items():
        setattr(role, k, v)

    if perm_codes is not None:
        res = await db.execute(select(Permission).where(Permission.code.in_(perm_codes)))
        role.permissions = list(res.scalars().all())

    await log_activity(
        db,
        action="admin.role_updated",
        category=LogCategory.ADMIN,
        actor=actor,
        entity="role",
        entity_id=role.id,
        message_ru=f"Изменена роль «{role.name_ru}»",
        message_uz=f"«{role.name_uz}» roli o'zgartirildi",
        meta={
            "fields": data,
            "permissions": {"from": old_perms, "to": sorted(role.perm_codes)}
            if perm_codes is not None
            else None,
        },
        request=request,
    )
    await db.commit()
    await db.refresh(role)
    return RoleOut.model_validate(role)


@router.delete("/{role_id}", response_model=Msg)
async def delete_role(
    role_id: int,
    request: Request,
    db: DbDep,
    actor: Annotated[User, Depends(require("admin.roles"))],
):
    res = await db.execute(select(Role).where(Role.id == role_id))
    role = res.scalar_one_or_none()
    if role is None:
        raise HTTPException(404, "role_not_found")
    if role.is_system:
        raise HTTPException(400, "system_role_cannot_be_deleted")

    res = await db.execute(select(func.count(User.id)).where(User.role_id == role_id))
    if (res.scalar() or 0) > 0:
        raise HTTPException(409, "role_in_use")

    name = role.name_ru
    await db.delete(role)
    await log_activity(
        db,
        action="admin.role_deleted",
        category=LogCategory.ADMIN,
        actor=actor,
        entity="role",
        entity_id=role_id,
        message_ru=f"Удалена роль «{name}»",
        message_uz=f"«{name}» roli o'chirildi",
        request=request,
    )
    await db.commit()
    return Msg(detail="role_deleted")


@router.post("/{role_id}/logout-users", response_model=Msg)
async def logout_role_users(
    role_id: int,
    request: Request,
    db: DbDep,
    actor: Annotated[User, Depends(require("admin.roles", "user.session"))],
):
    """Rol huquqlari o'zgargach shu roldagilarni qayta kirishga majburlash."""
    res = await db.execute(select(User).where(User.role_id == role_id))
    count = 0
    for user in res.scalars().all():
        for s in await active_sessions(db, user.id):
            await revoke_session(db, s, "role_changed")
            count += 1
    await log_activity(
        db,
        action="admin.role_logout_users",
        category=LogCategory.ADMIN,
        actor=actor,
        entity="role",
        entity_id=role_id,
        message_ru=f"Завершено сессий: {count}",
        message_uz=f"Uzilgan sessiyalar: {count}",
        request=request,
    )
    await db.commit()
    return Msg(detail=f"revoked_{count}")
