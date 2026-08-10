from pydantic import BaseModel


class StageWorkRow(BaseModel):
    """Bitta (xodim, bosqich) juftligi bo'yicha jamlangan statistika."""

    user_id: int
    user_name: str
    stage_id: int
    stage_name_ru: str
    stage_name_uz: str
    count: int
    total_seconds: int
    avg_seconds: int
