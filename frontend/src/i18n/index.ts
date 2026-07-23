import { create } from 'zustand'
import type { Lang } from '@/lib/types'

type Dict = Record<string, { ru: string; uz: string }>

export const dict: Dict = {
  // umumiy
  save: { ru: 'Сохранить', uz: 'Saqlash' },
  cancel: { ru: 'Отмена', uz: 'Bekor qilish' },
  create: { ru: 'Создать', uz: 'Yaratish' },
  edit: { ru: 'Изменить', uz: 'Tahrirlash' },
  delete: { ru: 'Удалить', uz: "O'chirish" },
  search: { ru: 'Поиск', uz: 'Qidiruv' },
  loading: { ru: 'Загрузка…', uz: 'Yuklanmoqda…' },
  empty: { ru: 'Ничего не найдено', uz: 'Hech narsa topilmadi' },
  all: { ru: 'Все', uz: 'Hammasi' },
  yes: { ru: 'Да', uz: 'Ha' },
  no: { ru: 'Нет', uz: "Yo'q" },
  active: { ru: 'Активен', uz: 'Aktiv' },
  inactive: { ru: 'Заблокирован', uz: 'Bloklangan' },
  close: { ru: 'Закрыть', uz: 'Yopish' },
  add: { ru: 'Добавить', uz: "Qo'shish" },
  saved: { ru: 'Сохранено', uz: 'Saqlandi' },
  confirm_delete: { ru: 'Точно удалить?', uz: "Rostdan o'chirilsinmi?" },
  none: { ru: 'Не выбрано', uz: 'Tanlanmagan' },
  required: { ru: 'Обязательно', uz: 'Majburiy' },
  move_back: { ru: 'Вернуть назад', uz: 'Orqaga qaytarish' },
  move_back_confirm: { ru: 'Вернуть карточку на этап', uz: 'Kartani quyidagi bosqichga qaytarasizmi' },

  // auth
  login: { ru: 'Вход', uz: 'Kirish' },
  logout: { ru: 'Выйти', uz: 'Chiqish' },
  username: { ru: 'Логин', uz: 'Login' },
  password: { ru: 'Пароль', uz: 'Parol' },
  sign_in: { ru: 'Войти', uz: 'Kirish' },
  session_lost: { ru: 'Сессия завершена, войдите заново', uz: 'Sessiya tugadi, qayta kiring' },

  // navigatsiya
  nav_kanban: { ru: 'Канбан', uz: 'Kanban' },
  nav_orders: { ru: 'Проекты', uz: 'Proyektlar' },
  nav_patients: { ru: 'Пациенты', uz: 'Patsentlar' },
  nav_doctors: { ru: 'Врачи', uz: 'Vrachlar' },
  nav_services: { ru: 'Услуги', uz: 'Xizmatlar' },
  nav_users: { ru: 'Сотрудники', uz: 'Xodimlar' },
  nav_chats: { ru: 'Чаты', uz: 'Chatlar' },
  nav_admin: { ru: 'Админка', uz: 'Adminka' },
  nav_logs: { ru: 'Логи', uz: 'Loglar' },
  nav_profile: { ru: 'Профиль', uz: 'Profil' },

  // proyekt
  order: { ru: 'Проект', uz: 'Proyekt' },
  new_order: { ru: 'Новый проект', uz: 'Yangi proyekt' },
  order_title: { ru: 'Название проекта', uz: 'Proyekt nomi' },
  patient: { ru: 'Пациент', uz: 'Patsent' },
  doctor: { ru: 'Врач', uz: 'Vrach' },
  services: { ru: 'Услуги', uz: 'Xizmatlar' },
  teeth: { ru: 'Зубы', uz: 'Tishlar' },
  stage: { ru: 'Этап', uz: 'Bosqich' },
  responsible: { ru: 'Ответственный', uz: "Mas'ul" },
  deadline: { ru: 'Дедлайн', uz: 'Dedlayn' },
  priority: { ru: 'Приоритет', uz: 'Prioritet' },
  description: { ru: 'Описание', uz: 'Tavsif' },
  files: { ru: 'Файлы', uz: 'Fayllar' },
  history: { ru: 'История', uz: 'Tarix' },
  chat: { ru: 'Чат', uz: 'Chat' },
  log: { ru: 'Лог', uz: 'Log' },
  claim: { ru: 'Взять себе', uz: "O'zimga olaman" },
  assign: { ru: 'Назначить', uz: 'Biriktirish' },
  free: { ru: 'Свободен', uz: "Bo'sh" },
  overdue: { ru: 'Просрочен', uz: 'Kechikdi' },
  only_mine: { ru: 'Только мои', uz: 'Faqat meniki' },
  only_free: { ru: 'Только свободные', uz: "Faqat bo'shlari" },
  move_to: { ru: 'Перевести на этап', uz: 'Bosqichga o‘tkazish' },
  next_assignee: { ru: 'Кто делает следующий этап', uz: 'Keyingi bosqichni kim qiladi' },
  comment: { ru: 'Комментарий', uz: 'Izoh' },
  fill_required: {
    ru: 'Заполните обязательные поля',
    uz: 'Majburiy maydonlarni to‘ldiring',
  },
  active_orders: { ru: 'активных проектов', uz: 'aktiv proyekt' },
  in_stage: { ru: 'На этапе', uz: 'Bosqichda' },

  // xodimlar
  full_name: { ru: 'ФИО', uz: 'F.I.Sh.' },
  phone: { ru: 'Телефон', uz: 'Telefon' },
  role: { ru: 'Роль', uz: 'Rol' },
  new_user: { ru: 'Новый сотрудник', uz: 'Yangi xodim' },
  can_do_stages: { ru: 'Может выполнять этапы', uz: 'Bajara oladigan bosqichlar' },
  can_do_services: { ru: 'Может выполнять услуги', uz: 'Bajara oladigan xizmatlar' },
  session_limit: { ru: 'Лимит сессий', uz: 'Sessiya limiti' },
  session_limit_hint: {
    ru: '0 — без ограничений. При превышении завершается самая старая сессия.',
    uz: '0 — cheksiz. Limitdan oshsa eng eski sessiya uziladi.',
  },
  sessions: { ru: 'Сессии', uz: 'Sessiyalar' },
  set_password: { ru: 'Задать пароль', uz: 'Parol qo‘yish' },
  new_password: { ru: 'Новый пароль', uz: 'Yangi parol' },
  old_password: { ru: 'Текущий пароль', uz: 'Joriy parol' },
  change_password: { ru: 'Сменить пароль', uz: 'Parolni o‘zgartirish' },
  logout_everywhere: { ru: 'Завершить все сессии', uz: 'Barcha sessiyalarni uzish' },
  kill_session: { ru: 'Завершить сессию', uz: 'Sessiyani uzish' },
  current_session: { ru: 'текущая', uz: 'joriy' },
  last_seen: { ru: 'Активность', uz: 'Faollik' },
  device: { ru: 'Устройство', uz: 'Qurilma' },
  browser: { ru: 'Браузер', uz: 'Brauzer' },

  // adminka
  admin_stages: { ru: 'Этапы и канбан', uz: 'Bosqichlar va kanban' },
  admin_fields: { ru: 'Поля', uz: 'Maydonlar' },
  admin_required: { ru: 'Обязательные поля', uz: 'Majburiy maydonlar' },
  admin_layout: { ru: 'Расположение полей', uz: 'Maydonlar joylashuvi' },
  admin_roles: { ru: 'Роли и права', uz: 'Rollar va huquqlar' },
  admin_notify: { ru: 'Уведомления', uz: 'Bildirishnomalar' },
  admin_settings: { ru: 'Общие настройки', uz: 'Umumiy sozlamalar' },
  admin_telegram: { ru: 'Telegram', uz: 'Telegram' },
  setting_company_name: { ru: 'Название компании', uz: 'Kompaniya nomi' },
  setting_order_number_prefix: { ru: 'Префикс номера проекта', uz: 'Proyekt raqami prefiksi' },
  setting_order_number_padding: { ru: 'Цифр в номере', uz: 'Raqamdagi xonalar soni' },
  setting_default_lang: { ru: 'Язык по умолчанию', uz: 'Standart til' },
  setting_kick_oldest_session: {
    ru: 'Завершать самую старую сессию при превышении лимита',
    uz: 'Limit oshganda eng eski sessiyani uzish',
  },
  setting_kick_oldest_session_hint: {
    ru: 'Если выключено — новый вход будет запрещён при превышении лимита',
    uz: 'O‘chirilsa — limit oshganda yangi kirish taqiqlanadi',
  },
  setting_claim_enabled: { ru: 'Техник может взять проект себе', uz: 'Texnik proyektni o‘zi olishi mumkin' },
  setting_claim_enabled_hint: {
    ru: 'Кнопка «Взять себе» на канбане и в карточке проекта',
    uz: 'Kanban va proyekt kartasidagi «O‘zimga olaman» tugmasi',
  },
  setting_log_retention: {
    ru: 'Хранение системных логов',
    uz: 'Tizim loglarini saqlash muddati',
  },
  setting_log_retention_hint: {
    ru: 'Логи старше указанного количества дней будут автоматически удаляться. История перемещений проектов сохраняется отдельно.',
    uz: "Belgilangan kundan eski loglar avtomatik o'chiriladi. Proyekt harakatlari tarixi alohida saqlanadi.",
  },
  days: { ru: 'дней', uz: 'kun' },
  log_cleanup_btn: { ru: 'Очистить старые', uz: 'Eskilarini tozalash' },
  setting_max_upload: {
    ru: 'Максимальный размер файла',
    uz: 'Fayl hajmi bo‘yicha limit',
  },
  setting_max_upload_hint: {
    ru: 'Ограничение на размер одного загружаемого файла (МБ)',
    uz: 'Yuklanadigan bitta fayl uchun hajm chegarasi (MB)',
  },
  setting_max_upload_unlimited: { ru: 'Без ограничения', uz: 'Cheklovsiz' },

  // ish kalendari
  setting_workcalendar_title: { ru: 'Рабочий календарь дедлайнов', uz: 'Dedlaynlar uchun ish kalendari' },
  setting_deadline_calendar_enabled: {
    ru: 'Считать дедлайны этапов по рабочему календарю',
    uz: 'Bosqich dedlaynlarini ish kalendariga qarab hisoblash',
  },
  setting_deadline_calendar_enabled_hint: {
    ru: 'Если выключено — дедлайн этапа считается как простое время (норматив часов без учёта выходных)',
    uz: "O'chirilgan bo'lsa — bosqich dedlayni oddiy soat hisobida (dam kuni/bayram hisobga olinmay) belgilanadi",
  },
  setting_work_days: { ru: 'Рабочие дни недели', uz: 'Haftaning ish kunlari' },
  setting_work_hours: { ru: 'Рабочие часы', uz: 'Ish vaqti' },
  setting_overdue_reminder_hours: { ru: 'Повтор напоминания о просрочке, часов', uz: 'Kechikish eslatmasini qayta yuborish, soat' },
  setting_overdue_reminder_hours_hint: {
    ru: 'Через сколько часов повторно уведомлять, пока этап остаётся просроченным',
    uz: "Bosqich kechikkanicha turgan bo'lsa, necha soatda qayta ogohlantirilsin",
  },
  setting_order_deadline_reminder_hours: {
    ru: 'Повтор напоминания об общем дедлайне, часов',
    uz: 'Umumiy dedlayn eslatmasini qayta yuborish, soat',
  },
  setting_order_deadline_reminder_hours_hint: {
    ru: 'Если общий дедлайн проекта (не этапа) истёк — через сколько часов напоминать администратору повторно',
    uz: "Proyektning umumiy dedlayni (bosqich emas) o'tsa, adminga necha soatda qayta eslatilsin",
  },
  weekday_mon: { ru: 'Пн', uz: 'Dush' },
  weekday_tue: { ru: 'Вт', uz: 'Sesh' },
  weekday_wed: { ru: 'Ср', uz: 'Chor' },
  weekday_thu: { ru: 'Чт', uz: 'Pay' },
  weekday_fri: { ru: 'Пт', uz: 'Jum' },
  weekday_sat: { ru: 'Сб', uz: 'Shan' },
  weekday_sun: { ru: 'Вс', uz: 'Yak' },

  holidays_title: { ru: 'Праздники и выходные', uz: 'Bayramlar va dam olish kunlari' },
  holidays_hint: {
    ru: 'Даты без года повторяются каждый год (например Навруз). С годом — только в указанном году (например переходящие религиозные праздники).',
    uz: "Yilsiz sanalar har yili takrorlanadi (masalan Navro'z). Yil bilan — faqat o'sha yilga tegishli (masalan ko'chma diniy bayramlar).",
  },
  holiday_add: { ru: 'Добавить праздник', uz: "Bayram qo'shish" },
  holiday_day: { ru: 'День', uz: 'Kun' },
  holiday_month: { ru: 'Месяц', uz: 'Oy' },
  holiday_year: { ru: 'Год (необязательно)', uz: 'Yil (ixtiyoriy)' },
  holiday_year_recurring: { ru: 'Каждый год', uz: 'Har yili' },
  holiday_name_ru: { ru: 'Название (рус.)', uz: 'Nomi (rus)' },
  holiday_name_uz: { ru: 'Название (узб.)', uz: 'Nomi (uz)' },
  holiday_empty: { ru: 'Праздники не добавлены', uz: "Bayramlar qo'shilmagan" },

  // Telegram
  setting_telegram_title: { ru: 'Telegram-бот', uz: 'Telegram bot' },
  setting_telegram_token: { ru: 'Токен бота', uz: 'Bot tokeni' },
  setting_telegram_token_hint: {
    ru: 'Получите токен у @BotFather в Telegram и вставьте сюда',
    uz: "Telegramda @BotFather orqali token oling va shu yerga qo'ying",
  },
  setting_telegram_enabled: { ru: 'Telegram-интеграция включена', uz: 'Telegram integratsiyasi yoqilgan' },
  setting_telegram_test: { ru: 'Проверить', uz: 'Tekshirish' },
  setting_telegram_test_ok: { ru: 'Подключено: @', uz: 'Ulandi: @' },
  setting_telegram_test_fail: { ru: 'Не удалось подключиться — проверьте токен', uz: "Ulanmadi — tokenni tekshiring" },
  setting_telegram_digest_enabled: { ru: 'Отправлять список задач', uz: 'Vazifalar ro\'yxatini yuborish' },
  setting_telegram_digest_daily: { ru: 'Ежедневно', uz: 'Har kuni' },
  setting_telegram_digest_weekly: { ru: 'Еженедельно', uz: 'Har hafta' },
  setting_telegram_digest_time: { ru: 'Время отправки', uz: 'Yuborish vaqti' },
  setting_telegram_digest_weekday: { ru: 'День недели', uz: 'Hafta kuni' },
  telegram_contacts_title: { ru: 'Пользователи Telegram', uz: 'Telegram foydalanuvchilari' },
  telegram_contacts_hint: {
    ru: 'Список тех, кто нажал /start у бота. Привяжите каждого к сотруднику системы.',
    uz: "Botga /start bosganlar ro'yxati. Har birini tizim xodimiga biriktiring.",
  },
  telegram_contacts_empty: { ru: 'Пока никто не нажал /start', uz: "Hali hech kim /start bosmagan" },
  telegram_started_at: { ru: 'Дата /start', uz: '/start bosgan vaqt' },
  telegram_link: { ru: 'Привязать', uz: 'Biriktirish' },
  telegram_unlink: { ru: 'Отвязать', uz: 'Bekor qilish' },
  telegram_already_linked: {
    ru: 'Этот сотрудник уже привязан к другому Telegram-аккаунту',
    uz: 'Bu xodim allaqachon boshqa Telegram akkauntga biriktirilgan',
  },

  setting_tooth_labels_title: { ru: 'Номера зубов', uz: 'Tishlar raqami' },
  setting_tooth_labels_hint: {
    ru: 'Какой номер показывать для каждого зуба (можно поменять на свой)',
    uz: "Har bir tish uchun qaysi raqam ko'rsatilishi (o'zingizga moslab o'zgartirishingiz mumkin)",
  },

  stage_name: { ru: 'Название этапа', uz: 'Bosqich nomi' },
  stage_color: { ru: 'Цвет', uz: 'Rang' },
  stage_duration: { ru: 'Норматив, часов', uz: 'Normativ, soat' },
  allow_claim: { ru: 'Техник может взять сам', uz: 'Texnik o‘zi ola oladi' },
  require_next_assignee: {
    ru: 'Требовать выбор исполнителя при переводе',
    uz: 'O‘tkazishda bajaruvchini tanlash majburiy',
  },
  system_stage: { ru: 'Системный', uz: 'Tizim' },
  moment_create: { ru: 'При создании', uz: 'Yaratishda' },
  moment_move_in: { ru: 'При входе на этап', uz: 'Bosqichga kirishda' },
  moment_move_out: { ru: 'При выходе с этапа', uz: 'Bosqichdan chiqishda' },
  recipients: { ru: 'Кому отправлять', uz: 'Kimga yuborilsin' },
  notify_title: { ru: 'Заголовок', uz: 'Sarlavha' },
  notify_body: { ru: 'Текст', uz: 'Matn' },
  placeholders: { ru: 'Переменные', uz: 'O‘zgaruvchilar' },

  // loglar
  log_order: { ru: 'Лог проекта', uz: 'Proyekt logi' },
  log_system: { ru: 'Системный лог', uz: 'Tizim logi' },
  log_success: { ru: 'Успешно', uz: 'Muvaffaqiyatli' },
  log_failed: { ru: 'Неудачно', uz: 'Muvaffaqiyatsiz' },
  log_errors: { ru: 'Ошибки', uz: 'Xatolar' },
  level: { ru: 'Уровень', uz: 'Daraja' },
  category: { ru: 'Категория', uz: 'Kategoriya' },
  who: { ru: 'Кто', uz: 'Kim' },
  when: { ru: 'Когда', uz: 'Qachon' },
  what: { ru: 'Что', uz: 'Nima' },

  // bildirishnoma
  notifications: { ru: 'Уведомления', uz: 'Bildirishnomalar' },
  mark_all_read: { ru: 'Прочитать все', uz: 'Hammasini o‘qilgan qilish' },
  no_notifications: { ru: 'Уведомлений нет', uz: 'Bildirishnoma yo‘q' },

  // chat
  message_placeholder: { ru: 'Написать сообщение…', uz: 'Xabar yozish…' },
  send: { ru: 'Отправить', uz: 'Yuborish' },
  attach: { ru: 'Прикрепить', uz: 'Biriktirish' },
  no_messages: { ru: 'Сообщений пока нет', uz: 'Hozircha xabar yo‘q' },
  add_member: { ru: 'Добавить участника', uz: 'A\'zo qo\'shish' },

  // kanban karta maydonlari
  card_fields: { ru: 'Поля карточки', uz: 'Karta maydonlari' },
  cf_number: { ru: 'Номер', uz: 'Raqam' },
  cf_title: { ru: 'Название', uz: 'Nomi' },
  cf_patient: { ru: 'Пациент', uz: 'Patsent' },
  cf_doctor: { ru: 'Врач', uz: 'Vrach' },
  cf_services: { ru: 'Услуги', uz: 'Xizmatlar' },
  cf_responsible: { ru: 'Ответственный', uz: "Mas'ul" },
  cf_deadline: { ru: 'Дедлайн этапа', uz: 'Bosqich dedlayni' },
  cf_project_deadline: { ru: 'Дедлайн проекта', uz: 'Loyiha dedlayni' },
  cf_priority: { ru: 'Приоритет', uz: 'Prioritet' },
  cf_files: { ru: 'Файлы', uz: 'Fayllar' },

  // korzinka
  trash: { ru: 'Корзина', uz: 'Savat' },
  restore: { ru: 'Восстановить', uz: 'Tiklash' },
  deleted_at: { ru: 'Удалён', uz: "O'chirilgan" },
  order_restored: { ru: 'Проект восстановлен', uz: 'Proyekt tiklandi' },
  order_deleted_undo: { ru: 'Проект перемещён в корзину', uz: 'Proyekt savatga tashlandi' },
}

interface LangState {
  lang: Lang
  setLang: (l: Lang) => void
}

export const useLang = create<LangState>((set) => ({
  lang: (localStorage.getItem('omega_lang') as Lang) || 'ru',
  setLang: (l) => {
    localStorage.setItem('omega_lang', l)
    document.documentElement.lang = l
    set({ lang: l })
  },
}))

/** t('save') — joriy tilda matn. */
export function useT() {
  const lang = useLang((s) => s.lang)
  return (key: string) => dict[key]?.[lang] ?? key
}

/** Obyektning ru/uz maydonini joriy tilda oladi: nm(stage, 'name') */
export function useNm() {
  const lang = useLang((s) => s.lang)
  return <T extends Record<string, any>>(obj: T | null | undefined, base: string): string => {
    if (!obj) return '—'
    return (obj[`${base}_${lang}`] ?? obj[`${base}_ru`] ?? '') as string
  }
}
