import uuid
from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

ACCESS = "access"
REFRESH = "refresh"


def hash_password(raw: str) -> str:
    return pwd_context.hash(raw)


def verify_password(raw: str, hashed: str) -> bool:
    try:
        return pwd_context.verify(raw, hashed)
    except ValueError:
        return False


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _make_token(sub: str, jti: str, kind: str, expires: timedelta) -> str:
    payload = {
        "sub": sub,
        "jti": jti,
        "type": kind,
        "iat": int(now_utc().timestamp()),
        "exp": int((now_utc() + expires).timestamp()),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def new_jti() -> str:
    return uuid.uuid4().hex


def create_access_token(user_id: int, jti: str) -> str:
    return _make_token(
        str(user_id), jti, ACCESS, timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )


def create_refresh_token(user_id: int, jti: str) -> str:
    return _make_token(
        str(user_id), jti, REFRESH, timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    )


def decode_token(token: str, expected_type: str | None = None) -> dict | None:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError:
        return None
    if expected_type and payload.get("type") != expected_type:
        return None
    return payload
