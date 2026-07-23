from fastapi import APIRouter

from app.api.v1 import (
    admin,
    auth,
    catalog,
    chat,
    files,
    layout,
    logs,
    notifications,
    orders,
    roles,
    stages,
    users,
    ws,
)

api_router = APIRouter()

api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(roles.router)
api_router.include_router(stages.router)
api_router.include_router(catalog.doctors_router)
api_router.include_router(catalog.patients_router)
api_router.include_router(catalog.services_router)
api_router.include_router(orders.router)
api_router.include_router(chat.router)
api_router.include_router(files.router)
api_router.include_router(notifications.router)
api_router.include_router(logs.router)
api_router.include_router(admin.router)
api_router.include_router(layout.router)
api_router.include_router(ws.router)
