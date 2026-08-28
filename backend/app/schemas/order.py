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
    closed_at: datetime | None = None
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
    can_move_back: bool = False
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
    # Bosqich dedlaynigacha qolgan vaqt. Ish kalendari yoqilgan bo'lsa — faqat ISH
    # sekundlari (dam kuni/tun sanalmaydi), shuning uchun dam kunlari kamaymaydi.
    # Manfiy — kechikish. Pauzada — muzlatilgan qoldiq.
    stage_remaining_seconds: int | None = None
    # Hozir vaqt to'xtab turibdi (dam kuni / bayram / ish soatidan tashqari)
    deadline_paused: bool = False
    # Nega to'xtagan: holiday | weekend | off_hours
    deadline_pause_reason: str | None = None
    # Control (majburiy tekshiruv): pending | None
    control_status: str | None = None
    control_controller: UserShort | None = None
    control_target_stage_id: int | None = None
    can_approve_control: bool = False


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
    title: str = Field(default="", max_length=160)
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


class ControlRequest(BaseModel):
    target_stage_id: int
    controller_id: int
    comment: str | None = None
    # target_stage'ga o'tishda talab qilinishi mumkin bo'lgan maydonlar — move_order bilan bir xil
    next_responsible_id: int | None = None
    fields: dict = {}
    custom_fields: dict = {}


class ControlDecision(BaseModel):
    comment: str | None = None


class ControlReject(BaseModel):
    comment: str = Field(min_length=1, max_length=2000)


class OrderControlOut(ORMModel):
    id: int
    order_id: int
    from_stage_id: int
    from_stage_name_ru: str = ""
    from_stage_name_uz: str = ""
    target_stage_id: int
    target_stage_name_ru: str = ""
    target_stage_name_uz: str = ""
    controller: UserShort | None = None
    requested_by: UserShort | None = None
    requested_at: datetime
    comment: str | None = None
    status: str
    resolved_at: datetime | None = None
    resolved_comment: str | None = None


class WorkCalendarStatus(BaseModel):
    """Ish kalendarining joriy holati — interfeysda «vaqt to'xtagan» belgisi uchun."""

    enabled: bool
    working_now: bool
    reason: str | None = None  # holiday | weekend | off_hours
    holiday_name_ru: str | None = None
    holiday_name_uz: str | None = None
    resumes_at: datetime | None = None
    work_hour_start: str = "09:00"
    work_hour_end: str = "18:00"


class KanbanColumn(BaseModel):
    stage: StageOut
    total: int
    orders: list[OrderCard]


class KanbanOut(BaseModel):
    columns: list[KanbanColumn]


class KanbanCursor(BaseModel):
    id: int
    closed_at: datetime | None = None
    control_rank: int | None = None
    priority: int | None = None
    sort: int | None = None


class KanbanColumnPage(BaseModel):
    """Kanban ustunini keyset (cursor) bo'yicha sahifalash — real-time o'zgarishlarda
    kartalar takrorlanib yoki tushib qolmasligi uchun offset o'rniga ishlatiladi."""

    items: list[OrderCard]
    total: int
    next_cursor: KanbanCursor | None = None
