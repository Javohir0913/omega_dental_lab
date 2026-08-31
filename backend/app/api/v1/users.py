from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import delete, func, insert, or_, select
from sqlalchemy.orm import selectinload

from app.core.deps import CurrentUser, DbDep, require
from app.core.security import hash_password
from app.models import LogCategory, Role, Stage, User, UserSession
from app.models.catalog import stage_controllers
from app.models.user import user_services, user_stages
from app.schemas.common import Msg, Page
from app.schemas.user import (
    PasswordSet,
    SessionOut,
    UserCreate,
    UserOut,
    UserSessionsOut,
    UserUpdate,
)
from app.services.logger import log_activity
from app.services.sessions import active_sessions, revoke_session

router = APIRouter(prefix="/users", tags=["users"])


# DIQQAT: "/me/..." yo'li "/{user_id}/..." dan OLDIN e'lon qilinishi shart —
# aks holda FastAPI "me" ni user_id (int) sifatida o'qishga urinib 422 beradi.
@router.get("/me/sessions", response_model=UserSessionsOut)
async def my_sessions(request: Request, db: DbDep, user: CurrentUser):
    """O'z sessiyalarim — qo'shimcha huquq talab qilinmaydi."""
    rows = await active_sessions(db, user.id)
    current = getattr(request.state, "session", None)
    items = []
    for s in rows:
        out = SessionOut.model_validate(s)
        out.is_current = current is not None and s.id == current.id
        items.append(out)
    return UserSessionsOut(
        user_id=user.id,
        full_name=user.full_name,
        session_limit=user.session_limit,
        active_count=len(rows),
        sessions=items,
    )


@router.delete("/me/sessions/{session_id}", response_model=Msg)
async def kill_my_session(session_id: int, request: Request, db: DbDep, user: CurrentUser):
    """O'z boshqa qurilmamdagi sessiyani uzish."""
    res = await db.execute(
        select(UserSession).where(UserSession.id == session_id, UserSession.user_id == user.id)
    )
    session = res.scalar_one_or_none()
    if session is None:
        raise HTTPException(404, "session_not_found")
    await revoke_session(db, session, "revoked_by_owner")
    await log_activity(
        db,
        action="auth.session_revoked",
        category=LogCategory.AUTH,
        actor=user,
        entity="user",
        entity_id=user.id,
        message_ru=f"Сотрудник завершил свою сессию ({session.ip})",
        message_uz=f"Xodim o'z sessiyasini uzdi ({session.ip})",
        request=request,
    )
    await db.commit()
    return Msg(detail="session_revoked")


async def _get_user(db, user_id: int) -> User:  # noqa: ANN001
    res = await db.execute(select(User).where(User.id == user_id))
    user = res.scalar_one_or_none()
    if user is None:
        raise HTTPException(404, "user_not_found")
    return user


def _guard_super(actor: User, target: User) -> None:
    """Super adminni faqat super admin tahrirlay oladi."""
    if target.is_super and not actor.is_super:
        raise HTTPException(403, "cannot_touch_super_admin")


async def _apply_links(db, user: User, stage_ids, service_ids, control_stage_ids=None) -> None:  # noqa: ANN001
    """N:M bog'lanishlarni async-safe usulda yangilaydi.

    `user.stages = [...]` async kontekstda lazy load chaqirib MissingGreenlet beradi —
    shuning uchun association jadvaliga to'g'ridan-to'g'ri yozamiz.
    """
    if stage_ids is not None:
        await db.execute(delete(user_stages).where(user_stages.c.user_id == user.id))
        if stage_ids:
            await db.execute(
                insert(user_stages),
                [{"user_id": user.id, "stage_id": sid} for sid in stage_ids],
            )
    if service_ids is not None:
        await db.execute(delete(user_services).where(user_services.c.user_id == user.id))
        if service_ids:
            await db.execute(
                insert(user_services),
                [{"user_id": user.id, "service_id": sid} for sid in service_ids],
            )
    if control_stage_ids is not None:
        await db.execute(delete(stage_controllers).where(stage_controllers.c.user_id == user.id))
        if control_stage_ids:
            await db.execute(
                insert(stage_controllers),
                [{"user_id": user.id, "stage_id": sid} for sid in control_stage_ids],
            )


async def _load_user(db, user_id: int) -> User:
    # populate_existing shart: create/update_user avvalroq oddiy select(User) bilan
    # shu obyektni sessiyaga yuklab qo'ygan bo'lishi mumkin — `stages`/`services`/
    # `control_stages` lazy="selectin" bo'lgani uchun avtomatik (eski holatda) yuklanadi,
    # keyin _apply_links() xom SQL bilan jadvalni o'zgartiradi. populate_existing bo'lmasa
    # identity map'dagi eski to'plam saqlanib qolib, javobda eskirgan ro'yxat qaytadi.
    res = await db.execute(
        select(User)
        .where(User.id == user_id)
        .execution_options(populate_existing=True)
        .options(
            selectinload(User.role),
            selectinload(User.stages),
            selectinload(User.services),
            selectinload(User.control_stages),
        )
    )
    user = res.scalar_one_or_none()
    if user is None:
        raise HTTPException(404, "user_not_found")
    return user


