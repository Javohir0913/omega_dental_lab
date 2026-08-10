from datetime import date, datetime

from pydantic import BaseModel, Field

from app.schemas.common import ORMModel


# ---------- Stage ----------

class StageOut(ORMModel):
    id: int
    code: str
    name_ru: str
    name_uz: str
    kind: str
    color: str
    sort: int
    is_active: bool
    duration_hours: int | None = None
    allow_claim: bool
    require_next_assignee: bool
    next_stage_ids: list[int] = []
    incoming_stage_ids: list[int] = []


class StageCreate(BaseModel):
    code: str = Field(min_length=2, max_length=48, pattern=r"^[a-z][a-z0-9_]*$")
    name_ru: str
    name_uz: str
    color: str = "#64748b"
    sort: int = 100
    duration_hours: int | None = None
    allow_claim: bool = True
    require_next_assignee: bool = False
    next_stage_ids: list[int] = []
    incoming_stage_ids: list[int] = []


class StageUpdate(BaseModel):
    name_ru: str | None = None
    name_uz: str | None = None
    color: str | None = None
    sort: int | None = None
    is_active: bool | None = None
    duration_hours: int | None = None
    allow_claim: bool | None = None
    require_next_assignee: bool | None = None
    next_stage_ids: list[int] | None = None
    incoming_stage_ids: list[int] | None = None


class StageReorder(BaseModel):
    """Kanban ustunlari tartibi: [{"id": 3, "sort": 100}, ...]"""

    items: list[dict]


# ---------- Doctor ----------

class DoctorOut(ORMModel):
    id: int
    full_name: str
    phone: str | None = None
    clinic: str | None = None
    note: str | None = None
    is_active: bool
    created_at: datetime


class DoctorCreate(BaseModel):
    full_name: str = Field(min_length=2, max_length=128)
    phone: str | None = None
    clinic: str | None = None
    note: str | None = None


class DoctorUpdate(BaseModel):
    full_name: str | None = None
    phone: str | None = None
    clinic: str | None = None
    note: str | None = None
    is_active: bool | None = None


# ---------- Patient ----------

class DoctorShort(ORMModel):
    id: int
    full_name: str


class PatientOut(ORMModel):
    id: int
    full_name: str
    phone: str | None = None
    birth_date: date | None = None
    gender: str | None = None
    note: str | None = None
    is_active: bool
    doctor: DoctorShort | None = None
    created_at: datetime
    custom_fields: dict = {}


class PatientCreate(BaseModel):
    full_name: str = Field(min_length=2, max_length=128)
    phone: str | None = None
    birth_date: date | None = None
    gender: str | None = None
    note: str | None = None
    doctor_id: int | None = None
    custom_fields: dict = {}


class PatientUpdate(BaseModel):
    full_name: str | None = None
    phone: str | None = None
    birth_date: date | None = None
    gender: str | None = None
    note: str | None = None
    doctor_id: int | None = None
    is_active: bool | None = None
    custom_fields: dict | None = None


# ---------- Service ----------

class ServiceOut(ORMModel):
    id: int
    code: str | None = None
    name_ru: str
    name_uz: str
    note: str | None = None
    sort: int
    is_active: bool


class ServiceCreate(BaseModel):
    code: str | None = None
    name_ru: str = Field(min_length=2, max_length=128)
    name_uz: str = Field(min_length=2, max_length=128)
    note: str | None = None
    sort: int = 100


class ServiceUpdate(BaseModel):
    code: str | None = None
    name_ru: str | None = None
    name_uz: str | None = None
    note: str | None = None
    sort: int | None = None
    is_active: bool | None = None


class ServiceReorder(BaseModel):
    """Xizmatlar tartibi: [{"id": 3, "sort": 100}, ...]"""

    items: list[dict]
