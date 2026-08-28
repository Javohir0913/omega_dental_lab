import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { api, errText } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useLang, useNm, useT } from '@/i18n'
import { Avatar, Badge, Empty, Field, Modal, NumberInput, PasswordInput, Spinner } from '@/components/ui'
import { toast } from '@/components/Toast'
import { dt, fromNow } from '@/lib/format'
import type { Page, Role, ServiceItem, Stage, User, UserSessions } from '@/lib/types'

export default function UsersPage() {
  const t = useT()
  const nm = useNm()
  const lang = useLang((s) => s.lang)
  const { can } = useAuth()
  const qc = useQueryClient()

  const [q, setQ] = useState('')
  const [roleId, setRoleId] = useState<number | ''>('')
  const [edit, setEdit] = useState<User | null>(null)
  const [creating, setCreating] = useState(false)
  const [pwdFor, setPwdFor] = useState<User | null>(null)
  const [sessionsFor, setSessionsFor] = useState<User | null>(null)

  const { data: roles = [] } = useQuery({
    queryKey: ['roles'],
    queryFn: async () => (await api.get<Role[]>('/roles')).data,
  })

  const { data, isLoading } = useQuery({
    queryKey: ['users', q, roleId],
    queryFn: async () =>
      (
        await api.get<Page<User>>('/users', {
          params: { q: q || undefined, role_id: roleId || undefined, size: 100 },
        })
      ).data,
  })

  const items = data?.items ?? []

  return (
    <div className="p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          className="input max-w-[220px]"
          placeholder={t('search')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          className="input max-w-[180px]"
          value={roleId}
          onChange={(e) => setRoleId(e.target.value ? Number(e.target.value) : '')}
        >
          <option value="">{t('role')}: {t('all')}</option>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {nm(r, 'name')}
            </option>
          ))}
        </select>
        <div className="flex-1" />
        <span className="text-xs text-ink-faint">{data?.total ?? 0}</span>
        {can('user.manage') && (
          <button className="btn-primary" onClick={() => setCreating(true)}>
            + {t('new_user')}
          </button>
        )}
      </div>

      {isLoading ? (
        <Spinner />
      ) : items.length === 0 ? (
        <Empty />
      ) : (
        <div className="card overflow-x-auto">
          <table className="table-wide w-full text-sm">
            <thead className="border-b border-surface-border text-left text-xs text-ink-faint dark:border-[#2a3140]">
              <tr>
                <th className="px-3 py-2 font-medium">{t('full_name')}</th>
                <th className="px-3 py-2 font-medium">{t('role')}</th>
                <th className="px-3 py-2 font-medium">{t('can_do_stages')}</th>
                <th className="px-3 py-2 font-medium">{t('session_limit')}</th>
                <th className="px-3 py-2 font-medium">{t('last_seen')}</th>
                <th className="w-28" />
              </tr>
            </thead>
            <tbody>
              {items.map((u) => (
                <tr
                  key={u.id}
                  className={clsx(
                    'border-b border-surface-border last:border-0 hover:bg-surface-muted dark:border-[#2a3140] dark:hover:bg-[#222836]',
                    !u.is_active && 'opacity-50',
                  )}
                >
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Avatar name={u.full_name} />
                      <div className="min-w-0">
                        <div className="truncate font-medium">{u.full_name}</div>
                        <div className="text-[10px] text-ink-faint">@{u.username}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <Badge>{nm(u.role, 'name')}</Badge>
                  </td>
                  <td className="max-w-[240px] px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {u.stages.slice(0, 3).map((s) => (
                        <Badge key={s.id} color={s.color}>
                          {nm(s, 'name')}
                        </Badge>
                      ))}
                      {u.stages.length > 3 && <Badge>+{u.stages.length - 3}</Badge>}
                      {u.stages.length === 0 && <span className="text-xs text-ink-faint">—</span>}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {u.session_limit === 0 ? '∞' : u.session_limit}
                  </td>
                  <td className="px-3 py-2 text-xs text-ink-soft">
                    {u.last_login_at ? fromNow(u.last_login_at) : '—'}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-1">
                      {can('user.session') && (
                        <button
                          onClick={() => setSessionsFor(u)}
                          className="rounded p-1 text-ink-faint hover:text-brand-600"
                          title={t('sessions')}
                        >
                          🖥
                        </button>
                      )}
                      {can('user.password') && (
                        <button
                          onClick={() => setPwdFor(u)}
                          className="rounded p-1 text-ink-faint hover:text-brand-600"
                          title={t('set_password')}
                        >
                          🔑
                        </button>
                      )}
                      {can('user.manage') && (
                        <button
                          onClick={() => setEdit(u)}
                          className="rounded p-1 text-ink-faint hover:text-brand-600"
                        >
                          ✎
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(creating || edit) && (
        <UserForm
          user={edit ?? undefined}
          roles={roles}
          onClose={() => {
            setCreating(false)
            setEdit(null)
          }}
          onDone={() => qc.invalidateQueries({ queryKey: ['users'] })}
        />
      )}

      {pwdFor && <PasswordModal user={pwdFor} onClose={() => setPwdFor(null)} />}
      {sessionsFor && <SessionsModal user={sessionsFor} onClose={() => setSessionsFor(null)} />}
    </div>
  )
}

/* ---------------- Xodim formasi ---------------- */

function UserForm({
  user,
  roles,
  onClose,
  onDone,
}: {
  user?: User
  roles: Role[]
  onClose: () => void
  onDone: () => void
}) {
  const t = useT()
  const nm = useNm()
  const lang = useLang((s) => s.lang)
  const { me } = useAuth()
  const edit = Boolean(user)
  const usernameLocked = edit && user!.role.code === 'super_admin' && user!.id !== me?.id

  const [form, setForm] = useState({
    username: user?.username ?? '',
    password: '',
    full_name: user?.full_name ?? '',
    phone: user?.phone ?? '',
    email: user?.email ?? '',
    role_id: user?.role.id ?? roles.find((r) => r.code === 'technician')?.id ?? roles[0]?.id ?? 0,
    lang: user?.lang ?? 'ru',
    session_limit: user?.session_limit ?? 1,
    is_active: user?.is_active ?? true,
    note: user?.note ?? '',
  })
  const [stageIds, setStageIds] = useState<number[]>(user?.stages.map((s) => s.id) ?? [])
  const [serviceIds, setServiceIds] = useState<number[]>(user?.services.map((s) => s.id) ?? [])
  const [controlStageIds, setControlStageIds] = useState<number[]>(
    user?.control_stages.map((s) => s.id) ?? [],
  )
  const [busy, setBusy] = useState(false)

  const { data: stages = [] } = useQuery({
    queryKey: ['stages'],
    queryFn: async () => (await api.get<Stage[]>('/stages')).data,
  })
  const { data: services = [] } = useQuery({
    queryKey: ['services-select'],
    queryFn: async () => (await api.get<ServiceItem[]>('/services')).data,
  })

  async function submit() {
    setBusy(true)
    const body: Record<string, unknown> = {
      full_name: form.full_name.trim(),
      role_id: form.role_id,
      phone: form.phone || null,
      email: form.email || null,
      note: form.note || null,
      lang: form.lang,
      session_limit: form.session_limit,
      is_active: form.is_active,
      stage_ids: stageIds,
      service_ids: serviceIds,
      control_stage_ids: controlStageIds,
    }
    try {
      if (edit) {
        const patchBody = usernameLocked ? body : { ...body, username: form.username.trim() }
        await api.patch(`/users/${user!.id}`, patchBody)
      } else {
        await api.post('/users', { ...body, username: form.username.trim(), password: form.password })
      }
      toast(t('saved'))
      onDone()
      onClose()
    } catch (e) {
      toast(errText(e, lang), 'error')
    } finally {
      setBusy(false)
    }
  }

  const workStages = stages.filter((s) => s.kind === 'work')
  const controlStages = stages.filter((s) => s.control_enabled)

  return (
    <Modal
      open
      onClose={onClose}
      wide
      title={edit ? `${user!.full_name} — ${t('edit')}` : t('new_user')}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            {t('cancel')}
          </button>
          <button
            className="btn-primary"
            onClick={submit}
            disabled={
              busy || !form.full_name.trim() || (!edit && (!form.username.trim() || form.password.length < 5))
            }
          >
            {t('save')}
          </button>
        </>
      }
    >
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field label={t('full_name')} required>
          <input
            className="input"
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            autoFocus
          />
        </Field>

        <Field label={t('role')} required>
          <select
            className="input"
            value={form.role_id}
            onChange={(e) => {
              const rid = Number(e.target.value)
              const r = roles.find((x) => x.id === rid)
              setForm({
                ...form,
                role_id: rid,
                // rol almashganda uning default limitini taklif qilamiz
                session_limit: r?.default_session_limit ?? form.session_limit,
              })
            }}
          >
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {nm(r, 'name')}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label={t('username')}
          required
          hint={
            usernameLocked
              ? lang === 'ru'
                ? 'Логин супер администратора может менять только он сам'
                : "Super administrator login'ini faqat o'zi o'zgartira oladi"
              : null
          }
        >
          <input
            className="input"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            autoComplete="off"
            disabled={usernameLocked}
          />
        </Field>

        {!edit && (
          <Field label={t('password')} required hint="min. 5">
            <PasswordInput
              value={form.password}
              onChange={(v) => setForm({ ...form, password: v })}
              autoComplete="new-password"
            />
          </Field>
        )}

        <Field label={t('phone')}>
          <input
            className="input"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
        </Field>

        <Field label="Email">
          <input
            className="input"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </Field>

        <Field label={t('session_limit')} hint={t('session_limit_hint')}>
          <NumberInput
            min={0}
            className="input"
            value={form.session_limit}
            onChange={(v) => setForm({ ...form, session_limit: v ?? 0 })}
          />
        </Field>

        <Field label="Язык / Til">
          <select
            className="input"
            value={form.lang}
            onChange={(e) => setForm({ ...form, lang: e.target.value as 'ru' | 'uz' })}
          >
            <option value="ru">Русский</option>
            <option value="uz">O‘zbekcha</option>
          </select>
        </Field>
      </div>

      <Field label={t('can_do_stages')}>
        <div className="flex flex-wrap gap-1.5">
          {workStages.map((s) => {
            const on = stageIds.includes(s.id)
            return (
              <button
                key={s.id}
                type="button"
                onClick={() =>
                  setStageIds((p) => (on ? p.filter((x) => x !== s.id) : [...p, s.id]))
                }
                className="chip border transition-all"
                style={{
                  backgroundColor: on ? `${s.color}22` : 'transparent',
                  borderColor: on ? s.color : '#e4e7ec',
                  color: on ? s.color : '#8d96a3',
                }}
              >
                {nm(s, 'name')}
              </button>
            )
          })}
        </div>
      </Field>

      {controlStages.length > 0 && (
        <Field label={t('control_stages')}>
          <div className="flex flex-wrap gap-1.5">
            {controlStages.map((s) => {
              const on = controlStageIds.includes(s.id)
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() =>
                    setControlStageIds((p) => (on ? p.filter((x) => x !== s.id) : [...p, s.id]))
                  }
                  className="chip border transition-all"
                  style={{
                    backgroundColor: on ? `${s.color}22` : 'transparent',
                    borderColor: on ? s.color : '#e4e7ec',
                    color: on ? s.color : '#8d96a3',
                  }}
                >
                  {nm(s, 'name')}
                </button>
              )
            })}
          </div>
        </Field>
      )}

      <Field label={t('can_do_services')}>
        <div className="flex flex-wrap gap-1.5">
          {services.map((s) => {
            const on = serviceIds.includes(s.id)
            return (
              <button
                key={s.id}
                type="button"
                onClick={() =>
                  setServiceIds((p) => (on ? p.filter((x) => x !== s.id) : [...p, s.id]))
                }
                className={
                  on
                    ? 'chip border border-brand-300 bg-brand-100 text-brand-700'
                    : 'chip border border-surface-border text-ink-faint dark:border-[#2f3745]'
                }
              >
                {lang === 'ru' ? s.name_ru : s.name_uz}
              </button>
            )
          })}
        </div>
      </Field>

      <Field label={t('description')}>
        <textarea
          className="input min-h-[50px]"
          value={form.note}
          onChange={(e) => setForm({ ...form, note: e.target.value })}
        />
      </Field>

      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={form.is_active}
          onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
        />
        {t('active')}
      </label>
    </Modal>
  )
}

