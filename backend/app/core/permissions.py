"""Huquqlar reestri.

Har bir huquq kodi shu yerda e'lon qilinadi. Adminkada rol -> huquq matritsasi
shu ro'yxatdan quriladi. Yangi huquq qo'shish = shu yerga qator qo'shish +
`python -m app.initial_data` (mavjud bazani buzmasdan sinxronlaydi).
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class Perm:
    code: str
    group_ru: str
    group_uz: str
    name_ru: str
    name_uz: str


P = Perm

PERMISSIONS: list[Perm] = [
    # --- Proyektlar (zakazlar) ---
    P("order.view.all", "Проекты", "Proyektlar", "Видеть все проекты", "Barcha proyektlarni ko'rish"),
    P("order.view.own_stage", "Проекты", "Proyektlar", "Видеть только свои этапы", "Faqat o'z bosqichini ko'rish"),
    P("order.create", "Проекты", "Proyektlar", "Создавать проект", "Proyekt yaratish"),
    P("order.edit", "Проекты", "Proyektlar", "Редактировать проект", "Proyektni tahrirlash"),
    P("order.rename", "Проекты", "Proyektlar", "Менять название/врача", "Nom/vrachni o'zgartirish"),
    P("order.delete", "Проекты", "Proyektlar", "Удалять проект", "Proyektni o'chirish"),
    P("order.move.any", "Проекты", "Proyektlar", "Двигать любой проект по этапам", "Istalgan proyektni surish"),
    P("order.move.own", "Проекты", "Proyektlar", "Двигать свои проекты", "O'z proyektini surish"),
    P("order.assign.any", "Проекты", "Proyektlar", "Назначать исполнителя другим", "Boshqaga mas'ul biriktirish"),
    P("order.claim", "Проекты", "Proyektlar", "Брать проект себе", "Proyektni o'ziga olish"),
    # --- Chat ---
    P("chat.order", "Чат", "Chat", "Чат проекта", "Proyekt chati"),
    P("chat.direct", "Чат", "Chat", "Личные сообщения", "Shaxsiy xabarlar"),
    P("chat.view.all", "Чат", "Chat", "Видеть все чаты и вложения (без членства)", "Barcha chat va biriktirmalarni ko'rish (a'zoliksiz)"),
    # --- Fayl ---
    P("file.upload", "Файлы", "Fayllar", "Загружать файлы", "Fayl yuklash"),
    P("file.delete", "Файлы", "Fayllar", "Удалять файлы", "Fayl o'chirish"),
    # --- Spravochniklar ---
    P("patient.view", "Справочники", "Ma'lumotnomalar", "Видеть пациентов", "Patsentlarni ko'rish"),
    P("patient.manage", "Справочники", "Ma'lumotnomalar", "Управлять пациентами", "Patsentlarni boshqarish"),
    P("doctor.view", "Справочники", "Ma'lumotnomalar", "Видеть врачей", "Vrachlarni ko'rish"),
    P("doctor.manage", "Справочники", "Ma'lumotnomalar", "Управлять врачами", "Vrachlarni boshqarish"),
    P("service.view", "Справочники", "Ma'lumotnomalar", "Видеть услуги", "Xizmatlarni ko'rish"),
    P("service.manage", "Справочники", "Ma'lumotnomalar", "Управлять услугами", "Xizmatlarni boshqarish"),
    # --- Xodimlar ---
    P("user.view", "Сотрудники", "Xodimlar", "Видеть сотрудников", "Xodimlarni ko'rish"),
    P("user.manage", "Сотрудники", "Xodimlar", "Создавать/редактировать сотрудников", "Xodim yaratish/tahrirlash"),
    P("user.password", "Сотрудники", "Xodimlar", "Менять пароль сотрудника", "Xodim parolini o'zgartirish"),
    P("user.session", "Сотрудники", "Xodimlar", "Видеть и завершать сессии", "Sessiyalarni ko'rish/uzish"),
    # --- Adminka ---
    P("admin.stages", "Админка", "Adminka", "Настройка этапов и канбана", "Bosqich/kanban sozlash"),
    P("admin.fields", "Админка", "Adminka", "Настройка полей", "Maydonlarni sozlash"),
    P("admin.roles", "Админка", "Adminka", "Настройка ролей и прав", "Rol va huquqlarni sozlash"),
    P("admin.notify", "Админка", "Adminka", "Настройка уведомлений", "Bildirishnomalarni sozlash"),
    P("admin.settings", "Админка", "Adminka", "Общие настройки", "Umumiy sozlamalar"),
    # --- Log ---
    P("log.order", "Логи", "Loglar", "Видеть лог проекта", "Proyekt logini ko'rish"),
    P("log.system", "Логи", "Loglar", "Видеть системный лог и ошибки", "Tizim logi va errorlarni ko'rish"),
]

PERMISSION_CODES = {p.code for p in PERMISSIONS}

# Rollar uchun default huquq to'plami. Faqat BIRINCHI seed'da qo'llanadi —
# keyinchalik adminkadan o'zgartirilgan huquqlar ustidan yozilmaydi.
ROLE_DEFAULTS: dict[str, list[str]] = {
    # super_admin — kodda hamma narsaga ruxsat (has_perm da by-pass), lekin
    # matritsada ham to'liq ko'rinib tursin.
    "super_admin": sorted(PERMISSION_CODES),
    "admin": [
        "order.view.all", "order.create", "order.edit", "order.rename", "order.delete",
        "order.move.any", "order.assign.any", "order.claim",
        "chat.order", "chat.direct", "chat.view.all", "file.upload", "file.delete",
        "patient.view", "patient.manage", "doctor.view", "doctor.manage",
        "service.view", "service.manage",
        "user.view", "user.manage", "user.password", "user.session",
        "admin.stages", "admin.fields", "admin.notify", "admin.settings",
        "log.order",
    ],
    "hr": [
        "order.view.all", "order.create", "order.edit", "order.rename",
        "order.move.any", "order.assign.any",
        "chat.order", "chat.direct", "file.upload",
        "patient.view", "patient.manage", "doctor.view", "doctor.manage", "service.view",
        "user.view", "user.manage", "user.password", "user.session",
        "log.order",
    ],
    "technician": [
        "order.view.all", "order.move.own", "order.claim",
        "chat.order", "chat.direct", "file.upload",
        "patient.view", "doctor.view", "service.view",
        "log.order",
    ],
}

SYSTEM_ROLES = [
    ("super_admin", "Супер администратор", "Super administrator"),
    ("admin", "Администратор", "Administrator"),
    ("hr", "HR / Администратор", "HR / Administrator"),
    ("technician", "Техник", "Texnik"),
]
