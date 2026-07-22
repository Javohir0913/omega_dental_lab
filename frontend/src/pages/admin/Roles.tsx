import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { api, errText } from '@/lib/api'
import { useLang, useNm, useT } from '@/i18n'
import { Badge, Field, Modal, Spinner } from '@/components/ui'
import { toast } from '@/components/Toast'
import type { Permission, Role } from '@/lib/types'

export default function AdminRoles() {
  const t = useT()
  const nm = useNm()
  const lang = useLang((s) => s.lang)
  const qc = useQueryClient()

  const [activeId, setActiveId] = useState<number | null>(null)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [dirty, setDirty] = useState(false)
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState(false)

  const { data: roles = [], isLoading } = useQuery({
    queryKey: ['roles-admin'],
    queryFn: async () => (await api.get<Role[]>('/roles')).data,
  })
  const { data: perms = [] } = useQuery({
    queryKey: ['permissions'],
    queryFn: async () => (await api.get<Permission[]>('/roles/permissions')).data,
  })

  const active = roles.find((r) => r.id === activeId) ?? roles[0] ?? null

  useEffect(() => {
    if (active) {
      setChecked(new Set((active.permissions ?? []).map((p) => p.code)))
      setDirty(false)
    }
  }, [active?.id, roles])

  const groups = useMemo(() => {
    const map = new Map<string, Permission[]>()
    for (const p of perms) {
      const key = lang === 'ru' ? p.group_ru : p.group_uz
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(p)
    }
    return [...map.entries()]
  }, [perms, lang])

  const isSuper = active?.code === 'super_admin'

  function toggle(code: string) {
    if (isSuper) return
    const next = new Set(checked)
    next.has(code) ? next.delete(code) : next.add(code)
    setChecked(next)
    setDirty(true)
  }

  function toggleGroup(list: Permission[]) {
    if (isSuper) return
    const all = list.every((p) => checked.has(p.code))
    const next = new Set(checked)
    list.forEach((p) => (all ? next.delete(p.code) : next.add(p.code)))
    setChecked(next)
    setDirty(true)
  }

  async function save() {
    if (!active) return
    setBusy(true)
    try {
      await api.patch(`/roles/${active.id}`, { permission_codes: [...checked] })
      toast(t('saved'))
      setDirty(false)
      qc.invalidateQueries({ queryKey: ['roles-admin'] })
      qc.invalidateQueries({ queryKey: ['roles'] })
    } catch (e) {
      toast(errText(e, lang), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function logoutUsers() {
    if (!active) return
    try {
      const { data } = await api.post(`/roles/${active.id}/logout-users`)
      toast(data.detail)
    } catch (e) {
      toast(errText(e, lang), 'error')
    }
  }

  if (isLoading) return <Spinner />

  return (
    <div className="flex flex-col gap-4 md:flex-row">
      {/* Rollar ro'yxati */}
      <div className="grid shrink-0 grid-cols-2 gap-1 sm:grid-cols-3 md:block md:w-52 md:space-y-1">
        {roles.map((r) => (
          <button
            key={r.id}
            onClick={() => setActiveId(r.id)}
            className={clsx(
              'w-full rounded-lg px-2.5 py-2 text-left text-sm transition-colors',
              active?.id === r.id
                ? 'bg-brand-50 font-medium text-brand-700 dark:bg-brand-900/30'
                : 'text-ink-soft hover:bg-surface-muted dark:hover:bg-[#222836]',
            )}
          >
            <div className="truncate">{nm(r, 'name')}</div>
            <div className="mt-0.5 flex items-center gap-1">
              <span className="font-mono text-[10px] text-ink-faint">{r.code}</span>
              {r.is_system && <Badge>sys</Badge>}
            </div>
          </button>
        ))}

        <button className="btn-ghost col-span-full mt-1 w-full text-xs md:mt-2" onClick={() => setCreating(true)}>
          + {t('add')}
        </button>
      </div>

      {/* Huquqlar matritsasi */}
      <div className="min-w-0 flex-1">
        {!active ? null : (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold">{nm(active, 'name')}</h2>
              <Badge>{checked.size} / {perms.length}</Badge>
              <div className="flex-1" />
              <button className="btn-ghost text-xs" onClick={logoutUsers}>
                {lang === 'ru' ? 'Перелогинить сотрудников' : 'Xodimlarni qayta kirishga majburlash'}
              </button>
              {dirty && (
                <button className="btn-primary" onClick={save} disabled={busy}>
                  {t('save')}
                </button>
              )}
            </div>

            {isSuper && (
              <div className="mb-3 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-xs text-brand-800 dark:border-brand-900/40 dark:bg-brand-900/20 dark:text-brand-200">
                {lang === 'ru'
                  ? 'Супер администратор всегда имеет все права — матрица только для просмотра.'
                  : 'Super administrator doim barcha huquqqa ega — matritsa faqat ko‘rish uchun.'}
              </div>
            )}

            <div className="space-y-3">
              {groups.map(([group, list]) => {
                const on = list.filter((p) => checked.has(p.code)).length
                return (
                  <div key={group} className="card p-3">
                    <button
                      onClick={() => toggleGroup(list)}
                      disabled={isSuper}
                      className="mb-2 flex w-full items-center gap-2 text-left"
                    >
                      <span className="text-xs font-semibold">{group}</span>
                      <Badge color={on === list.length ? '#22c55e' : on ? '#d97706' : undefined}>
                        {on}/{list.length}
                      </Badge>
                    </button>

                    <div className="grid gap-1 sm:grid-cols-2">
                      {list.map((p) => (
                        <label
                          key={p.code}
                          className={clsx(
                            'flex items-start gap-2 rounded-md px-1.5 py-1 text-xs',
                            !isSuper && 'cursor-pointer hover:bg-surface-muted dark:hover:bg-[#222836]',
                          )}
                        >
                          <input
                            type="checkbox"
                            className="mt-0.5"
                            checked={checked.has(p.code)}
                            disabled={isSuper}
                            onChange={() => toggle(p.code)}
                          />
                          <span className="min-w-0">
                            <span className="block">{lang === 'ru' ? p.name_ru : p.name_uz}</span>
                            <span className="block font-mono text-[10px] text-ink-faint">{p.code}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      {creating && (
        <RoleForm
          perms={perms}
          onClose={() => setCreating(false)}
          onDone={() => {
            qc.invalidateQueries({ queryKey: ['roles-admin'] })
            qc.invalidateQueries({ queryKey: ['roles'] })
          }}
        />
      )}
    </div>
  )
}

function RoleForm({
  perms,
  onClose,
  onDone,
}: {
  perms: Permission[]
  onClose: () => void
  onDone: () => void
}) {
  const t = useT()
  const lang = useLang((s) => s.lang)
  const [form, setForm] = useState({ code: '', name_ru: '', name_uz: '', default_session_limit: 1 })
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    try {
      await api.post('/roles', { ...form, permission_codes: [] })
      toast(t('saved'))
      onDone()
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
      title={t('add')}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            {t('cancel')}
          </button>
          <button
            className="btn-primary"
            onClick={submit}
            disabled={busy || !form.code || !form.name_ru.trim() || !form.name_uz.trim()}
          >
            {t('create')}
          </button>
        </>
      }
    >
      <p className="mb-3 text-xs text-ink-faint">
        {lang === 'ru'
          ? 'Роль создаётся без прав — отметьте их в матрице после создания.'
          : 'Rol huquqsiz yaratiladi — yaratgandan keyin matritsada belgilang.'}
      </p>
      <Field label="Код (латиница)" required>
        <input
          className="input"
          value={form.code}
          onChange={(e) =>
            setForm({ ...form, code: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })
          }
          autoFocus
        />
      </Field>
      <Field label="Название (RU)" required>
        <input
          className="input"
          value={form.name_ru}
          onChange={(e) => setForm({ ...form, name_ru: e.target.value })}
        />
      </Field>
      <Field label="Nomi (UZ)" required>
        <input
          className="input"
          value={form.name_uz}
          onChange={(e) => setForm({ ...form, name_uz: e.target.value })}
        />
      </Field>
      <Field label={t('session_limit')} hint={t('session_limit_hint')}>
        <input
          type="number"
          min={0}
          className="input"
          value={form.default_session_limit}
          onChange={(e) => setForm({ ...form, default_session_limit: Number(e.target.value) })}
        />
      </Field>
    </Modal>
  )
}
