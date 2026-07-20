from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import ACCESS, decode_token
from app.db.session import get_db
from app.models import User, UserSession

bearer = HTTPBearer(auto_error=False)

DbDep = Annotated[AsyncSession, Depends(get_db)]


def _unauth(detail: str = "not_authenticated") -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


async def get_current_user(
    request: Request,
    db: DbDep,
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)] = None,
) -> User:
    if creds is None:
        raise _unauth()

    payload = decode_token(creds.credentials, ACCESS)
    if payload is None:
        raise _unauth("invalid_token")

    jti = payload.get("jti")
    user_id = int(payload.get("sub", 0))

    # Access token amal qilsa ham, sessiya uzilgan bo'lishi mumkin
    # (limit oshgani yoki admin majburan chiqargani uchun) — har so'rovda tekshiramiz.
    res = await db.execute(select(UserSession).where(UserSession.jti == jti))
    session = res.scalar_one_or_none()
    if session is None or session.revoked_at is not None:
        raise _unauth("session_revoked")

    res = await db.execute(select(User).where(User.id == user_id))
    user = res.scalar_one_or_none()
    if user is None or not user.is_active:
        raise _unauth("user_inactive")

    request.state.session = session
    request.state.user = user
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require(*codes: str, any_of: bool = False):
    """Endpoint uchun huquq talabi.

    require("order.create")                 -> shu huquq bo'lsin
    require("a", "b")                       -> IKKALASI ham
    require("a", "b", any_of=True)          -> bittasi yetarli
    """

    async def _checker(user: CurrentUser) -> User:
        if user.is_super:
            return user
        ok = (
            any(user.has_perm(c) for c in codes)
            if any_of
            else all(user.has_perm(c) for c in codes)
        )
        if not ok:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"error": "forbidden", "required": list(codes)},
            )
        return user

    return _checker


async def require_super(user: CurrentUser) -> User:
    if not user.is_super:
        raise HTTPException(status_code=403, detail="super_admin_only")
    return user
