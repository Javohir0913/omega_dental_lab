"""Ma'lumotnomalar: vrachlar, patsentlar, xizmatlar."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, or_, select

from app.core.deps import DbDep, require
from app.models import Doctor, LogCategory, Order, Patient, Service, User
from app.schemas.catalog import (
    DoctorCreate,
    DoctorOut,
    DoctorUpdate,
    PatientCreate,
    PatientOut,
    PatientUpdate,
    ServiceCreate,
    ServiceOut,
    ServiceReorder,
    ServiceUpdate,
)
from app.schemas.common import Msg, Page
from app.services.custom_fields import get_values, get_values_bulk, set_values
from app.services.logger import log_activity

doctors_router = APIRouter(prefix="/doctors", tags=["doctors"])
patients_router = APIRouter(prefix="/patients", tags=["patients"])
services_router = APIRouter(prefix="/services", tags=["services"])


# ==========================================================================
# Vrachlar
# ==========================================================================


@doctors_router.get("", response_model=Page[DoctorOut])
async def list_doctors(
    db: DbDep,
    _: Annotated[User, Depends(require("doctor.view"))],
    q: str | None = None,
    is_active: bool | None = True,
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
):
    query = select(Doctor)
    if q:
        like = f"%{q}%"
        query = query.where(
            or_(Doctor.full_name.ilike(like), Doctor.phone.ilike(like), Doctor.clinic.ilike(like))
        )
    if is_active is not None:
        query = query.where(Doctor.is_active.is_(is_active))

    total = (await db.execute(select(func.count()).select_from(query.subquery()))).scalar() or 0
    res = await db.execute(query.order_by(Doctor.full_name).offset((page - 1) * size).limit(size))
    return Page[DoctorOut](
        items=[DoctorOut.model_validate(d) for d in res.scalars().all()],
        total=total, page=page, size=size,
    )


@doctors_router.get("/{doctor_id}", response_model=DoctorOut)
async def get_doctor(
    doctor_id: int, db: DbDep, _: Annotated[User, Depends(require("doctor.view"))]
):
    res = await db.execute(select(Doctor).where(Doctor.id == doctor_id))
    doctor = res.scalar_one_or_none()
    if doctor is None:
        raise HTTPException(404, "doctor_not_found")
    return DoctorOut.model_validate(doctor)


@doctors_router.post("", response_model=DoctorOut, status_code=201)
async def create_doctor(
    body: DoctorCreate,
    request: Request,
    db: DbDep,
    actor: Annotated[User, Depends(require("doctor.manage"))],
):
    doctor = Doctor(**body.model_dump())
    db.add(doctor)
    await db.flush()
    await log_activity(
        db, action="doctor.created", category=LogCategory.CATALOG, actor=actor,
        entity="doctor", entity_id=doctor.id,
        message_ru=f"Добавлен врач {doctor.full_name}",
        message_uz=f"Vrach qo'shildi: {doctor.full_name}",
        request=request,
    )
    await db.commit()
    await db.refresh(doctor)
    return DoctorOut.model_validate(doctor)


@doctors_router.patch("/{doctor_id}", response_model=DoctorOut)
async def update_doctor(
    doctor_id: int,
    body: DoctorUpdate,
    request: Request,
    db: DbDep,
    actor: Annotated[User, Depends(require("doctor.manage"))],
):
    res = await db.execute(select(Doctor).where(Doctor.id == doctor_id))
    doctor = res.scalar_one_or_none()
    if doctor is None:
        raise HTTPException(404, "doctor_not_found")

    data = body.model_dump(exclude_unset=True)
    changes = {k: {"from": getattr(doctor, k), "to": v} for k, v in data.items()}
    for k, v in data.items():
        setattr(doctor, k, v)

    await log_activity(
        db, action="doctor.updated", category=LogCategory.CATALOG, actor=actor,
        entity="doctor", entity_id=doctor.id,
        message_ru=f"Изменён врач {doctor.full_name}",
        message_uz=f"Vrach o'zgartirildi: {doctor.full_name}",
        meta=changes, request=request,
    )
    await db.commit()
    await db.refresh(doctor)
    return DoctorOut.model_validate(doctor)


@doctors_router.delete("/{doctor_id}", response_model=Msg)
async def delete_doctor(
    doctor_id: int,
    request: Request,
    db: DbDep,
    actor: Annotated[User, Depends(require("doctor.manage"))],
):
    res = await db.execute(select(Doctor).where(Doctor.id == doctor_id))
    doctor = res.scalar_one_or_none()
    if doctor is None:
        raise HTTPException(404, "doctor_not_found")

    res = await db.execute(select(func.count(Order.id)).where(Order.doctor_id == doctor_id))
    if (res.scalar() or 0) > 0:
        # proyektlar tarixini saqlash uchun arxivlaymiz
        doctor.is_active = False
        await log_activity(
            db, action="doctor.archived", category=LogCategory.CATALOG, actor=actor,
            entity="doctor", entity_id=doctor_id,
            message_ru=f"Врач {doctor.full_name} архивирован (есть проекты)",
            message_uz=f"Vrach {doctor.full_name} arxivlandi (proyektlari bor)",
            request=request,
        )
        await db.commit()
        return Msg(detail="archived")

    name = doctor.full_name
    await db.delete(doctor)
    await log_activity(
        db, action="doctor.deleted", category=LogCategory.CATALOG, actor=actor,
        entity="doctor", entity_id=doctor_id,
        message_ru=f"Удалён врач {name}", message_uz=f"Vrach o'chirildi: {name}",
        request=request,
    )
    await db.commit()
    return Msg(detail="deleted")


# ==========================================================================
# Patsentlar
# ==========================================================================


@patients_router.get("", response_model=Page[PatientOut])
async def list_patients(
    db: DbDep,
    _: Annotated[User, Depends(require("patient.view"))],
    q: str | None = None,
    doctor_id: int | None = None,
    is_active: bool | None = True,
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
):
    query = select(Patient)
    if q:
        like = f"%{q}%"
        query = query.where(or_(Patient.full_name.ilike(like), Patient.phone.ilike(like)))
    if doctor_id:
        query = query.where(Patient.doctor_id == doctor_id)
    if is_active is not None:
        query = query.where(Patient.is_active.is_(is_active))

    total = (await db.execute(select(func.count()).select_from(query.subquery()))).scalar() or 0
    res = await db.execute(query.order_by(Patient.full_name).offset((page - 1) * size).limit(size))
    rows = list(res.scalars().all())

    cf = await get_values_bulk(db, "patient", [p.id for p in rows])
    items = []
    for p in rows:
        out = PatientOut.model_validate(p)
        out.custom_fields = cf.get(p.id, {})
        items.append(out)
    return Page[PatientOut](items=items, total=total, page=page, size=size)


@patients_router.get("/{patient_id}", response_model=PatientOut)
async def get_patient(
    patient_id: int, db: DbDep, _: Annotated[User, Depends(require("patient.view"))]
):
    res = await db.execute(select(Patient).where(Patient.id == patient_id))
    patient = res.scalar_one_or_none()
    if patient is None:
        raise HTTPException(404, "patient_not_found")
    out = PatientOut.model_validate(patient)
    out.custom_fields = await get_values(db, "patient", patient.id)
    return out


@patients_router.post("", response_model=PatientOut, status_code=201)
async def create_patient(
    body: PatientCreate,
    request: Request,
    db: DbDep,
    actor: Annotated[User, Depends(require("patient.manage"))],
):
    data = body.model_dump()
    cf = data.pop("custom_fields", {})
    patient = Patient(**data)
    db.add(patient)
    await db.flush()
    await set_values(db, "patient", patient.id, cf)

    await log_activity(
        db, action="patient.created", category=LogCategory.CATALOG, actor=actor,
        entity="patient", entity_id=patient.id,
        message_ru=f"Добавлен пациент {patient.full_name}",
        message_uz=f"Patsent qo'shildi: {patient.full_name}",
        request=request,
    )
    await db.commit()
    await db.refresh(patient)
    out = PatientOut.model_validate(patient)
    out.custom_fields = await get_values(db, "patient", patient.id)
    return out


@patients_router.patch("/{patient_id}", response_model=PatientOut)
async def update_patient(
    patient_id: int,
    body: PatientUpdate,
    request: Request,
    db: DbDep,
    actor: Annotated[User, Depends(require("patient.manage"))],
):
    res = await db.execute(select(Patient).where(Patient.id == patient_id))
    patient = res.scalar_one_or_none()
    if patient is None:
        raise HTTPException(404, "patient_not_found")

    data = body.model_dump(exclude_unset=True)
    cf = data.pop("custom_fields", None)
    changes = {k: {"from": str(getattr(patient, k)), "to": str(v)} for k, v in data.items()}
    for k, v in data.items():
        setattr(patient, k, v)
    if cf is not None:
        changes.update(await set_values(db, "patient", patient.id, cf))

    await log_activity(
        db, action="patient.updated", category=LogCategory.CATALOG, actor=actor,
        entity="patient", entity_id=patient.id,
        message_ru=f"Изменён пациент {patient.full_name}",
        message_uz=f"Patsent o'zgartirildi: {patient.full_name}",
        meta=changes, request=request,
    )
    await db.commit()
    await db.refresh(patient)
    out = PatientOut.model_validate(patient)
    out.custom_fields = await get_values(db, "patient", patient.id)
    return out


@patients_router.delete("/{patient_id}", response_model=Msg)
async def delete_patient(
    patient_id: int,
    request: Request,
    db: DbDep,
    actor: Annotated[User, Depends(require("patient.manage"))],
):
    res = await db.execute(select(Patient).where(Patient.id == patient_id))
    patient = res.scalar_one_or_none()
    if patient is None:
        raise HTTPException(404, "patient_not_found")

    res = await db.execute(select(func.count(Order.id)).where(Order.patient_id == patient_id))
    if (res.scalar() or 0) > 0:
        patient.is_active = False
        await log_activity(
            db, action="patient.archived", category=LogCategory.CATALOG, actor=actor,
            entity="patient", entity_id=patient_id,
            message_ru=f"Пациент {patient.full_name} архивирован (есть проекты)",
            message_uz=f"Patsent {patient.full_name} arxivlandi (proyektlari bor)",
            request=request,
        )
        await db.commit()
        return Msg(detail="archived")

    name = patient.full_name
    await db.delete(patient)
    await log_activity(
        db, action="patient.deleted", category=LogCategory.CATALOG, actor=actor,
        entity="patient", entity_id=patient_id,
        message_ru=f"Удалён пациент {name}", message_uz=f"Patsent o'chirildi: {name}",
        request=request,
    )
    await db.commit()
    return Msg(detail="deleted")


# ==========================================================================
# Xizmatlar (narxsiz)
# ==========================================================================


@services_router.get("", response_model=list[ServiceOut])
async def list_services(
    db: DbDep,
    _: Annotated[User, Depends(require("service.view"))],
    include_inactive: bool = False,
):
    q = select(Service)
    if not include_inactive:
        q = q.where(Service.is_active.is_(True))
    res = await db.execute(q.order_by(Service.sort, Service.name_ru))
    return [ServiceOut.model_validate(s) for s in res.scalars().all()]


@services_router.post("", response_model=ServiceOut, status_code=201)
async def create_service(
    body: ServiceCreate,
    request: Request,
    db: DbDep,
    actor: Annotated[User, Depends(require("service.manage"))],
):
    service = Service(**body.model_dump())
    db.add(service)
    await db.flush()
    await log_activity(
        db, action="service.created", category=LogCategory.CATALOG, actor=actor,
        entity="service", entity_id=service.id,
        message_ru=f"Добавлена услуга «{service.name_ru}»",
        message_uz=f"Xizmat qo'shildi: «{service.name_uz}»",
        request=request,
    )
    await db.commit()
    await db.refresh(service)
    return ServiceOut.model_validate(service)


@services_router.post("/reorder", response_model=Msg)
async def reorder_services(
    body: ServiceReorder,
    request: Request,
    db: DbDep,
    actor: Annotated[User, Depends(require("service.manage"))],
):
    res = await db.execute(select(Service))
    services = {s.id: s for s in res.scalars().all()}

    for item in body.items:
        service = services.get(int(item.get("id", 0)))
        if service is not None:
            service.sort = int(item.get("sort", service.sort))

    await log_activity(
        db, action="service.reordered", category=LogCategory.CATALOG, actor=actor,
        message_ru="Изменён порядок услуг", message_uz="Xizmatlar tartibi o'zgartirildi",
        meta={"items": body.items}, request=request,
    )
    await db.commit()
    return Msg(detail="reordered")


@services_router.patch("/{service_id}", response_model=ServiceOut)
async def update_service(
    service_id: int,
    body: ServiceUpdate,
    request: Request,
    db: DbDep,
    actor: Annotated[User, Depends(require("service.manage"))],
):
    res = await db.execute(select(Service).where(Service.id == service_id))
    service = res.scalar_one_or_none()
    if service is None:
        raise HTTPException(404, "service_not_found")

    data = body.model_dump(exclude_unset=True)
    changes = {k: {"from": getattr(service, k), "to": v} for k, v in data.items()}
    for k, v in data.items():
        setattr(service, k, v)

    await log_activity(
        db, action="service.updated", category=LogCategory.CATALOG, actor=actor,
        entity="service", entity_id=service.id,
        message_ru=f"Изменена услуга «{service.name_ru}»",
        message_uz=f"Xizmat o'zgartirildi: «{service.name_uz}»",
        meta=changes, request=request,
    )
    await db.commit()
    await db.refresh(service)
    return ServiceOut.model_validate(service)


@services_router.delete("/{service_id}", response_model=Msg)
async def delete_service(
    service_id: int,
    request: Request,
    db: DbDep,
    actor: Annotated[User, Depends(require("service.manage"))],
):
    res = await db.execute(select(Service).where(Service.id == service_id))
    service = res.scalar_one_or_none()
    if service is None:
        raise HTTPException(404, "service_not_found")

    service.is_active = False  # xizmatlar proyektlarga bog'langan — arxivlaymiz
    await log_activity(
        db, action="service.archived", category=LogCategory.CATALOG, actor=actor,
        entity="service", entity_id=service_id,
        message_ru=f"Услуга «{service.name_ru}» архивирована",
        message_uz=f"«{service.name_uz}» xizmati arxivlandi",
        request=request,
    )
    await db.commit()
    return Msg(detail="archived")
