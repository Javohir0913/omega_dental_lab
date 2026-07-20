from typing import Any

from pydantic import BaseModel, Field

from app.schemas.common import ORMModel


# ---------- Custom fields ----------

class CustomFieldOut(ORMModel):
    id: int
    entity: str
    code: str
    label_ru: str
    label_uz: str
    type: str
    options: list | None = None
    default_value: str | None = None
    hint_ru: str | None = None
    hint_uz: str | None = None
    required_on_create: bool
    show_in_card: bool
    show_in_list: bool
    sort: int
    is_active: bool


class CustomFieldCreate(BaseModel):
    entity: str
    code: str = Field(min_length=2, max_length=48, pattern=r"^[a-z][a-z0-9_]*$")
    label_ru: str
    label_uz: str
    type: str
    options: list | None = None
    default_value: str | None = None
    hint_ru: str | None = None
    hint_uz: str | None = None
    required_on_create: bool = False
    show_in_card: bool = True
    show_in_list: bool = False
    sort: int = 100


class CustomFieldUpdate(BaseModel):
    label_ru: str | None = None
    label_uz: str | None = None
    options: list | None = None
    default_value: str | None = None
    hint_ru: str | None = None
    hint_uz: str | None = None
    required_on_create: bool | None = None
    show_in_card: bool | None = None
    show_in_list: bool | None = None
    sort: int | None = None
    is_active: bool | None = None


# ---------- Stage requirements ----------

class StageRequirementOut(ORMModel):
    id: int
    stage_id: int
    field_ref: str
    moment: str
    message_ru: str | None = None
    message_uz: str | None = None
    is_active: bool
    label_ru: str = ""
    label_uz: str = ""


class StageRequirementCreate(BaseModel):
    stage_id: int
    field_ref: str
    moment: str
    message_ru: str | None = None
    message_uz: str | None = None


class StageRequirementUpdate(BaseModel):
    message_ru: str | None = None
    message_uz: str | None = None
    is_active: bool | None = None


class FieldRefOut(BaseModel):
    """Adminkada tanlash uchun mavjud maydonlar ro'yxati."""

    field_ref: str
    label_ru: str
    label_uz: str
    kind: str  # "system" | "custom"


# ---------- Notify templates ----------

class NotifyTemplateOut(ORMModel):
    id: int
    event: str
    stage_id: int | None = None
    is_active: bool
    recipients: list
    notify_actor: bool
    title_ru: str
    title_uz: str
    body_ru: str
    body_uz: str


class NotifyTemplateUpsert(BaseModel):
    event: str
    stage_id: int | None = None
    is_active: bool = True
    recipients: list[str] = []
    notify_actor: bool = False
    title_ru: str = ""
    title_uz: str = ""
    body_ru: str = ""
    body_uz: str = ""


class NotifyMetaOut(BaseModel):
    """Frontend uchun: qanday hodisa, qanday oluvchi tokenlari, qanday o'zgaruvchilar bor."""

    events: list[dict]
    recipient_tokens: list[dict]
    placeholders: list[dict]


# ---------- Notifications ----------

class NotificationOut(ORMModel):
    id: int
    event: str
    title: str
    body: str | None = None
    link: dict | None = None
    order_id: int | None = None
    is_read: bool
    created_at: Any


# ---------- Settings ----------

class SettingsOut(BaseModel):
    values: dict


class SettingsUpdate(BaseModel):
    values: dict
