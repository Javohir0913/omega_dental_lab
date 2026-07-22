import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, errText } from '@/lib/api'
import { useLang, useT } from '@/i18n'
import { Empty, SearchSelect, Spinner } from '@/components/ui'
import { toast } from '@/components/Toast'
import { dt } from '@/lib/format'
import type { Page, TelegramContact, User } from '@/lib/types'

export default function AdminTelegram() {
  const t = useT()
  const lang = useLang((s) => s.lang)
  const qc = useQueryClient()
  const [search, setSearch] = useState<Record<number, string>>({})
  const [busyId, setBusyId] = useState<number | null>(null)

  const { data: contacts = [], isLoading } = useQuery({
    queryKey: ['admin-telegram-contacts'],
    queryFn: async () => (await api.get<TelegramContact[]>('/admin/telegram/contacts')).data,
  })

  const { data: users } = useQuery({
    queryKey: ['users-select'],
    queryFn: async () => (await api.get<Page<User>>('/users', { params: { size: 200 } })).data,
  })

  const linkedUserIds = new Set(contacts.filter((c) => c.user).map((c) => c.user!.id))

  async function link(contact: TelegramContact, userId: number) {
    setBusyId(contact.id)
    try {
      await api.post(`/admin/telegram/contacts/${contact.id}/link`, { user_id: userId })
      qc.invalidateQueries({ queryKey: ['admin-telegram-contacts'] })
    } catch (e) {
      const status = (e as any)?.response?.status
      toast(status === 409 ? t('telegram_already_linked') : errText(e, lang), 'error')
    } finally {
      setBusyId(null)
    }
  }

  async function unlink(contact: TelegramContact) {
    setBusyId(contact.id)
    try {
      await api.post(`/admin/telegram/contacts/${contact.id}/unlink`)
      qc.invalidateQueries({ queryKey: ['admin-telegram-contacts'] })
    } catch (e) {
      toast(errText(e, lang), 'error')
    } finally {
      setBusyId(null)
    }
  }

  async function remove(contact: TelegramContact) {
    if (!confirm(lang === 'ru' ? 'Удалить запись?' : "Yozuvni o'chirasizmi?")) return
    setBusyId(contact.id)
    try {
      await api.delete(`/admin/telegram/contacts/${contact.id}`)
      qc.invalidateQueries({ queryKey: ['admin-telegram-contacts'] })
    } catch (e) {
      toast(errText(e, lang), 'error')
    } finally {
      setBusyId(null)
    }
  }

  if (isLoading) return <Spinner />

  return (
    <div className="max-w-2xl xl:max-w-4xl">
      <div className="mb-1 text-sm font-semibold">{t('telegram_contacts_title')}</div>
      <p className="mb-3 text-xs text-ink-faint">{t('telegram_contacts_hint')}</p>

      {contacts.length === 0 ? (
        <Empty text={t('telegram_contacts_empty')} />
      ) : (
        <div className="card divide-y divide-surface-border dark:divide-[#2a3140]">
          {contacts.map((c) => {
            const availableUsers = (users?.items ?? []).filter(
              (u) => !linkedUserIds.has(u.id) || c.user?.id === u.id,
            )
            return (
              <div key={c.id} className="flex flex-wrap items-center gap-3 p-3">
                <div className="min-w-[140px] flex-1">
                  <div className="text-sm font-medium">{c.tg_first_name || '—'}</div>
                  {c.tg_username && <div className="text-xs text-ink-faint">@{c.tg_username}</div>}
                  <div className="text-[10px] text-ink-faint">{t('telegram_started_at')}: {dt(c.started_at)}</div>
                </div>

                <div className="w-56">
                  <SearchSelect
                    items={availableUsers.map((u) => ({ id: u.id, label: u.full_name }))}
                    value={c.user?.id ?? null}
                    onChange={(id) => { if (id) link(c, id) }}
                    search={search[c.id] ?? ''}
                    onSearchChange={(v) => setSearch((p) => ({ ...p, [c.id]: v }))}
                    placeholder={t('search')}
                  />
                </div>

                {c.user && (
                  <button
                    className="btn-ghost text-xs"
                    onClick={() => unlink(c)}
                    disabled={busyId === c.id}
                  >
                    {t('telegram_unlink')}
                  </button>
                )}
                <button
                  className="btn-ghost text-xs text-rose-600"
                  onClick={() => remove(c)}
                  disabled={busyId === c.id}
                >
                  {t('delete')}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
