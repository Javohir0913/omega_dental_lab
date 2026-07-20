from typing import Generic, TypeVar

from pydantic import BaseModel, ConfigDict

T = TypeVar("T")


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int = 1
    size: int = 50

    @property
    def pages(self) -> int:
        return max(1, -(-self.total // self.size))


class Msg(BaseModel):
    ok: bool = True
    detail: str | None = None


class IdName(ORMModel):
    id: int
    name: str
