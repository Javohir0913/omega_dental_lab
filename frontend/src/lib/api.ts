import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8010'

const ACCESS_KEY = 'omega_access'
const REFRESH_KEY = 'omega_refresh'

export const tokens = {
  get access() {
    return localStorage.getItem(ACCESS_KEY)
  },
  get refresh() {
    return localStorage.getItem(REFRESH_KEY)
  },
  set(access: string, refresh?: string) {
    localStorage.setItem(ACCESS_KEY, access)
    if (refresh) localStorage.setItem(REFRESH_KEY, refresh)
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY)
    localStorage.removeItem(REFRESH_KEY)
  },
}

export const api = axios.create({
  baseURL: `${API_URL}/api/v1`,
  timeout: 30000,
  paramsSerializer: {
    serialize: (params) => {
      const sp = new URLSearchParams()
      for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null) continue
        if (Array.isArray(value)) {
          for (const v of value) sp.append(key, String(v))
        } else {
          sp.append(key, String(value))
        }
      }
      return sp.toString()
    },
  },
})

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const t = tokens.access
  if (t) config.headers.Authorization = `Bearer ${t}`
  return config
})

/** Sessiya uzilganda ilova butun boshqarilishi kerak — App shu hodisani tinglaydi. */
export const AUTH_LOST = 'omega:auth-lost'
export function emitAuthLost(reason: string) {
  window.dispatchEvent(new CustomEvent(AUTH_LOST, { detail: { reason } }))
}

let refreshing: Promise<string | null> | null = null

async function refreshAccess(): Promise<string | null> {
  const rt = tokens.refresh
  if (!rt) return null
  try {
    const { data } = await axios.post(`${API_URL}/api/v1/auth/refresh`, { refresh_token: rt })
    tokens.set(data.access_token)
    return data.access_token as string
  } catch {
    return null
  }
}

api.interceptors.response.use(
  (r) => r,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & { _retried?: boolean }
    const status = error.response?.status
    const detail = (error.response?.data as { detail?: unknown })?.detail

    if (status === 401 && original && !original._retried) {
      // Sessiya admin tomonidan uzilgan / limit oshgan bo'lsa — refresh ham ishlamaydi
      if (detail === 'session_revoked' || detail === 'user_inactive') {
        tokens.clear()
        emitAuthLost(String(detail))
        return Promise.reject(error)
      }

      original._retried = true
      refreshing = refreshing ?? refreshAccess()
      const fresh = await refreshing
      refreshing = null

      if (fresh) {
        original.headers.Authorization = `Bearer ${fresh}`
        return api(original)
      }
      tokens.clear()
      emitAuthLost('expired')
    }
    return Promise.reject(error)
  },
)

/** Backenddan kelgan xatoni odam o'qiydigan matnga aylantiradi. */
export function errText(e: unknown, lang: 'ru' | 'uz' = 'ru'): string {
  const err = e as AxiosError<{ detail?: unknown }>
  const d = err?.response?.data?.detail

  if (typeof d === 'string') return ERRORS[d]?.[lang] ?? d
  if (d && typeof d === 'object') {
    const obj = d as Record<string, unknown>
    if (obj.error === 'required_fields' && Array.isArray(obj.fields)) {
      return (obj.fields as { message_ru: string; message_uz: string }[])
        .map((f) => (lang === 'ru' ? f.message_ru : f.message_uz))
        .join('\n')
    }
    if (obj[`message_${lang}`]) return String(obj[`message_${lang}`])
    if (obj.error) return ERRORS[String(obj.error)]?.[lang] ?? String(obj.error)
  }
  return lang === 'ru' ? 'Произошла ошибка' : 'Xatolik yuz berdi'
}

const ERRORS: Record<string, { ru: string; uz: string }> = {
  invalid_credentials: { ru: 'Неверный логин или пароль', uz: 'Login yoki parol xato' },
  user_inactive: { ru: 'Сотрудник заблокирован', uz: 'Xodim bloklangan' },
  session_revoked: { ru: 'Сессия завершена', uz: 'Sessiya tugatildi' },
  session_limit: { ru: 'Превышен лимит сессий', uz: 'Sessiya limiti oshdi' },
  forbidden: { ru: 'Недостаточно прав', uz: 'Huquq yetarli emas' },
  already_taken: { ru: 'Проект уже взят другим', uz: 'Proyektni boshqa olib bo‘lgan' },
  claim_disabled: { ru: 'Взятие проектов отключено', uz: 'Proyektni olish o‘chirilgan' },
  claim_not_allowed_on_stage: {
    ru: 'На этом этапе нельзя взять проект',
    uz: 'Bu bosqichda proyektni olib bo‘lmaydi',
  },
  stage_not_allowed_for_user: {
    ru: 'Вы не назначены на этот этап',
    uz: 'Siz bu bosqichga biriktirilmagansiz',
  },
  next_assignee_required: {
    ru: 'Выберите исполнителя следующего этапа',
    uz: 'Keyingi bosqich bajaruvchisini tanlang',
  },
  username_taken: { ru: 'Такой логин уже занят', uz: 'Bunday login band' },
  wrong_password: { ru: 'Текущий пароль неверный', uz: 'Joriy parol xato' },
  stage_has_active_orders: {
    ru: 'В этапе есть активные проекты',
    uz: 'Bosqichda aktiv proyektlar bor',
  },
  system_stage_cannot_be_deleted: {
    ru: 'Системный этап нельзя удалить',
    uz: 'Tizim bosqichini o‘chirib bo‘lmaydi',
  },
  role_in_use: { ru: 'Роль используется сотрудниками', uz: 'Rol xodimlarda ishlatilyapti' },
  file_type_not_allowed: { ru: 'Такой тип файла запрещён', uz: 'Bunday fayl turi taqiqlangan' },
  not_a_member: { ru: 'Вы не участник чата', uz: 'Siz chat a\'zosi emassiz' },
  empty_message: { ru: 'Сообщение не может быть пустым', uz: 'Xabar bo\'sh bo\'lishi mumkin emas' },
  frontend_url_not_set: {
    ru: 'Не задан адрес сайта в настройках (Общие настройки → Адрес сайта)',
    uz: "Sozlamalarda sayt manzili ko'rsatilmagan (Umumiy sozlamalar → Sayt manzili)",
  },
}
