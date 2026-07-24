from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.catalog import ServiceOut, StageOut
from app.schemas.common import ORMModel
from app.schemas.user import UserShort


class PatientShort(ORMModel):
    id: int
    full_name: str
    phone: str | None = None


class DoctorShort(ORMModel):
    id: int
    full_name: str


class FileOut(ORMModel):
    id: int
    name: str
    mime: str | None = None
    size: int
    is_image: bool
    url: str = ""
    uploaded_by: UserShort | None = None
    created_at: datetime


class OrderCard(ORMModel):
    """Kanban kartasi — yengil variant."""

    id: int
    number: str
    title: str
    stage_id: int
    priority: int
    sort: int
    is_closed: bool
    color: str | None = None
    deadline: datetime | None = None
    stage_deadline: datetime | None = None
    stage_entered_at: datetime | None = None
    created_at: datetime
    patient: PatientShort | None = None
    doctor: DoctorShort | None = None
    responsible: UserShort | None = None
    services: list[ServiceOut] = []
    custom_fields: dict = {}
    photo: FileOut | None = None
    teeth: list[int] | None = None
    is_overdue: bool = False
    can_move: bool = False
    can_claim: bool = False
    files_count: int = 0
    has_3d_files: bool = False
    unread_messages: int = 0
    unread_files_count: int = 0
    deleted_at: datetime | None = None
    is_paused: bool = False
    paused_at: datetime | None = None
    pause_reason: str | None = None
    paused_by: UserShort | None = None
    can_resume: bool = False


class OrderDetail(OrderCard):
    description: str | None = None
    close_reason: str | None = None
    closed_at: datetime | None = None
    created_by: UserShort | None = None
    stage: StageOut | None = None
    chat_id: int | None = None
    files: list[FileOut] = []


class StageHistoryOut(ORMModel):
    id: int
    stage_id: int
    stage_name_ru: str = ""
    stage_name_uz: str = ""
    responsible: UserShort | None = None
    moved_by: UserShort | None = None
    entered_at: datetime
    left_at: datetime | None = None
    duration_sec: int | None = None
    was_overdue: bool
    comment: str | None = None


class OrderCreate(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    patient_id: int | None = None
    doctor_id: int | None = None
    service_ids: list[int] = []
    deadline: datetime | None = None
    priority: int = 500
    description: str | None = None
    color: str | None = None
    responsible_id: int | None = None
    stage_id: int | None = None  # bo'sh -> «Новый»
    photo_file_id: int | None = None
    teeth: list[int] = []
    custom_fields: dict = {}


class OrderUpdate(BaseModel):
    title: str | None = None
    patient_id: int | None = None
    doctor_id: int | None = None
    service_ids: list[int] | None = None
    deadline: datetime | None = None
    priority: int | None = None
    description: str | None = None
    color: str | None = None
    photo_file_id: int | None = None
    teeth: list[int] | None = None
    custom_fields: dict | None = None


class OrderMove(BaseModel):
    stage_id: int
    # keyingi bosqichni kim bajarishini joriy bajaruvchi shu yerda belgilaydi
    next_responsible_id: int | None = None
    comment: str | None = None
    # majburiy maydonlarni shu ko'chirishning o'zida to'ldirish (modal orqali)
    fields: dict = {}
    custom_fields: dict = {}
    sort: int | None = None


class OrderAssign(BaseModel):
    user_id: int | None = None


class OrderPause(BaseModel):
    reason: str = Field(min_length=1, max_length=2000)


class KanbanColumn(BaseModel):
    stage: StageOut
    total: int
    orders: list[OrderCard]


class KanbanOut(BaseModel):
    columns: list[KanbanColumn]
