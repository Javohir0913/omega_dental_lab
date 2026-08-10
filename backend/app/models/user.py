from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Table,
    Column,
    UniqueConstraint,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin

# --- N:M bog'lanishlar ---

role_permissions = Table(
    "role_permissions",
    Base.metadata,
    Column("role_id", ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
    Column("permission_id", ForeignKey("permissions.id", ondelete="CASCADE"), primary_key=True),
)

# Texnik qaysi bosqichlarni bajara oladi
user_stages = Table(
    "user_stages",
    Base.metadata,
    Column("user_id", ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    Column("stage_id", ForeignKey("stages.id", ondelete="CASCADE"), primary_key=True),
)

# Rol qaysi bosqichlarga proyektni o'tkaza oladi.
# Bosqich uchun bu yerda birorta ham qator bo'lmasa — cheklov yo'q (hammaga ochiq,
# umumiy order.move.* huquqlari yetarli). Birorta rol qo'shilgan bo'lsa — shu
# bosqichga faqat o'sha rol(lar)dagi foydalanuvchilar o'tkaza oladi.
role_move_stages = Table(
    "role_move_stages",
    Base.metadata,
    Column("role_id", ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
    Column("stage_id", ForeignKey("stages.id", ondelete="CASCADE"), primary_key=True),
)

# Texnik qaysi xizmatlarni bajara oladi
user_services = Table(
    "user_services",
    Base.metadata,
    Column("user_id", ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    Column("service_id", ForeignKey("services.id", ondelete="CASCADE"), primary_key=True),
)


class Permission(Base):
    __tablename__ = "permissions"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    group_ru: Mapped[str] = mapped_column(String(64))
    group_uz: Mapped[str] = mapped_column(String(64))
    name_ru: Mapped[str] = mapped_column(String(128))
    name_uz: Mapped[str] = mapped_column(String(128))


class Role(Base, TimestampMixin):
    __tablename__ = "roles"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    name_ru: Mapped[str] = mapped_column(String(64))
    name_uz: Mapped[str] = mapped_column(String(64))
    # tizim roli — o'chirib bo'lmaydi (super_admin, admin, hr, technician)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    # shu roldagi yangi userlarga beriladigan default sessiya limiti
    default_session_limit: Mapped[int] = mapped_column(Integer, default=1)

    permissions: Mapped[list[Permission]] = relationship(
        secondary=role_permissions, lazy="selectin"
    )
    move_stages: Mapped[list["Stage"]] = relationship(  # noqa: F821
        secondary=role_move_stages, lazy="selectin"
    )
    users: Mapped[list["User"]] = relationship(back_populates="role")

    @property
    def perm_codes(self) -> set[str]:
        return {p.code for p in self.permissions}


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    full_name: Mapped[str] = mapped_column(String(128))
    phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    email: Mapped[str | None] = mapped_column(String(128), nullable=True)
    avatar: Mapped[str | None] = mapped_column(String(255), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    role_id: Mapped[int] = mapped_column(ForeignKey("roles.id"), index=True)
    role: Mapped[Role] = relationship(back_populates="users", lazy="selectin")

    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    lang: Mapped[str] = mapped_column(String(2), default="ru")

    # HAR USERGA ALOHIDA sessiya limiti (0 = cheksiz)
    session_limit: Mapped[int] = mapped_column(Integer, default=1)

    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    stages: Mapped[list["Stage"]] = relationship(secondary=user_stages, lazy="selectin")  # noqa: F821
    services: Mapped[list["Service"]] = relationship(secondary=user_services, lazy="selectin")  # noqa: F821

    @property
    def is_super(self) -> bool:
        return self.role is not None and self.role.code == "super_admin"

    def has_perm(self, code: str) -> bool:
        if self.is_super:
            return True
        return self.role is not None and code in self.role.perm_codes


class UserSession(Base):
    """Aktiv sessiya. Refresh token jti bo'yicha identifikatsiya qilinadi."""

    __tablename__ = "user_sessions"
    __table_args__ = (UniqueConstraint("jti", name="uq_user_sessions_jti"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    jti: Mapped[str] = mapped_column(String(64), index=True)

    ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(Text, nullable=True)
    # user-agents dan parslanadi
    device: Mapped[str | None] = mapped_column(String(64), nullable=True)   # PC / Mobile / Tablet
    device_name: Mapped[str | None] = mapped_column(String(128), nullable=True)  # "Samsung SM-A515F"
    browser: Mapped[str | None] = mapped_column(String(64), nullable=True)  # "Chrome 131"
    os: Mapped[str | None] = mapped_column(String(64), nullable=True)       # "Windows 11"

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_reason: Mapped[str | None] = mapped_column(String(64), nullable=True)

    user: Mapped[User] = relationship(lazy="selectin")

    @property
    def is_active(self) -> bool:
        return self.revoked_at is None
