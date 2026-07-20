import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { api, errText } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useLang, useNm, useT } from '@/i18n'
import { Avatar, Badge, Empty, Field, Spinner } from '@/components/ui'
import { toast } from '@/components/Toast'
import { dt, fromNow } from '@/lib/format'
import type { UserSessions } from '@/lib/types'

export default function ProfilePage() {
  const t = useT()
  const nm = useNm()
  const lang = useLang((s) => s.lang)
  const { me, load } = useAuth()
  const qc = useQueryClient()

  const [fullName, setFullName] = useState(me?.full_name ?? '')
  const [phone, setPhone] = useState(me?.phone ?? '')
  const [oldPwd, setOldPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [busy, setBusy] = useState(false)

  const { data: sessions, isLoading } = useQuery({
    queryKey: ['my-sessions'],
    queryFn: async () => (await api.get<UserSessions>('/users/me/sessions')).data,
  })

  async function saveProfile() {
    setBusy(true)
    try {
      await api.patch('/auth/me', { full_name: fullName.trim(), phone: phone || null })
      await load()
      toast(t('saved'))
    } catch (e) {
      toast(errText(e, lang), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function changePassword() {
    setBusy(true)
    try {
      await api.post('/auth/change-password', { old_password: oldPwd, new_password: newPwd })
      setOldPwd('')
      setNewPwd('')
      toast(t('saved'))
      qc.invalidateQueries({ queryKey: ['my-sessions'] })
    } catch (e) {
      toast(errText(e, lang), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function killSession(id: number) {
    try {
      await api.delete(`/users/me/sessions/${id}`)
      qc.invalidateQueries({ queryKey: ['my-sessions'] })
    } catch (e) {
      toast(errText(e, lang), 'error')
    }
  }

  if (!me) return <Spinner />

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      <div className="card flex items-center gap-4 p-4">
        <Avatar name={me.full_name} size={52} />
        <div>
          <div className="text-base font-semibold">{me.full_name}</div>
          <div className="text-xs text-ink-faint">@{me.username}</div>
          <div className="mt-1 flex flex-wrap gap-1">
            <Badge>{nm(me.role, 'name')}</Badge>
            {me.is_super && <Badge color="#7c3aed">super</Badge>}
            <Badge>
              {t('session_limit')}: {me.session_limit === 0 ? '∞' : me.session_limit}
            </Badge>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card p-4">
          <h2 className="mb-3 text-sm font-semibold">{t('nav_profile')}</h2>
          <Field label={t('full_name')}>
            <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </Field>
          <Field label={t('phone')}>
            <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <button className="btn-primary" onClick={saveProfile} disabled={busy || !fullName.trim()}>
            {t('save')}
          </button>
        </div>

        <div className="card p-4">
          <h2 className="mb-3 text-sm font-semibold">{t('change_password')}</h2>
          <Field label={t('old_password')}>
            <input
              type="password"
              className="input"
              value={oldPwd}
              onChange={(e) => setOldPwd(e.target.value)}
              autoComplete="current-password"
            />
          </Field>
          <Field label={t('new_password')} hint="min. 5">
            <input
              type="password"
              className="input"
              value={newPwd}
              onChange={(e) => setNewPwd(e.target.value)}
              autoComplete="new-password"
            />
          </Field>
          <button
            className="btn-primary"
            onClick={changePassword}
            disabled={busy || !oldPwd || newPwd.length < 5}
          >
            {t('save')}
          </button>
          <p className="mt-2 text-[11px] text-ink-faint">
            {lang === 'ru'
              ? 'Все остальные сессии будут завершены.'
              : 'Boshqa barcha sessiyalar uziladi.'}
          </p>
        </div>
      </div>

      {me.stages.length > 0 && (
        <div className="card p-4">
          <h2 className="mb-2 text-sm font-semibold">{t('can_do_stages')}</h2>
          <div className="flex flex-wrap gap-1.5">
            {me.stages.map((s) => (
              <Badge key={s.id} color={s.color}>
                {nm(s, 'name')}
              </Badge>
            ))}
          </div>
        </div>
      )}

      <div className="card p-4">
        <h2 className="mb-3 text-sm font-semibold">
          {t('sessions')}{' '}
          <span className="font-normal text-ink-faint">({sessions?.active_count ?? 0})</span>
        </h2>

        {isLoading ? (
          <Spinner />
        ) : (sessions?.sessions.length ?? 0) === 0 ? (
          <Empty />
        ) : (
          <div className="space-y-2">
            {sessions!.sessions.map((s) => (
              <div
                key={s.id}
                className={clsx(
                  'flex items-center gap-3 rounded-lg border p-2.5 text-xs',
                  s.is_current
                    ? 'border-brand-300 bg-brand-50/50 dark:bg-brand-900/20'
                    : 'border-surface-border dark:border-[#2f3745]',
                )}
              >
                <span className="text-lg">
                  {s.device === 'Mobile' ? '📱' : s.device === 'Tablet' ? '💻' : '🖥'}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium">{s.browser ?? '—'}</span>
                    <span className="text-ink-soft">· {s.os ?? '—'}</span>
                    {s.is_current && <Badge color="#10b981">{t('current_session')}</Badge>}
                  </div>
                  <div className="mt-0.5 text-ink-faint">
                    IP <span className="font-mono">{s.ip ?? '—'}</span> · {dt(s.created_at)} ·{' '}
                    {fromNow(s.last_seen_at)}
                  </div>
                </div>
                {!s.is_current && (
                  <button
                    onClick={() => killSession(s.id)}
                    className="shrink-0 rounded-md border border-surface-border px-2 py-1 text-[11px] text-ink-soft hover:border-rose-300 hover:text-rose-600 dark:border-[#2f3745]"
                  >
                    {t('kill_session')}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
