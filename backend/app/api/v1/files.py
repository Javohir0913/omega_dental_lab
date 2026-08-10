import io
import mimetypes
import uuid
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated

import aiofiles
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

try:
    from PIL import Image
except Exception:  # pragma: no cover - optional dependency
    Image = None

try:
    from pillow_heif import register_heif_opener

    register_heif_opener()
except Exception:  # pragma: no cover - optional dependency
    pass

try:
    import rawpy
except Exception:  # pragma: no cover - optional dependency
    rawpy = None

from app.core.config import settings
from app.core.deps import CurrentUser, DbDep, require
from app.core.security import now_utc
from app.models import (
    Chat,
    ChatMember,
    ChatType,
    FileAsset,
    FileEntity,
    LogCategory,
    Message,
    NotifyEvent,
    Order,
    User,
)
from app.schemas.common import Msg
from app.schemas.order import FileOut
from app.services import orders as order_svc
from app.services.logger import log_activity
from app.services.notify import notify
from app.services.settings_store import get_setting

router = APIRouter(prefix="/files", tags=["files"])

IMAGE_MIMES = {
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/bmp",
    "image/heic",
    "image/heif",
}
INLINE_MIMES = IMAGE_MIMES | {
    "application/pdf",
    "text/plain", "text/csv", "text/html", "text/xml", "application/json",
    "application/xml",
    "video/mp4", "video/webm", "video/ogg",
    "audio/mpeg", "audio/wav", "audio/ogg", "audio/mp4",
}

# Xavfli kengaytmalar — dental lab uchun kerak emas, yuklashni to'sib qo'yamiz
BLOCKED_EXT = {
    ".exe", ".bat", ".cmd", ".com", ".msi", ".scr", ".vbs", ".js", ".jar",
    ".ps1", ".sh", ".php", ".dll",
}

HEIC_EXTS = {".heic", ".heif"}
# Kamera RAW formatlari — Canon (CR2/CR3), Nikon (NEF), Sony (ARW),
# Adobe (DNG). rawpy/libraw bularning ichidan tayyor JPEG preview'ni oladi.
RAW_EXTS = {".cr2", ".cr3", ".nef", ".arw", ".dng"}
SAMPLE_ROOT = Path(__file__).resolve().parents[4] / "namuna"


def _upload_root() -> Path:
    root = Path(settings.UPLOAD_DIR)
    root.mkdir(parents=True, exist_ok=True)
    return root


def _sample_root() -> Path:
    return SAMPLE_ROOT


def _safe_sample_path(sample_path: str) -> Path:
    root = _sample_root().resolve()
    abs_path = (root / sample_path).resolve()
    if abs_path != root and root not in abs_path.parents:
        raise HTTPException(404, "file_not_found")
    return abs_path


def _file_mime(path: Path) -> str:
    mime, _ = mimetypes.guess_type(path.name)
    return mime or "application/octet-stream"


def _is_inline_mime(mime: str) -> bool:
    return mime in INLINE_MIMES or mime.startswith("image/")


def _raw_preview_path(abs_path: Path) -> Path:
    return abs_path.with_name(abs_path.name + ".preview.jpg")


def _extract_raw_preview(abs_path: Path) -> bytes | None:
    """RAW (CR2/CR3/NEF/ARW/DNG) fayldan brauzerda ko'rsatsa bo'ladigan JPEG oladi.

    Bir necha usulni ketma-ket sinaydi:
      1. rawpy — RAW ichidagi tayyor JPEG thumbnail (tez, to'liq dekodlamasdan).
      2. rawpy.postprocess — thumbnail bo'lmasa, RAW'ni to'liq dekodlab JPEG qiladi.
      3. PIL — fayl aslida RAW bo'lmasa (masalan .NEF nomli JPEG/PNG/TIFF), to'g'ridan ochadi.
    """
    # 1 + 2: haqiqiy RAW fayl
    if rawpy is not None:
        try:
            with rawpy.imread(str(abs_path)) as raw:
                try:
                    thumb = raw.extract_thumb()
                except Exception:
                    thumb = None
                if thumb is not None:
                    if thumb.format == rawpy.ThumbFormat.JPEG:
                        return thumb.data
                    if thumb.format == rawpy.ThumbFormat.BITMAP and Image is not None:
                        buf = io.BytesIO()
                        Image.fromarray(thumb.data).convert("RGB").save(buf, format="JPEG", quality=90)
                        return buf.getvalue()
                # Thumbnail yo'q — RAW'ni to'liq dekodlaymiz (kamdan-kam holat)
                if Image is not None:
                    rgb = raw.postprocess(use_camera_wb=True, no_auto_bright=False)
                    buf = io.BytesIO()
                    Image.fromarray(rgb).convert("RGB").save(buf, format="JPEG", quality=88)
                    return buf.getvalue()
        except Exception:
            pass  # RAW emas ekan — pastdagi PIL fallback'ga o'tamiz

    # 3: fayl aslida oddiy rasm (noto'g'ri kengaytmali JPEG/PNG/TIFF)
    if Image is not None:
        try:
            with Image.open(abs_path) as image:
                buf = io.BytesIO()
                image.convert("RGB").save(buf, format="JPEG", quality=90)
                return buf.getvalue()
        except Exception:
            pass

    return None


