from datetime import datetime

from app.schemas.common import ORMModel
from app.schemas.user import UserShort


class LogOut(ORMModel):
    id: int
    created_at: datetime
    level: str
    category: str
    action: str
    is_success: bool
    actor: UserShort | None = None
    actor_name: str | None = None
    order_id: int | None = None
    entity: str | None = None
    entity_id: int | None = None
    message_ru: str
    message_uz: str
    meta: dict | None = None


class SystemLogOut(LogOut):
    ip: str | None = None
    user_agent: str | None = None
    path: str | None = None
    method: str | None = None
    status_code: int | None = None
    error_text: str | None = None
