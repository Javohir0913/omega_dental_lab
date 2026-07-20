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
  admin_roles: { ru: 'Роли и права', uz: 'Rollar va huquqlar' },
  admin_notify: { ru: 'Уведомления', uz: 'Bildirishnomalar' },
  admin_settings: { ru: 'Общие настройки', uz: 'Umumiy sozlamalar' },
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
