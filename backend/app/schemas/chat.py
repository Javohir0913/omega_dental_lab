from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.common import ORMModel
from app.schemas.order import FileOut
from app.schemas.user import UserShort


class MessageOut(ORMModel):
    id: int
    chat_id: int
    text: str | None = None
    is_system: bool
    reply_to_id: int | None = None
    author: UserShort | None = None
    attachments: list[FileOut] = []
    created_at: datetime
    edited_at: datetime | None = None
    deleted_at: datetime | None = None


class MessageCreate(BaseModel):
    text: str | None = Field(default=None, max_length=8000)
    reply_to_id: int | None = None
    file_ids: list[int] = []


class MessageEdit(BaseModel):
    text: str = Field(min_length=1, max_length=8000)


class ChatOut(ORMModel):
    id: int
    type: str
    title: str | None = None
    order_id: int | None = None
    order_number: str | None = None
    last_message_at: datetime | None = None
    last_message: str | None = None
    unread: int = 0
    order_is_closed: bool = False
    hidden: bool = False
    members: list[UserShort] = []
    peer: UserShort | None = None  # DIRECT uchun suhbatdosh


class DirectOpen(BaseModel):
    user_id: int


class HideChat(BaseModel):
    hidden: bool
