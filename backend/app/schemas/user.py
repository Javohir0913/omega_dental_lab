from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.schemas.common import ORMModel


class PermissionOut(ORMModel):
    id: int
    code: str
    group_ru: str
    group_uz: str
    name_ru: str
    name_uz: str


class StageShort(ORMModel):
    id: int
    code: str
    name_ru: str
    name_uz: str
    kind: str
    color: str


class RoleOut(ORMModel):
    id: int
    code: str
    name_ru: str
    name_uz: str
    is_system: bool
    is_active: bool
    default_session_limit: int
    permissions: list[PermissionOut] = []
    move_stages: list[StageShort] = []


class RoleShort(ORMModel):
    id: int
    code: str
    name_ru: str
    name_uz: str


class RoleCreate(BaseModel):
    code: str = Field(min_length=2, max_length=32, pattern=r"^[a-z][a-z0-9_]*$")
    name_ru: str
    name_uz: str
    default_session_limit: int = 1
    permission_codes: list[str] = []
    move_stage_ids: list[int] = []


class RoleUpdate(BaseModel):
    name_ru: str | None = None
    name_uz: str | None = None
    is_active: bool | None = None
    default_session_limit: int | None = None
    permission_codes: list[str] | None = None
    move_stage_ids: list[int] | None = None


class ServiceShort(ORMModel):
    id: int
    name_ru: str
    name_uz: str


class UserOut(ORMModel):
    id: int
    username: str
    full_name: str
    phone: str | None = None
    email: str | None = None
    avatar: str | None = None
    note: str | None = None
    is_active: bool
    lang: str
    session_limit: int
    last_login_at: datetime | None = None
    created_at: datetime
    role: RoleShort
    stages: list[StageShort] = []
    services: list[ServiceShort] = []


class UserShort(ORMModel):
    id: int
    full_name: str
    avatar: str | None = None


class Me(UserOut):
    permissions: list[str] = []
    is_super: bool = False


class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=64, pattern=r"^[a-zA-Z0-9._-]+$")
    password: str = Field(min_length=5, max_length=128)
    full_name: str = Field(min_length=2, max_length=128)
    role_id: int
    phone: str | None = None
    email: str | None = None
    note: str | None = None
    lang: str = "ru"
    session_limit: int | None = None  # None -> rol default'i
    is_active: bool = True
    stage_ids: list[int] = []
    service_ids: list[int] = []

    @field_validator("lang")
    @classmethod
    def _lang(cls, v: str) -> str:
        return v if v in ("ru", "uz") else "ru"


class UserUpdate(BaseModel):
    username: str | None = Field(default=None, min_length=3, max_length=64, pattern=r"^[a-zA-Z0-9._-]+$")
    full_name: str | None = None
    role_id: int | None = None
    phone: str | None = None
    email: str | None = None
    note: str | None = None
    lang: str | None = None
    session_limit: int | None = None
    is_active: bool | None = None
    stage_ids: list[int] | None = None
    service_ids: list[int] | None = None


class PasswordSet(BaseModel):
    """Admin/super admin boshqa userga parol qo'yadi."""

    new_password: str = Field(min_length=5, max_length=128)
    logout_everywhere: bool = True


class PasswordChange(BaseModel):
    """User o'z parolini o'zgartiradi."""

    old_password: str
    new_password: str = Field(min_length=5, max_length=128)


class ProfileUpdate(BaseModel):
    username: str | None = Field(default=None, min_length=3, max_length=64, pattern=r"^[a-zA-Z0-9._-]+$")
    full_name: str | None = None
    phone: str | None = None
    lang: str | None = None


class SessionOut(ORMModel):
    id: int
    ip: str | None
    device: str | None
    device_name: str | None
    browser: str | None
    os: str | None
    created_at: datetime
    last_seen_at: datetime
    expires_at: datetime
    revoked_at: datetime | None
    revoked_reason: str | None
    is_current: bool = False


class UserSessionsOut(BaseModel):
    user_id: int
    full_name: str
    session_limit: int
    active_count: int
    sessions: list[SessionOut]