@router.get("", response_model=Page[UserOut])
async def list_users(
    db: DbDep,
    _: Annotated[User, Depends(require("user.view", "chat.direct", "chat.order", any_of=True))],
    q: str | None = None,
    role_id: int | None = None,
    stage_id: int | None = None,
    is_active: bool | None = None,
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
):
    query = select(User)
    if q:
        like = f"%{q}%"
        query = query.where(
            or_(User.full_name.ilike(like), User.username.ilike(like), User.phone.ilike(like))
        )
    if role_id:
        query = query.where(User.role_id == role_id)
    if is_active is not None:
        query = query.where(User.is_active.is_(is_active))
    if stage_id:
        query = query.where(User.stages.any(Stage.id == stage_id))

    total = (await db.execute(select(func.count()).select_from(query.subquery()))).scalar() or 0
    res = await db.execute(
        query.order_by(User.full_name).offset((page - 1) * size).limit(size)
    )
    return Page[UserOut](
        items=[UserOut.model_validate(u) for u in res.scalars().all()],
        total=total, page=page, size=size,
    )


@router.get("/{user_id}", response_model=UserOut)
async def get_user(
    user_id: int, db: DbDep, _: Annotated[User, Depends(require("user.view"))]
):
    return UserOut.model_validate(await _get_user(db, user_id))


@router.post("", response_model=UserOut, status_code=201)
async def create_user(
    body: UserCreate,
    request: Request,
    db: DbDep,
    actor: Annotated[User, Depends(require("user.manage"))],
):
    res = await db.execute(select(User).where(User.username == body.username))
    if res.scalar_one_or_none() is not None:
        raise HTTPException(409, "username_taken")

    res = await db.execute(select(Role).where(Role.id == body.role_id))
    role = res.scalar_one_or_none()
    if role is None:
        raise HTTPException(404, "role_not_found")
    if role.code == "super_admin" and not actor.is_super:
        raise HTTPException(403, "cannot_create_super_admin")

    user = User(
        username=body.username,
        password_hash=hash_password(body.password),
        full_name=body.full_name,
        role_id=role.id,
        phone=body.phone,
        email=body.email,
        note=body.note,
        lang=body.lang,
        is_active=body.is_active,
        session_limit=(
            body.session_limit if body.session_limit is not None else role.default_session_limit
        ),
    )
    db.add(user)
    await db.flush()
    await _apply_links(db, user, body.stage_ids, body.service_ids, body.control_stage_ids)

    await log_activity(
        db,
        action="user.created",
        category=LogCategory.USER,
        actor=actor,
        entity="user",
        entity_id=user.id,
        message_ru=f"Создан сотрудник {user.full_name} ({role.name_ru})",
        message_uz=f"Xodim yaratildi: {user.full_name} ({role.name_uz})",
        meta={"username": user.username, "role": role.code},
        request=request,
    )
    await db.commit()
    return UserOut.model_validate(await _load_user(db, user.id))


@router.patch("/{user_id}", response_model=UserOut)
async def update_user(
    user_id: int,
    body: UserUpdate,
    request: Request,
    db: DbDep,
    actor: Annotated[User, Depends(require("user.manage"))],
):
    user = await _get_user(db, user_id)
    _guard_super(actor, user)

    data = body.model_dump(exclude_unset=True)
    stage_ids = data.pop("stage_ids", None)
    service_ids = data.pop("service_ids", None)
    control_stage_ids = data.pop("control_stage_ids", None)

    if "username" in data and data["username"] != user.username:
        # Super adminning login'ini hech kim (o'zi ham shu endpoint orqali emas, /auth/me
        # orqali) o'zgartira olmaydi — boshqa super adminlar ham.
        if user.is_super and user.id != actor.id:
            raise HTTPException(403, "cannot_touch_super_admin")
        res = await db.execute(
            select(User).where(User.username == data["username"], User.id != user.id)
        )
        if res.scalar_one_or_none() is not None:
            raise HTTPException(409, "username_taken")

    if "role_id" in data:
        res = await db.execute(select(Role).where(Role.id == data["role_id"]))
        role = res.scalar_one_or_none()
        if role is None:
            raise HTTPException(404, "role_not_found")
        if role.code == "super_admin" and not actor.is_super:
            raise HTTPException(403, "cannot_grant_super_admin")

    if "is_active" in data and data["is_active"] is False and user.id == actor.id:
        raise HTTPException(400, "cannot_deactivate_self")

    changes = {k: {"from": getattr(user, k), "to": v} for k, v in data.items()}
    for k, v in data.items():
        setattr(user, k, v)
    await _apply_links(db, user, stage_ids, service_ids, control_stage_ids)

    # Sessiya limiti kamaytirilsa yoki user o'chirilsa — ortiqcha sessiyalarni uzamiz
    if data.get("is_active") is False:
        for s in await active_sessions(db, user.id):
            await revoke_session(db, s, "user_deactivated")
    elif "session_limit" in data and user.session_limit > 0:
        current = await active_sessions(db, user.id)
        excess = len(current) - user.session_limit
        for s in current[:excess] if excess > 0 else []:
            await revoke_session(db, s, "limit_lowered")

    await log_activity(
        db,
        action="user.updated",
        category=LogCategory.USER,
        actor=actor,
        entity="user",
        entity_id=user.id,
        message_ru=f"Изменён сотрудник {user.full_name}",
        message_uz=f"Xodim o'zgartirildi: {user.full_name}",
        meta=changes,
        request=request,
    )
    await db.commit()
    return UserOut.model_validate(await _load_user(db, user.id))


