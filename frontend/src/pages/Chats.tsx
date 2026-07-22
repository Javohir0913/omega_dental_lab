import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { api, errText } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useLang, useT } from '@/i18n'
import { Avatar, Empty, Spinner } from '@/components/ui'
import { toast } from '@/components/Toast'
import ChatPanel from '@/components/ChatPanel'
import { fromNow } from '@/lib/format'
import type { ChatItem, Page, User } from '@/lib/types'

export default function ChatsPage() {
  const t = useT()
  const lang = useLang((s) => s.lang)
  const { me, can } = useAuth()
  const { chatId } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [filter, setFilter] = useState<'' | 'order' | 'direct'>('')
  const [hideClosed, setHideClosed] = useState(() => localStorage.getItem('omega_chats_hide_closed') === 'true')
  const [opening, setOpening] = useState<number | null>(null)

  const { data: chats = [], isLoading } = useQuery({
    queryKey: ['chats', filter],
    queryFn: async () =>
      (await api.get<ChatItem[]>('/chats', { params: { type: filter || undefined } })).data,
  })

  // Shaxsiy bo'limda hali suhbat boshlanmagan aktiv xodimlarni ham ko'rsatamiz
  const { data: allUsers } = useQuery({
    queryKey: ['users-direct-list'],
    queryFn: async () =>
      (await api.get<Page<User>>('/users', { params: { is_active: true, size: 200 } })).data,
    enabled: filter === 'direct' && can('chat.direct'),
  })

  const active = chats.find((c) => c.id === Number(chatId))
  const visibleChats = chats.filter(
    (c) => !hideClosed || (!c.hidden && (c.type !== 'order' || !c.order_is_closed || c.unread > 0)),
  )

  const existingPeerIds = new Set(chats.filter((c) => c.peer).map((c) => c.peer!.id))
  const otherUsers = (allUsers?.items ?? []).filter(
    (u) => u.id !== me?.id && !existingPeerIds.has(u.id),
  )

  async function toggleHide(chat: ChatItem, e: React.MouseEvent) {
    e.stopPropagation()
    try {
      await api.post(`/chats/${chat.id}/hide`, { hidden: !chat.hidden })
      qc.invalidateQueries({ queryKey: ['chats'] })
    } catch (e2) {
      toast(errText(e2, lang), 'error')
    }
  }

  async function openDirect(userId: number) {
    if (opening) return
    setOpening(userId)
    try {
      const { data } = await api.post<{ id: number }>('/chats/direct', { user_id: userId })
      qc.invalidateQueries({ queryKey: ['chats'] })
      navigate(`/chats/${data.id}`)
    } catch (e) {
      toast(errText(e, lang), 'error')
    } finally {
      setOpening(null)
    }
  }

  return (
    <div className="flex h-[calc(100dvh-3.5rem)]">
      {/* Ro'yxat */}
      <div className={clsx('w-full shrink-0 flex-col border-r border-surface-border bg-white dark:border-[#2a3140] dark:bg-[#171c26] md:flex md:w-72', active ? 'hidden' : 'flex')}>
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
          <button
            onClick={() => {
              const next = !hideClosed
              setHideClosed(next)
              localStorage.setItem('omega_chats_hide_closed', String(next))
            }}
            className={clsx(
              'rounded-md px-2 py-1 text-xs transition-colors',
              hideClosed
                ? 'bg-brand-50 font-medium text-brand-700 dark:bg-brand-900/30'
                : 'text-ink-soft hover:bg-surface-muted dark:hover:bg-[#222836]',
            )}
            title={
              lang === 'ru'
                ? 'Скрыть закрытые проекты и скрытые чаты'
                : 'Yopiq proyektlar va yashirilgan chatlarni yashirish'
            }
          >
            {lang === 'ru' ? 'Скрыть закрытые' : 'Yopiqni yashirish'}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <Spinner />
          ) : visibleChats.length === 0 && otherUsers.length === 0 ? (
            <Empty />
          ) : (
            <>
            {visibleChats.map((c) => (
              <div
                key={c.id}
                role="button"
                tabIndex={0}
                onClick={() => navigate(`/chats/${c.id}`)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    navigate(`/chats/${c.id}`)
                  }
                }}
                className={clsx(
                  'group flex w-full cursor-pointer items-start gap-2 border-b border-surface-border px-3 py-2.5 text-left transition-colors dark:border-[#2a3140]',
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

                {c.type === 'order' && (
                  <button
                    onClick={(e) => toggleHide(c, e)}
                    className="shrink-0 rounded px-1.5 py-1 text-[10px] text-ink-faint opacity-0 transition-opacity hover:bg-surface-muted hover:text-ink group-hover:opacity-100 dark:hover:bg-[#2a3140] dark:hover:text-[#e6e9ee]"
                    title={c.hidden ? (lang === 'ru' ? 'Показать чат' : 'Chatni ko\'rsatish') : (lang === 'ru' ? 'Скрыть чат' : 'Chatni yashirish')}
                  >
                    {c.hidden ? (lang === 'ru' ? 'Показать' : 'Ko\'rsatish') : (lang === 'ru' ? 'Скрыть' : 'Yashirish')}
                  </button>
                )}
              </div>
            ))}

            {filter === 'direct' && otherUsers.length > 0 && (
              <>
                {visibleChats.length > 0 && (
                  <div className="px-3 py-1.5 text-[10px] font-medium uppercase tracking-wide text-ink-faint">
                    {lang === 'ru' ? 'Все сотрудники' : 'Boshqa xodimlar'}
                  </div>
                )}
                {otherUsers.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => openDirect(u.id)}
                    disabled={opening === u.id}
                    className="flex w-full items-center gap-2 border-b border-surface-border px-3 py-2.5 text-left transition-colors hover:bg-surface-muted disabled:opacity-50 dark:border-[#2a3140] dark:hover:bg-[#222836]"
                  >
                    <Avatar name={u.full_name} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-medium">{u.full_name}</div>
                      <div className="truncate text-[10px] text-ink-faint">
                        {lang === 'ru' ? u.role.name_ru : u.role.name_uz}
                      </div>
                    </div>
                    {opening === u.id && (
                      <div className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-brand-200 border-t-brand-500" />
                    )}
                  </button>
                ))}
              </>
            )}
            </>
          )}
        </div>
      </div>

      {/* Suhbat */}
      <div className={clsx('min-w-0 flex-1 flex-col md:flex', active ? 'flex' : 'hidden')}>
        {active ? (
          <>
            <div className="flex h-12 items-center gap-2 border-b border-surface-border px-4 dark:border-[#2a3140]">
              <button onClick={() => navigate('/chats')} className="rounded p-1.5 text-ink-faint hover:bg-surface-muted dark:hover:bg-[#222836] md:hidden" aria-label="Back to chats">
                ←
              </button>
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
              <ChatPanel chatId={active.id} chatType={active.type} onClose={() => navigate('/chats')} />
            </div>
          </>
        ) : (
          <div className="grid flex-1 place-items-center text-sm text-ink-faint">
            {lang === 'ru' ? 'Выберите чат' : 'Chatni tanlang'}
          </div>
        )}
      </div>

    </div>
  )
}
