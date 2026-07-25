export type Lang = 'ru' | 'uz'

export interface Role {
  id: number
  code: string
  name_ru: string
  name_uz: string
  is_system?: boolean
  is_active?: boolean
  default_session_limit?: number
  permissions?: Permission[]
}

export interface Permission {
  id: number
  code: string
  group_ru: string
  group_uz: string
  name_ru: string
  name_uz: string
}

export interface Stage {
  id: number
  code: string
  name_ru: string
  name_uz: string
  kind: 'new' | 'work' | 'success' | 'fail'
  color: string
  sort: number
  is_active: boolean
  duration_hours: number | null
  allow_claim: boolean
  require_next_assignee: boolean
}

export interface ServiceItem {
  id: number
  code: string | null
  name_ru: string
  name_uz: string
  note: string | null
  sort: number
  is_active: boolean
}

export interface UserShort {
  id: number
  full_name: string
  avatar: string | null
}

export interface User {
  id: number
  username: string
  full_name: string
  phone: string | null
  email: string | null
  avatar: string | null
  note: string | null
  is_active: boolean
  lang: Lang
  session_limit: number
  last_login_at: string | null
  created_at: string
  role: Role
  stages: Stage[]
  services: ServiceItem[]
}

export interface Me extends User {
  permissions: string[]
  is_super: boolean
}

export interface Session {
  id: number
  ip: string | null
  device: string | null
  device_name: string | null
  browser: string | null
  os: string | null
  created_at: string
  last_seen_at: string
  expires_at: string
  revoked_at: string | null
  revoked_reason: string | null
  is_current: boolean
}

export interface UserSessions {
  user_id: number
  full_name: string
  session_limit: number
  active_count: number
  sessions: Session[]
}

export interface Doctor {
  id: number
  full_name: string
  phone: string | null
  clinic: string | null
  note: string | null
  is_active: boolean
  created_at: string
}

export interface Patient {
  id: number
  full_name: string
  phone: string | null
  birth_date: string | null
  gender: string | null
  note: string | null
  is_active: boolean
  doctor: { id: number; full_name: string } | null
  created_at: string
  custom_fields: Record<string, unknown>
}

export interface FileOut {
  id: number
  name: string
  mime: string | null
  size: number
  is_image: boolean
  url: string
  uploaded_by: UserShort | null
  created_at: string
}

export interface FileAsset {
  id: number
  name: string
  mime: string | null
  size: number
  is_image: boolean
  url: string
  uploaded_by: UserShort | null
  created_at: string
}

export interface OrderCard {
  id: number
  number: string
  title: string
  stage_id: number
  priority: number
  sort: number
  is_closed: boolean
  color: string | null
  deadline: string | null
  stage_deadline: string | null
  stage_entered_at: string | null
  created_at: string
  patient: { id: number; full_name: string; phone: string | null } | null
  doctor: { id: number; full_name: string } | null
  responsible: UserShort | null
  services: ServiceItem[]
  custom_fields: Record<string, unknown>
  photo: FileOut | null
  teeth: number[] | null
  is_overdue: boolean
  can_move: boolean
  can_move_back: boolean
  can_claim: boolean
  files_count: number
  has_3d_files: boolean
  unread_messages: number
  unread_files_count: number
  deleted_at: string | null
  is_paused: boolean
  paused_at: string | null
  pause_reason: string | null
  paused_by: UserShort | null
  can_resume: boolean
}

export interface OrderDetail extends OrderCard {
  description: string | null
  close_reason: string | null
  closed_at: string | null
  created_by: UserShort | null
  stage: Stage | null
  chat_id: number | null
  files: FileAsset[]
}

export interface StageHistory {
  id: number
  stage_id: number
  stage_name_ru: string
  stage_name_uz: string
  responsible: UserShort | null
  moved_by: UserShort | null
  entered_at: string
  left_at: string | null
  duration_sec: number | null
  was_overdue: boolean
  comment: string | null
}

export interface KanbanColumn {
  stage: Stage
  total: number
  orders: OrderCard[]
}

