import uuid
from pathlib import Path
from typing import Annotated

import aiofiles
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import select

from app.core.config import settings
from app.core.deps import CurrentUser, DbDep, require
from app.core.security import now_utc
from app.models import FileAsset, FileEntity, LogCategory, NotifyEvent, Order, User
from app.schemas.common import Msg
from app.schemas.order import FileOut
from app.services import orders as order_svc
from app.services.logger import log_activity
from app.services.notify import notify

router = APIRouter(prefix="/files", tags=["files"])

IMAGE_MIMES = {"image/jpeg", "image/png", "image/gif", "image/webp", "image/bmp"}

# Xavfli kengaytmalar — dental lab uchun kerak emas, yuklashni to'sib qo'yamiz
BLOCKED_EXT = {
    ".exe", ".bat", ".cmd", ".com", ".msi", ".scr", ".vbs", ".js", ".jar",
    ".ps1", ".sh", ".php", ".dll",
}


def _upload_root() -> Path:
    root = Path(settings.UPLOAD_DIR)
    root.mkdir(parents=True, exist_ok=True)
    return root


def _to_out(f: FileAsset) -> FileOut:
    return FileOut.model_validate(f).model_copy(update={"url": f"/api/v1/files/{f.id}"})


@router.post("", response_model=FileOut, status_code=201)
async def upload(
    request: Request,
    db: DbDep,
    user: Annotated[User, Depends(require("file.upload"))],
    file: UploadFile = File(...),
    entity: str = Form(...),
    entity_id: int = Form(...),
):
    if entity not in FileEntity.ALL:
        raise HTTPException(400, "bad_entity")

    ext = Path(file.filename or "file").suffix.lower()
    if ext in BLOCKED_EXT:
        await log_activity(
            db, action="file.upload", category=LogCategory.FILE, is_success=False,
            actor=user,
            message_ru=f"Отклонён небезопасный файл: {file.filename}",
            message_uz=f"Xavfli fayl rad etildi: {file.filename}",
            request=request, commit=True,
        )
        raise HTTPException(400, "file_type_not_allowed")

    order: Order | None = None
    if entity == FileEntity.ORDER:
        res = await db.execute(select(Order).where(Order.id == entity_id))
        order = res.scalar_one_or_none()
        if order is None:
            raise HTTPException(404, "order_not_found")

    # sanaga bo'lingan papka: uploads/2026/07/uuid.ext
    now = now_utc()
    rel_dir = Path(f"{now:%Y}/{now:%m}")
    (_upload_root() / rel_dir).mkdir(parents=True, exist_ok=True)
    rel_path = rel_dir / f"{uuid.uuid4().hex}{ext}"
    abs_path = _upload_root() / rel_path

    max_bytes = settings.MAX_UPLOAD_MB * 1024 * 1024
    size = 0
    try:
        async with aiofiles.open(abs_path, "wb") as out:
            while chunk := await file.read(1024 * 256):
                size += len(chunk)
                if size > max_bytes:
                    await out.close()
                    abs_path.unlink(missing_ok=True)
                    raise HTTPException(413, f"file_too_large_max_{settings.MAX_UPLOAD_MB}mb")
                await out.write(chunk)
    except HTTPException:
        raise
    except Exception as e:
        abs_path.unlink(missing_ok=True)
        await log_activity(
            db, action="file.upload", category=LogCategory.FILE, actor=user,
            message_ru="Ошибка загрузки файла", message_uz="Fayl yuklashda xato",
            request=request, error=e, commit=True,
        )
        raise HTTPException(500, "upload_failed") from e

    asset = FileAsset(
        entity=entity,
        entity_id=entity_id,
        name=(file.filename or "file")[:255],
        path=str(rel_path).replace("\\", "/"),
        mime=file.content_type,
        size=size,
        is_image=(file.content_type or "") in IMAGE_MIMES,
        stage_id=order.stage_id if order else None,
        uploaded_by_id=user.id,
        created_at=now,
    )
    db.add(asset)
    await db.flush()

    await log_activity(
        db, action="file.uploaded", category=LogCategory.FILE, actor=user,
        order_id=order.id if order else None, entity="file", entity_id=asset.id,
        message_ru=f"Загружен файл {asset.name} ({size // 1024} КБ)",
        message_uz=f"Fayl yuklandi: {asset.name} ({size // 1024} KB)",
        meta={"entity": entity, "entity_id": entity_id, "mime": asset.mime},
        request=request,
    )
    await db.commit()
    await db.refresh(asset)

    if order is not None:
        await notify(
            db, NotifyEvent.ORDER_FILE, order=order, actor=user,
            ctx={"file_name": asset.name},
        )
        await order_svc.system_message(db, order, f"{user.full_name} загрузил файл: {asset.name}")
        await db.commit()

    return _to_out(asset)


@router.get("/{file_id}")
async def download(file_id: int, db: DbDep, user: CurrentUser):
    res = await db.execute(select(FileAsset).where(FileAsset.id == file_id))
    asset = res.scalar_one_or_none()
    if asset is None or asset.deleted_at is not None:
        raise HTTPException(404, "file_not_found")

    # proyekt fayli bo'lsa — proyektni ko'rish huquqi tekshiriladi
    if asset.entity == FileEntity.ORDER and not (
        user.is_super or user.has_perm("order.view.all")
    ):
        res = await db.execute(select(Order).where(Order.id == asset.entity_id))
        order = res.scalar_one_or_none()
        if order is None:
            raise HTTPException(404, "file_not_found")
        visible = (
            order.responsible_id == user.id
            or order.created_by_id == user.id
            or any(s.id == order.stage_id for s in (user.stages or []))
        )
        if not visible:
            raise HTTPException(403, "forbidden")

    abs_path = _upload_root() / asset.path
    if not abs_path.exists():
        raise HTTPException(410, "file_missing_on_disk")

    return FileResponse(
        abs_path,
        media_type=asset.mime or "application/octet-stream",
        filename=asset.name,
        content_disposition_type="inline" if asset.is_image else "attachment",
    )


@router.delete("/{file_id}", response_model=Msg)
async def delete_file(
    file_id: int,
    request: Request,
    db: DbDep,
    user: Annotated[User, Depends(require("file.delete"))],
):
    res = await db.execute(select(FileAsset).where(FileAsset.id == file_id))
    asset = res.scalar_one_or_none()
    if asset is None or asset.deleted_at is not None:
        raise HTTPException(404, "file_not_found")

    # Diskdan o'chirmaymiz — «yumshoq» o'chirish, tiklash imkoni qolsin
    asset.deleted_at = now_utc()
    await log_activity(
        db, action="file.deleted", category=LogCategory.FILE, actor=user,
        order_id=asset.entity_id if asset.entity == FileEntity.ORDER else None,
        entity="file", entity_id=asset.id,
        message_ru=f"Удалён файл {asset.name}",
        message_uz=f"Fayl o'chirildi: {asset.name}",
        request=request,
    )
    await db.commit()
    return Msg(detail="deleted")
