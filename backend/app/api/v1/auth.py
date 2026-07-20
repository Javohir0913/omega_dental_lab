from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy import select

from app.core.config import settings
from app.core.deps import CurrentUser, DbDep
from app.core.security import (
    REFRESH,
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    new_jti,
    now_utc,
    verify_password,
)
from app.models import LogCategory, LogLevel, User, UserSession
from app.schemas.auth import LoginIn, RefreshIn, TokenOut, TokenPair
from app.schemas.common import Msg
from app.schemas.user import Me, PasswordChange, ProfileUpdate
from app.services.logger import log_activity
from app.services.sessions import (
    SessionLimitReached,
    create_session,
    revoke_session,
)
from app.services.sessions import enforce_limit

router = APIRouter(prefix="/auth", tags=["auth"])


def me_payload(user: User) -> Me:
    data = Me.model_validate(user)
    data.is_super = user.is_super
    data.permissions = sorted(user.role.perm_codes) if user.role else []
    return data


@router.post("/login", response_model=TokenPair)
async def login(body: LoginIn, request: Request, db: DbDep):
    res = await db.execute(select(User).where(User.username == body.username))
    user = res.scalar_one_or_none()

    if user is None or not verify_password(body.password, user.password_hash):
        await log_activity(
            db,
            action="auth.login",
            category=LogCategory.AUTH,
            level=LogLevel.WARNING,
            is_success=False,
            actor_name=body.username,
            message_ru=f"Неудачный вход: {body.username}",
            message_uz=f"Muvaffaqiyatsiz kirish: {body.username}",
            request=request,
            commit=True,
        )
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid_credentials")

    if not user.is_active:
        await log_activity(
            db,
            action="auth.login",
            category=LogCategory.AUTH,
            level=LogLevel.WARNING,
            is_success=False,
            actor=user,
            message_ru="Вход заблокированного сотрудника",
            message_uz="Bloklangan xodim kirishga urindi",
            request=request,
            commit=True,
        )
        raise HTTPException(status.HTTP_403_FORBIDDEN, "user_inactive")

    try:
        revoked = await enforce_limit(db, user)
    except SessionLimitReached as e:
        await log_activity(
            db,
            action="auth.session_limit",
            category=LogCategory.AUTH,
            level=LogLevel.WARNING,
            is_success=False,
            actor=user,
            message_ru=f"Превышен лимит сессий ({e.active}/{e.limit})",
            message_uz=f"Sessiya limiti oshdi ({e.active}/{e.limit})",
            meta={"limit": e.limit, "active": e.active},
            request=request,
            commit=True,
        )
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail={"error": "session_limit", "limit": e.limit, "active": e.active},
        ) from e

    jti = new_jti()
    await create_session(db, user, jti, request)
    user.last_login_at = now_utc()

    await log_activity(
        db,
        action="auth.login",
        category=LogCategory.AUTH,
        actor=user,
        message_ru="Вход в систему",
        message_uz="Tizimga kirish",
        meta={"revoked_sessions": [s.id for s in revoked]} if revoked else None,
        request=request,
    )
    await db.commit()
    await db.refresh(user)

    return TokenPair(
        access_token=create_access_token(user.id, jti),
        refresh_token=create_refresh_token(user.id, jti),
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=me_payload(user),
    )


@router.post("/refresh", response_model=TokenOut)
async def refresh(body: RefreshIn, db: DbDep):
    payload = decode_token(body.refresh_token, REFRESH)
    if payload is None:
        raise HTTPException(401, "invalid_token")

    jti = payload.get("jti")
    res = await db.execute(select(UserSession).where(UserSession.jti == jti))
    session = res.scalar_one_or_none()
    if session is None or session.revoked_at is not None or session.expires_at <= now_utc():
        raise HTTPException(401, "session_revoked")

    session.last_seen_at = now_utc()
    await db.commit()

    return TokenOut(
        access_token=create_access_token(session.user_id, jti),
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.post("/logout", response_model=Msg)
async def logout(request: Request, db: DbDep, user: CurrentUser):
    session: UserSession = request.state.session
    await revoke_session(db, session, "logout", notify=False)
    await log_activity(
        db,
        action="auth.logout",
        category=LogCategory.AUTH,
        actor=user,
        message_ru="Выход из системы",
        message_uz="Tizimdan chiqish",
        request=request,
    )
    await db.commit()
    return Msg(detail="logged_out")


@router.get("/me", response_model=Me)
async def me(user: CurrentUser):
    return me_payload(user)


@router.patch("/me", response_model=Me)
async def update_me(body: ProfileUpdate, request: Request, db: DbDep, user: CurrentUser):
    data = body.model_dump(exclude_unset=True)
    if "lang" in data and data["lang"] not in ("ru", "uz"):
        data.pop("lang")
    for k, v in data.items():
        setattr(user, k, v)
    await log_activity(
        db,
        action="user.profile_updated",
        category=LogCategory.USER,
        actor=user,
        entity="user",
        entity_id=user.id,
        message_ru="Профиль обновлён",
        message_uz="Profil yangilandi",
        meta=data,
        request=request,
    )
    await db.commit()
    await db.refresh(user)
    return me_payload(user)


@router.post("/change-password", response_model=Msg)
async def change_password(body: PasswordChange, request: Request, db: DbDep, user: CurrentUser):
    if not verify_password(body.old_password, user.password_hash):
        await log_activity(
            db,
            action="user.password_change",
            category=LogCategory.USER,
            level=LogLevel.WARNING,
            is_success=False,
            actor=user,
            entity="user",
            entity_id=user.id,
            message_ru="Неверный текущий пароль",
            message_uz="Joriy parol noto'g'ri",
            request=request,
            commit=True,
        )
        raise HTTPException(400, "wrong_password")

    user.password_hash = hash_password(body.new_password)

    # o'zining joriy sessiyasidan boshqa hammasini uzamiz
    current: UserSession = request.state.session
    res = await db.execute(
        select(UserSession).where(
            UserSession.user_id == user.id,
            UserSession.revoked_at.is_(None),
            UserSession.id != current.id,
        )
    )
    for s in res.scalars().all():
        await revoke_session(db, s, "password_changed")

    await log_activity(
        db,
        action="user.password_change",
        category=LogCategory.USER,
        actor=user,
        entity="user",
        entity_id=user.id,
        message_ru="Пароль изменён",
        message_uz="Parol o'zgartirildi",
        request=request,
    )
    await db.commit()
    return Msg(detail="password_changed")
