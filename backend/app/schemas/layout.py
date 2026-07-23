from pydantic import BaseModel, Field

from app.schemas.admin import CustomFieldOut
from app.schemas.common import ORMModel


# ---------- Sections ----------

class OrderFieldSectionOut(ORMModel):
    id: int
    code: str
    name_ru: str
    name_uz: str
    sort: int


class OrderFieldSectionCreate(BaseModel):
    code: str = Field(min_length=2, max_length=48, pattern=r"^[a-z][a-z0-9_]*$")
    name_ru: str
    name_uz: str
    sort: int = 100


class OrderFieldSectionUpdate(BaseModel):
    name_ru: str | None = None
    name_uz: str | None = None
    sort: int | None = None


class SectionReorder(BaseModel):
    """[{"id": 3, "sort": 100}, ...]"""

    items: list[dict]


# ---------- Resolved layout (read) ----------

class LayoutFieldOut(BaseModel):
    field_ref: str
    kind: str  # "system" | "custom"
    label_ru: str
    label_uz: str
    custom_field: CustomFieldOut | None = None


class LayoutSectionOut(BaseModel):
    id: int | None  # None — "Boshqa" (joylashtirilmagan maydonlar)
    code: str
    name_ru: str
    name_uz: str
    sort: int
    fields: list[LayoutFieldOut]


# ---------- Save (write) ----------

class LayoutSaveItem(BaseModel):
    section_id: int
    field_ref: str
    sort: int = 100


class LayoutSaveBody(BaseModel):
    """Butun joylashuvni bir yo'la almashtirish."""

    items: list[LayoutSaveItem]