def _to_out(f: FileAsset) -> FileOut:
    return FileOut.model_validate(f).model_copy(update={"url": f"/api/v1/files/{f.id}"})


class ZipRequest(BaseModel):
    file_ids: list[int] = []
    sample_paths: list[str] = []


async def _can_view_order(db: AsyncSession, user: User, order_id: int) -> bool:
    if user.is_super or user.has_perm("order.view.all"):
        return True
    res = await db.execute(select(Order).where(Order.id == order_id))
    order = res.scalar_one_or_none()
    if order is None:
        return False
    return bool(
        order.responsible_id == user.id
        or order.created_by_id == user.id
        or any(s.id == order.stage_id for s in (user.stages or []))
    )


async def _can_view_message_file(db: AsyncSession, user: User, message_id: int) -> bool:
    """Chat/DM biriktirmasini faqat shu chat a'zosi (yoki tegishli proyektni
    ko'ra oladigan foydalanuvchi) yuklab olishi mumkin."""
    # Super admin yoki "barcha chatlarni ko'rish" huquqi (adminkadan rolga beriladi)
    if user.is_super or user.has_perm("chat.view.all"):
        return True
    res = await db.execute(select(Message).where(Message.id == message_id))
    msg = res.scalar_one_or_none()
    if msg is None:
        return False
    # To'g'ridan-to'g'ri chat a'zoligi
    res = await db.execute(
        select(ChatMember.id).where(
            ChatMember.chat_id == msg.chat_id, ChatMember.user_id == user.id
        )
    )
    if res.scalar_one_or_none() is not None:
        return True
    res = await db.execute(select(Chat).where(Chat.id == msg.chat_id))
    chat = res.scalar_one_or_none()
    if chat is None:
        return False
    # Proyekt chati — proyektga kirish huquqi bo'lsa
    if chat.order_id and await _can_view_order(db, user, chat.order_id):
        return True
    # DIRECT chat — faqat ikki ishtirokchisi
    if chat.type == ChatType.DIRECT and chat.direct_key:
        parts = chat.direct_key.split(":")
        if len(parts) == 2 and str(user.id) in parts:
            return True
    return False


async def _can_view_file(db: AsyncSession, user: User, asset: FileAsset) -> bool:
    if asset.entity == FileEntity.ORDER:
        return await _can_view_order(db, user, asset.entity_id)
    if asset.entity == FileEntity.MESSAGE:
        return await _can_view_message_file(db, user, asset.entity_id)
    # PATIENT / USER (avatar, bemor rasmi) — tizimga kirgan har bir foydalanuvchi
    return True