/* ---------------- Parol qo'yish ---------------- */

function PasswordModal({ user, onClose }: { user: User; onClose: () => void }) {
  const t = useT()
  const lang = useLang((s) => s.lang)
  const [pwd, setPwd] = useState('')
  const [logoutAll, setLogoutAll] = useState(true)
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    try {
      await api.post(`/users/${user.id}/password`, {
        new_password: pwd,
        logout_everywhere: logoutAll,
      })
      toast(t('saved'))
      onClose()
    } catch (e) {
      toast(errText(e, lang), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`${t('set_password')} — ${user.full_name}`}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            {t('cancel')}
          </button>
          <button className="btn-primary" onClick={submit} disabled={busy || pwd.length < 5}>
            {t('save')}
          </button>
        </>
      }
    >
      <Field label={t('new_password')} required hint="min. 5">
        <PasswordInput value={pwd} onChange={setPwd} autoFocus autoComplete="new-password" />
      </Field>
      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input type="checkbox" checked={logoutAll} onChange={(e) => setLogoutAll(e.target.checked)} />
        {t('logout_everywhere')}
      </label>
      <p className="mt-2 text-[11px] text-ink-faint">
        {lang === 'ru'
          ? 'Текущий пароль сотрудника знать не нужно.'
          : 'Xodimning joriy parolini bilish shart emas.'}
      </p>
    </Modal>
  )
}

