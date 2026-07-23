from sqlalchemy import Boolean, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class FieldType:
    STRING = "string"
    TEXT = "text"
    INT = "int"
    DECIMAL = "decimal"
    DATE = "date"
    DATETIME = "datetime"
    BOOL = "bool"
    SELECT = "select"
    MULTISELECT = "multiselect"
    USER = "user"
    FILE = "file"

    ALL = (STRING, TEXT, INT, DECIMAL, DATE, DATETIME, BOOL, SELECT, MULTISELECT, USER, FILE)


class FieldEntity:
    ORDER = "order"
    PATIENT = "patient"
    DOCTOR = "doctor"
    USER = "user"

    ALL = (ORDER, PATIENT, DOCTOR, USER)


class CustomField(Base, TimestampMixin):
    """Adminkadan qo'shiladigan qo'shimcha maydon ("polya")."""

    __tablename__ = "custom_fields"
    __table_args__ = (UniqueConstraint("entity", "code", name="uq_custom_fields_entity_code"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    entity: Mapped[str] = mapped_column(String(16), index=True)  # FieldEntity
    code: Mapped[str] = mapped_column(String(48))
    label_ru: Mapped[str] = mapped_column(String(128))
    label_uz: Mapped[str] = mapped_column(String(128))
    type: Mapped[str] = mapped_column(String(16))  # FieldType
    # SELECT/MULTISELECT uchun: [{"value": "a", "label_ru": "...", "label_uz": "..."}]
    options: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    default_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    hint_ru: Mapped[str | None] = mapped_column(String(255), nullable=True)
    hint_uz: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # yaratish formasida majburiymi (bosqichga bog'liq bo'lmagan umumiy talab)
    required_on_create: Mapped[bool] = mapped_column(Boolean, default=False)
    show_in_card: Mapped[bool] = mapped_column(Boolean, default=True)   # kanban kartasida
    show_in_list: Mapped[bool] = mapped_column(Boolean, default=False)  # ro'yxatda ustun
    sort: Mapped[int] = mapped_column(Integer, default=100)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class CustomFieldValue(Base):
    __tablename__ = "custom_field_values"
    __table_args__ = (
        UniqueConstraint("field_id", "entity_id", name="uq_cfv_field_entity"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    field_id: Mapped[int] = mapped_column(
        ForeignKey("custom_fields.id", ondelete="CASCADE"), index=True
    )
    entity_id: Mapped[int] = mapped_column(Integer, index=True)
    # barcha turlar JSON sifatida saqlanadi: {"v": ...}
    value: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    field: Mapped[CustomField] = relationship(lazy="selectin")


class RequirementMoment:
    """Majburiylik qachon tekshiriladi."""

    CREATE = "create"        # proyekt yaratilayotganda
    MOVE_IN = "move_in"      # bosqichga KIRAYOTGANDA
    MOVE_OUT = "move_out"    # bosqichdan CHIQAYOTGANDA (ish tugadi)

    ALL = (CREATE, MOVE_IN, MOVE_OUT)


class StageRequirement(Base, TimestampMixin):
    """Bosqich almashtirishda majburiy maydon.

    `field_ref` ikki xil bo'ladi:
      - "sys:<name>"  -> tizim maydoni (title, patient_id, doctor_id, deadline,
                         services, responsible_id, description)
      - "cf:<id>"     -> custom_fields.id
    """

    __tablename__ = "stage_requirements"
    __table_args__ = (
        UniqueConstraint("stage_id", "field_ref", "moment", name="uq_stage_req"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    # CREATE momenti uchun stage_id = proyekt yaratiladigan bosqich (odatda "new")
    stage_id: Mapped[int] = mapped_column(ForeignKey("stages.id", ondelete="CASCADE"), index=True)
    field_ref: Mapped[str] = mapped_column(String(64))
    moment: Mapped[str] = mapped_column(String(16), default=RequirementMoment.MOVE_IN)
    # xato matni (bo'sh bo'lsa avtomatik generatsiya qilinadi)
    message_ru: Mapped[str | None] = mapped_column(String(255), nullable=True)
    message_uz: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


SYSTEM_ORDER_FIELDS = [
    ("sys:title", "Название проекта", "Proyekt nomi"),
    ("sys:photo_file_id", "Фото проекта", "Proyekt rasmi"),
    ("sys:patient_id", "Пациент", "Patsent"),
    ("sys:doctor_id", "Врач", "Vrach"),
    ("sys:services", "Услуги", "Xizmatlar"),
    ("sys:teeth", "Зубная карта", "Tish sxemasi"),
    ("sys:deadline", "Дедлайн", "Dedlayn"),
    ("sys:responsible_id", "Ответственный", "Mas'ul"),
    ("sys:priority", "Приоритет", "Prioritet"),
    ("sys:description", "Описание", "Tavsif"),
    ("sys:files", "Файлы", "Fayllar"),
]