def _unique_zip_name(name: str, used_names: set[str]) -> str:
    candidate = name
    i = 1
    stem, suffix = Path(name).stem, Path(name).suffix
    while candidate in used_names:
        candidate = f"{stem} ({i}){suffix}"
        i += 1
    used_names.add(candidate)
    return candidate


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

    original_name = file.filename or "file"
    original_path = Path(original_name)
    ext = original_path.suffix.lower()
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
    if entity == FileEntity.ORDER and entity_id != 0:
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

    max_mb = await get_setting(db, "max_upload_mb", settings.MAX_UPLOAD_MB)
    max_bytes = int(max_mb) * 1024 * 1024 if max_mb else None  # 0/None = cheklovsiz
    size = 0
    try:
        async with aiofiles.open(abs_path, "wb") as out:
            while chunk := await file.read(1024 * 256):
                size += len(chunk)
                if max_bytes and size > max_bytes:
                    await out.close()
                    abs_path.unlink(missing_ok=True)
                    raise HTTPException(413, f"file_too_large_max_{int(max_mb)}mb")
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

    mime = file.content_type or _file_mime(abs_path)
    stored_name = original_name[:255]
    is_image = mime in IMAGE_MIMES

    # iPhone HEIC/HEIF rasmlari brauzerda ko'rinishi uchun JPEG ga aylantiramiz.
    if ext in HEIC_EXTS and Image is not None:
        converted_path = abs_path.with_suffix(".jpg")
        try:
            with Image.open(abs_path) as image:
                if image.mode not in ("RGB", "L"):
                    image = image.convert("RGB")
                elif image.mode == "L":
                    image = image.convert("RGB")
                image.save(converted_path, format="JPEG", quality=92, optimize=True)
            abs_path.unlink(missing_ok=True)
            abs_path = converted_path
            rel_path = rel_path.with_suffix(".jpg")
            stored_name = f"{original_path.stem}.jpg"[:255]
            mime = "image/jpeg"
            size = abs_path.stat().st_size
            is_image = True
        except Exception:
            # Konvertatsiya bo'lmasa, original fayl qoladi.
            pass

    asset = FileAsset(
        entity=entity,
        entity_id=entity_id,
        name=stored_name,
        path=str(rel_path).replace("\\", "/"),
        mime=mime,
        size=size,
        is_image=is_image,
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
        await order_svc.system_message(db, order, f"{user.full_name} загрузил файл: {asset.name}", actor_id=user.id)
        await db.commit()

    return _to_out(asset)


@router.get("/{file_id}/info", response_model=FileOut)
async def file_info(file_id: int, db: DbDep, user: CurrentUser):
    res = await db.execute(select(FileAsset).where(FileAsset.id == file_id))
    asset = res.scalar_one_or_none()
    if asset is None or asset.deleted_at is not None:
        raise HTTPException(404, "file_not_found")
    if not await _can_view_file(db, user, asset):
        raise HTTPException(403, "forbidden")
    return _to_out(asset)


@router.patch("/{file_id}/reassign", response_model=Msg)
async def reassign_file(
    file_id: int,
    db: DbDep,
    user: Annotated[User, Depends(require("file.upload"))],
    entity: str = Form(...),
    entity_id: int = Form(...),
):
    if entity not in FileEntity.ALL:
        raise HTTPException(400, "bad_entity")
    res = await db.execute(select(FileAsset).where(FileAsset.id == file_id))
    asset = res.scalar_one_or_none()
    if asset is None or asset.deleted_at is not None:
        raise HTTPException(404, "file_not_found")
    # Manba faylni ko'ra olmaydigan foydalanuvchi uni ko'chira olmaydi
    if not (user.is_super or asset.uploaded_by_id == user.id or await _can_view_file(db, user, asset)):
        raise HTTPException(403, "forbidden")
    old = f"{asset.entity}:{asset.entity_id}"
    asset.stage_id = None
    if entity == FileEntity.ORDER:
        # Maqsad proyektga kirish huquqini tekshiramiz
        if not await _can_view_order(db, user, entity_id):
            raise HTTPException(403, "forbidden")
        res = await db.execute(select(Order).where(Order.id == entity_id))
        order = res.scalar_one_or_none()
        if order:
            asset.stage_id = order.stage_id
    asset.entity = entity
    asset.entity_id = entity_id
    await log_activity(
        db, action="file.reassigned", category=LogCategory.FILE, actor=user,
        entity="file", entity_id=asset.id,
        message_ru=f"Файл {asset.name} прикреплён к {entity}:{entity_id}",
        message_uz=f"Fayl {asset.name} biriktirildi: {entity}:{entity_id}",
        meta={"from": old, "to": f"{entity}:{entity_id}"},
    )
    await db.commit()
    return Msg(detail="reassigned")


@router.post("/zip")
async def download_zip(payload: ZipRequest, db: DbDep, user: CurrentUser):
    if not payload.file_ids and not payload.sample_paths:
        raise HTTPException(400, "no_files_selected")

    used_names: set[str] = set()
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        if payload.file_ids:
            res = await db.execute(select(FileAsset).where(FileAsset.id.in_(payload.file_ids)))
            assets = {a.id: a for a in res.scalars().all()}
            for file_id in payload.file_ids:
                asset = assets.get(file_id)
                if asset is None or asset.deleted_at is not None:
                    continue
                if not await _can_view_file(db, user, asset):
                    continue
                abs_path = _upload_root() / asset.path
                if not abs_path.exists():
                    continue
                zf.write(abs_path, arcname=_unique_zip_name(asset.name, used_names))

        for sample_path in payload.sample_paths:
            try:
                abs_path = _safe_sample_path(sample_path)
            except HTTPException:
                continue
            if not abs_path.exists() or not abs_path.is_file():
                continue
            zf.write(abs_path, arcname=_unique_zip_name(abs_path.name, used_names))

    if not used_names:
        raise HTTPException(404, "no_files_found")

    return Response(
        content=buffer.getvalue(),
        media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="files.zip"'},
    )


@router.get("/sample")
async def sample_files(user: CurrentUser):
    root = _sample_root()
    if not root.exists():
        return []

    items = []
    for path in sorted((p for p in root.rglob("*") if p.is_file()), key=lambda p: p.relative_to(root).as_posix().lower()):
        rel = path.relative_to(root)
        mime = _file_mime(path)
        stat = path.stat()
        items.append(
            {
                "id": f"sample:{rel.as_posix()}",
                "name": path.name,
                "mime": mime,
                "size": stat.st_size,
                "is_image": mime in IMAGE_MIMES or mime.startswith("image/"),
                "url": f"/api/v1/files/sample/{rel.as_posix()}",
                "created_at": datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc),
                "group": rel.parent.as_posix() if rel.parent != Path(".") else "Namuna",
            }
        )
    return items