/* ---------------- Sessiyalar ---------------- */

function SessionsModal({ user, onClose }: { user: User; onClose: () => void }) {
  const t = useT()
  const lang = useLang((s) => s.lang)
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['sessions', user.id],
    queryFn: async () => (await api.get<UserSessions>(`/users/${user.id}/sessions`)).data,
  })

  async function kill(sessionId: number) {
    try {
      await api.delete(`/users/${user.id}/sessions/${sessionId}`)
      qc.invalidateQueries({ queryKey: ['sessions', user.id] })
      toast(t('saved'))
    } catch (e) {
      toast(errText(e, lang), 'error')
    }
  }

  async function killAll() {
    try {
      await api.delete(`/users/${user.id}/sessions`)
      qc.invalidateQueries({ queryKey: ['sessions', user.id] })
      toast(t('saved'))
    } catch (e) {
      toast(errText(e, lang), 'error')
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      wide
      title={`${t('sessions')} — ${user.full_name}`}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            {t('close')}
          </button>
          {(data?.sessions.length ?? 0) > 0 && (
            <button className="btn-danger" onClick={killAll}>
              {t('logout_everywhere')}
            </button>
          )}
        </>
      }
    >
      <div className="mb-3 flex items-center gap-3 text-xs">
        <span className="text-ink-faint">{t('session_limit')}:</span>
        <Badge>{data?.session_limit === 0 ? '∞' : data?.session_limit}</Badge>
        <span className="text-ink-faint">Активных:</span>
        <Badge color={(data?.active_count ?? 0) > (data?.session_limit ?? 0) && data?.session_limit !== 0 ? '#e11d48' : '#3768b0'}>
          {data?.active_count ?? 0}
        </Badge>
      </div>

      {isLoading ? (
        <Spinner />
      ) : (data?.sessions.length ?? 0) === 0 ? (
        <Empty text={lang === 'ru' ? 'Нет активных сессий' : 'Aktiv sessiya yo‘q'} />
      ) : (
        <div className="space-y-2">
          {data!.sessions.map((s) => (
            <div
              key={s.id}
              className={clsx(
                'flex items-center gap-3 rounded-lg border p-2.5',
                s.is_current
                  ? 'border-brand-300 bg-brand-50/50 dark:bg-brand-900/20'
                  : 'border-surface-border dark:border-[#2f3745]',
              )}
            >
              <span className="text-xl">
                {s.device === 'Mobile' ? '📱' : s.device === 'Tablet' ? '💻' : '🖥'}
              </span>

              <div className="min-w-0 flex-1 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{s.browser ?? '—'}</span>
                  <span className="text-ink-faint">·</span>
                  <span className="text-ink-soft">{s.os ?? '—'}</span>
                  {s.device_name && (
                    <>
                      <span className="text-ink-faint">·</span>
                      <span className="text-ink-soft">{s.device_name}</span>
                    </>
                  )}
                  {s.is_current && <Badge color="#10b981">{t('current_session')}</Badge>}
                </div>
                <div className="mt-0.5 text-ink-faint">
                  IP: <span className="font-mono">{s.ip ?? '—'}</span> · {t('login')}:{' '}
                  {dt(s.created_at)} · {t('last_seen')}: {fromNow(s.last_seen_at)}
                </div>
              </div>

              <button
                onClick={() => kill(s.id)}
                className="shrink-0 rounded-md border border-surface-border px-2 py-1 text-[11px] text-ink-soft hover:border-rose-300 hover:text-rose-600 dark:border-[#2f3745]"
              >
                {t('kill_session')}
              </button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}