@router.post("/{user_id}/password", response_model=Msg)
async def set_password(
    user_id: int,
    body: PasswordSet,
    request: Request,
    db: DbDep,
    actor: Annotated[User, Depends(require("user.password"))],
):
    """Admin / super admin xodimga yangi parol qo'yadi (eskisini bilmasdan)."""
    user = await _get_user(db, user_id)
    _guard_super(actor, user)

    user.password_hash = hash_password(body.new_password)
    if body.logout_everywhere:
        for s in await active_sessions(db, user.id):
            await revoke_session(db, s, "password_reset_by_admin")

    await log_activity(
        db,
        action="user.password_set",
        category=LogCategory.USER,
        actor=actor,
        entity="user",
        entity_id=user.id,
        message_ru=f"{actor.full_name} сменил пароль сотруднику {user.full_name}",
        message_uz=f"{actor.full_name} {user.full_name} ning parolini o'zgartirdi",
        meta={"logout_everywhere": body.logout_everywhere},
        request=request,
    )
    await db.commit()
    return Msg(detail="password_set")


# --------------------------------------------------------------------------
# Sessiyalar
# --------------------------------------------------------------------------


@router.get("/{user_id}/sessions", response_model=UserSessionsOut)
async def user_sessions(
    user_id: int,
    request: Request,
    db: DbDep,
    actor: Annotated[User, Depends(require("user.session"))],
    include_revoked: bool = False,
):
    user = await _get_user(db, user_id)
    query = select(UserSession).where(UserSession.user_id == user_id)
    if not include_revoked:
        query = query.where(UserSession.revoked_at.is_(None))
    res = await db.execute(query.order_by(UserSession.last_seen_at.desc()))
    rows = list(res.scalars().all())

    current_id = getattr(request.state, "session", None)
    current_id = current_id.id if current_id else None

    items = []
    for s in rows:
        out = SessionOut.model_validate(s)
        out.is_current = s.id == current_id
        items.append(out)

    return UserSessionsOut(
        user_id=user.id,
        full_name=user.full_name,
        session_limit=user.session_limit,
        active_count=sum(1 for s in rows if s.revoked_at is None),
        sessions=items,
    )


@router.delete("/{user_id}/sessions/{session_id}", response_model=Msg)
async def kill_session(
    user_id: int,
    session_id: int,
    request: Request,
    db: DbDep,
    actor: Annotated[User, Depends(require("user.session"))],
):
    res = await db.execute(
        select(UserSession).where(UserSession.id == session_id, UserSession.user_id == user_id)
    )
    session = res.scalar_one_or_none()
    if session is None:
        raise HTTPException(404, "session_not_found")

    user = await _get_user(db, user_id)
    _guard_super(actor, user)

    await revoke_session(db, session, "revoked_by_admin")
    await log_activity(
        db,
        action="auth.session_revoked",
        category=LogCategory.AUTH,
        actor=actor,
        entity="user",
        entity_id=user_id,
        message_ru=f"{actor.full_name} завершил сессию {user.full_name} ({session.ip})",
        message_uz=f"{actor.full_name} {user.full_name} sessiyasini uzdi ({session.ip})",
        meta={"session_id": session_id, "ip": session.ip, "browser": session.browser},
        request=request,
    )
    await db.commit()
    return Msg(detail="session_revoked")


@router.delete("/{user_id}/sessions", response_model=Msg)
async def kill_all_sessions(
    user_id: int,
    request: Request,
    db: DbDep,
    actor: Annotated[User, Depends(require("user.session"))],
):
    user = await _get_user(db, user_id)
    _guard_super(actor, user)

    sessions = await active_sessions(db, user_id)
    for s in sessions:
        await revoke_session(db, s, "revoked_by_admin")

    await log_activity(
        db,
        action="auth.session_revoked_all",
        category=LogCategory.AUTH,
        actor=actor,
        entity="user",
        entity_id=user_id,
        message_ru=f"{actor.full_name} завершил все сессии {user.full_name} ({len(sessions)})",
        message_uz=f"{actor.full_name} {user.full_name} ning barcha sessiyalarini uzdi ({len(sessions)})",
        request=request,
    )
    await db.commit()
    return Msg(detail=f"revoked_{len(sessions)}")