export interface CustomField {
  id: number
  entity: 'order' | 'patient' | 'doctor' | 'user'
  code: string
  label_ru: string
  label_uz: string
  type: string
  options: { value: string; label_ru: string; label_uz: string }[] | null
  default_value: string | null
  hint_ru: string | null
  hint_uz: string | null
  required_on_create: boolean
  show_in_card: boolean
  show_in_list: boolean
  sort: number
  is_active: boolean
}

export interface OrderFieldSection {
  id: number
  code: string
  name_ru: string
  name_uz: string
  sort: number
}

export interface LayoutField {
  field_ref: string
  kind: 'system' | 'custom'
  label_ru: string
  label_uz: string
  custom_field: CustomField | null
}

export interface LayoutSection {
  id: number | null
  code: string
  name_ru: string
  name_uz: string
  sort: number
  fields: LayoutField[]
}

export interface StageRequirement {
  id: number
  stage_id: number
  field_ref: string
  moment: 'create' | 'move_in' | 'move_out'
  message_ru: string | null
  message_uz: string | null
  is_active: boolean
  label_ru: string
  label_uz: string
}

export interface FieldRef {
  field_ref: string
  label_ru: string
  label_uz: string
  kind: 'system' | 'custom'
}

export interface NotifyTemplate {
  id: number
  event: string
  stage_id: number | null
  is_active: boolean
  recipients: string[]
  notify_actor: boolean
  send_telegram: boolean
  title_ru: string
  title_uz: string
  body_ru: string
  body_uz: string
}

export interface Holiday {
  id: number
  month: number
  day: number
  year: number | null
  name_ru: string
  name_uz: string
}

export interface TelegramContact {
  id: number
  chat_id: number
  tg_username: string | null
  tg_first_name: string | null
  started_at: string
  user: UserShort | null
}

export interface NotifyMeta {
  events: { code: string; label_ru: string; label_uz: string }[]
  recipient_tokens: { token: string; label_ru: string; label_uz: string }[]
  placeholders: { key: string; label_ru: string; label_uz: string }[]
}

export interface NotificationItem {
  id: number
  event: string
  title: string
  body: string | null
  link: { type: string; id: number; order_id?: number } | null
  order_id: number | null
  is_read: boolean
  created_at: string
}

export interface ChatItem {
  id: number
  type: 'order' | 'direct' | 'group'
  title: string | null
  order_id: number | null
  order_is_closed: boolean
  order_number: string | null
  last_message_at: string | null
  last_message: string | null
  unread: number
  hidden: boolean
  members: UserShort[]
  peer: UserShort | null
}

export interface ChatMessage {
  id: number
  chat_id: number
  order_id?: number | null
  text: string | null
  is_system: boolean
  reply_to_id: number | null
  author: UserShort | null
  attachments: FileAsset[]
  created_at: string
  edited_at: string | null
  deleted_at: string | null
}

export interface LogEntry {
  id: number
  created_at: string
  level: 'info' | 'warning' | 'error'
  category: string
  action: string
  is_success: boolean
  actor: UserShort | null
  actor_name: string | null
  order_id: number | null
  entity: string | null
  entity_id: number | null
  message_ru: string
  message_uz: string
  meta: Record<string, unknown> | null
  ip?: string | null
  user_agent?: string | null
  path?: string | null
  method?: string | null
  status_code?: number | null
  error_text?: string | null
}

export interface Page<T> {
  items: T[]
  total: number
  page: number
  size: number
}

/** Order tahrirlash payload (PATCH /orders/:id ga yuboriladi) */
export interface OrderUpdatePayload {
  title?: string
  photo_file_id?: number | null
  patient_id?: number | null
  doctor_id?: number | null
  service_ids?: number[]
  deadline?: string | null
  priority?: number | null
  description?: string | null
  teeth?: number[]
  custom_fields?: Record<string, unknown>
}

/** Majburiy maydon xatosi (422) */
export interface RequirementError {
  error: 'required_fields'
  moment: string
  stage_id: number
  fields: {
    field_ref: string
    label_ru: string
    label_uz: string
    message_ru: string
    message_uz: string
  }[]
}