@router.get("/{file_id}/preview")
async def raw_preview(file_id: int, db: DbDep, user: CurrentUser):
    """RAW (CR2/CR3/NEF/ARW/DNG) fayllar uchun — brauzerda ko'rsatsa bo'ladigan JPEG preview."""
    res = await db.execute(select(FileAsset).where(FileAsset.id == file_id))
    asset = res.scalar_one_or_none()
    if asset is None or asset.deleted_at is not None:
        raise HTTPException(404, "file_not_found")
    if not await _can_view_file(db, user, asset):
        raise HTTPException(403, "forbidden")

    ext = Path(asset.name).suffix.lower()
    if ext not in RAW_EXTS:
        raise HTTPException(400, "preview_not_supported")

    abs_path = _upload_root() / asset.path
    if not abs_path.exists():
        raise HTTPException(410, "file_missing_on_disk")

    cache_path = _raw_preview_path(abs_path)
    if not cache_path.exists():
        data = _extract_raw_preview(abs_path)
        if data is None:
            raise HTTPException(404, "preview_unavailable")
        cache_path.write_bytes(data)

    return FileResponse(cache_path, media_type="image/jpeg", content_disposition_type="inline")


@router.get("/{file_id}")
async def download(file_id: int, db: DbDep, user: CurrentUser):
    res = await db.execute(select(FileAsset).where(FileAsset.id == file_id))
    asset = res.scalar_one_or_none()
    if asset is None or asset.deleted_at is not None:
        raise HTTPException(404, "file_not_found")

    # proyekt fayli bo'lsa — proyektni ko'rish huquqi tekshiriladi
    if not await _can_view_file(db, user, asset):
        raise HTTPException(403, "forbidden")

    abs_path = _upload_root() / asset.path
    if not abs_path.exists():
        raise HTTPException(410, "file_missing_on_disk")

    return FileResponse(
        abs_path,
        media_type=asset.mime or "application/octet-stream",
        filename=asset.name,
        content_disposition_type="inline" if _is_inline_mime(asset.mime or "") else "attachment",
    )


@router.get("/sample/{sample_path:path}")
async def sample_download(sample_path: str, user: CurrentUser):
    abs_path = _safe_sample_path(sample_path)
    if not abs_path.exists() or not abs_path.is_file():
        raise HTTPException(404, "file_not_found")

    mime = _file_mime(abs_path)
    return FileResponse(
        abs_path,
        media_type=mime,
        filename=abs_path.name,
        content_disposition_type="inline" if _is_inline_mime(mime) else "attachment",
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
        order_id=asset.entity_id if asset.entity == FileEntity.ORDER and asset.entity_id else None,
        entity="file", entity_id=asset.id,
        message_ru=f"Удалён файл {asset.name}",
        message_uz=f"Fayl o'chirildi: {asset.name}",
        request=request,
    )
    await db.commit()
    return Msg(detail="deleted")
