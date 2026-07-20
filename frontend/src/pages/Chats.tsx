import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { api, errText } from '@/lib/api'
import { socket } from '@/lib/ws'
import { useAuth } from '@/lib/auth'
import { useLang, useT } from '@/i18n'
import { Avatar, Empty, Modal, Spinner } from '@/components/ui'
import { toast } from '@/components/Toast'
import ChatPanel from '@/components/ChatPanel'
import { fromNow } from '@/lib/format'
import type { ChatItem, Page, User } from '@/lib/types'

export default function ChatsPage() {
  const t = useT()
  const lang = useLang((s) => s.lang)
  const { can } = useAuth()
  const { chatId } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [filter, setFilter] = useState<'' | 'order' | 'direct'>('')
  const [newDirect, setNewDirect] = useState(false)

  const { data: chats = [], isLoading } = useQuery({
    queryKey: ['chats', filter],
    queryFn: async () =>
      (await api.get<ChatItem[]>('/chats', { params: { type: filter || undefined } })).data,
  })

  useEffect(() => {
    const off = socket.on('chat.message', () => qc.invalidateQueries({ queryKey: ['chats'] }))
    return off
  }, [qc])

  const active = chats.find((c) => c.id === Number(chatId))

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      {/* Ro'yxat */}
      <div className="flex w-72 shrink-0 flex-col border-r border-surface-border bg-white dark:border-[#2a3140] dark:bg-[#171c26]">
        <div className="flex items-center gap-1 border-b border-surface-border p-2 dark:border-[#2a3140]">
          {[
            { v: '' as const, l: t('all') },
            { v: 'order' as const, l: t('nav_orders') },
            { v: 'direct' as const, l: lang === 'ru' ? 'Личные' : 'Shaxsiy' },
          ].map((f) => (
            <button
              key={f.v}
              onClick={() => setFilter(f.v)}
              className={clsx(
                'rounded-md px-2 py-1 text-xs transition-colors',
                filter === f.v
                  ? 'bg-brand-50 font-medium text-brand-700 dark:bg-brand-900/30'
                  : 'text-ink-soft hover:bg-surface-muted dark:hover:bg-[#222836]',
              )}
            >
              {f.l}
            </button>
          ))}
          <div className="flex-1" />
          {can('chat.direct') && (
            <button
              onClick={() => setNewDirect(true)}
              className="rounded-md px-2 py-1 text-xs text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/30"
              title={lang === 'ru' ? 'Новый чат' : 'Yangi chat'}
            >
              ✎
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <Spinner />
          ) : chats.length === 0 ? (
            <Empty />
          ) : (
            chats.map((c) => (
              <button
                key={c.id}
                onClick={() => navigate(`/chats/${c.id}`)}
                className={clsx(
                  'flex w-full items-start gap-2 border-b border-surface-border px-3 py-2.5 text-left transition-colors dark:border-[#2a3140]',
                  active?.id === c.id
                    ? 'bg-brand-50 dark:bg-brand-900/25'
                    : 'hover:bg-surface-muted dark:hover:bg-[#222836]',
                )}
              >
                {c.type === 'direct' ? (
                  <Avatar name={c.peer?.full_name} />
                ) : (
                  <span className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-md bg-brand-100 text-[11px] text-brand-700">
                    №
                  </span>
                )}

                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium">{c.title ?? '—'}</div>
                  {c.last_message && (
                    <div className="truncate text-[11px] text-ink-faint">{c.last_message}</div>
                  )}
                  {c.last_message_at && (
                    <div className="text-[10px] text-ink-faint">{fromNow(c.last_message_at)}</div>
                  )}
                </div>

                {c.unread > 0 && (
                  <span className="mt-1 shrink-0 rounded-full bg-brand-500 px-1.5 text-[10px] text-white">
                    {c.unread}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Suhbat */}
      <div className="flex min-w-0 flex-1 flex-col">
        {active ? (
          <>
            <div className="flex h-12 items-center gap-2 border-b border-surface-border px-4 dark:border-[#2a3140]">
              <div className="min-w-0 flex-1 truncate text-sm font-medium">{active.title}</div>
              {active.order_id && (
                <button
                  onClick={() => navigate(`/orders/${active.order_id}`)}
                  className="btn-ghost text-xs"
                >
                  {t('order')} →
                </button>
              )}
            </div>
            <div className="min-h-0 flex-1">
              <ChatPanel chatId={active.id} />
            </div>
          </>
        ) : (
          <div className="grid flex-1 place-items-center text-sm text-ink-faint">
            {lang === 'ru' ? 'Выберите чат' : 'Chatni tanlang'}
          </div>
        )}
      </div>

      {newDirect && (
        <NewDirectModal
          onClose={() => setNewDirect(false)}
          onDone={(id) => {
            qc.invalidateQueries({ queryKey: ['chats'] })
            navigate(`/chats/${id}`)
          }}
        />
      )}
    </div>
  )
}

function NewDirectModal({
  onClose,
  onDone,
}: {
  onClose: () => void
  onDone: (chatId: number) => void
}) {
  const t = useT()
  const lang = useLang((s) => s.lang)
  const me = useAuth((s) => s.me)
  const [q, setQ] = useState('')

  const { data } = useQuery({
    queryKey: ['users-chat', q],
    queryFn: async () =>
      (await api.get<Page<User>>('/users', { params: { q: q || undefined, is_active: true, size: 50 } }))
        .data,
  })

  async function open(userId: number) {
    try {
      const { data } = await api.post<{ id: number }>('/chats/direct', { user_id: userId })
      onDone(data.id)
      onClose()
    } catch (e) {
      toast(errText(e, lang), 'error')
    }
  }

  const users = (data?.items ?? []).filter((u) => u.id !== me?.id)

  return (
    <Modal open onClose={onClose} title={lang === 'ru' ? 'Новый чат' : 'Yangi chat'}>
      <input
        className="input mb-3"
        placeholder={t('search')}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoFocus
      />
      <div className="max-h-80 space-y-1 overflow-y-auto">
        {users.length === 0 && <Empty />}
        {users.map((u) => (
          <button
            key={u.id}
            onClick={() => open(u.id)}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-muted dark:hover:bg-[#222836]"
          >
            <Avatar name={u.full_name} />
            <div className="min-w-0">
              <div className="truncate">{u.full_name}</div>
              <div className="text-[10px] text-ink-faint">
                {lang === 'ru' ? u.role.name_ru : u.role.name_uz}
              </div>
            </div>
          </button>
        ))}
      </div>
    </Modal>
  )
}
