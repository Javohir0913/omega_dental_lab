from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class FileEntity:
    ORDER = "order"
    MESSAGE = "message"
    PATIENT = "patient"
    USER = "user"

    ALL = (ORDER, MESSAGE, PATIENT, USER)


class FileAsset(Base):
    __tablename__ = "files"

    id: Mapped[int] = mapped_column(primary_key=True)
    entity: Mapped[str] = mapped_column(String(16), index=True)
    entity_id: Mapped[int] = mapped_column(index=True)

    name: Mapped[str] = mapped_column(String(255))          # original nom
    path: Mapped[str] = mapped_column(String(512))          # diskdagi nisbiy yo'l
    mime: Mapped[str | None] = mapped_column(String(128), nullable=True)
    size: Mapped[int] = mapped_column(BigInteger, default=0)
    is_image: Mapped[bool] = mapped_column(default=False)
    # bosqichga bog'lab qo'yish (qaysi bosqichda yuklangan)
    stage_id: Mapped[int | None] = mapped_column(
        ForeignKey("stages.id", ondelete="SET NULL"), nullable=True
    )

    uploaded_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    uploaded_by: Mapped["User | None"] = relationship(lazy="selectin")  # noqa: F821
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
