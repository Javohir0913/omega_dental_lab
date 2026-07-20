import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { api } from '@/lib/api'
import { socket } from '@/lib/ws'
import { useT } from '@/i18n'
import { toast } from '@/components/Toast'
import type { NotificationItem, Page } from '@/lib/types'
import { fromNow } from '@/lib/format'

export default function NotificationBell() {
  const t = useT()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const qc = useQueryClient()
  const navigate = useNavigate()

  const { data } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () =>
      (await api.get<Page<NotificationItem>>('/notifications', { params: { size: 20 } })).data,
    refetchInterval: 60_000,
  })

  const items = data?.items ?? []
  const unread = items.filter((i) => !i.is_read).length

  // real-time: yangi bildirishnoma kelganda ro'yxatni yangilaymiz + toast
  useEffect(() => {
    return socket.on('notification.new', (n: NotificationItem) => {
      qc.invalidateQueries({ queryKey: ['notifications'] })
      toast(n.title, 'info')
    })
  }, [qc])

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  async function openItem(n: NotificationItem) {
    if (!n.is_read) {
      await api.post(`/notifications/${n.id}/read`).catch(() => {})
      qc.invalidateQueries({ queryKey: ['notifications'] })
    }
    setOpen(false)
    if (n.link?.type === 'order') navigate(`/orders/${n.link.id}`)
    else if (n.link?.type === 'chat') {
      if (n.link.order_id) navigate(`/orders/${n.link.order_id}`)
      else navigate(`/chats/${n.link.id}`)
    }
  }

  async function readAll() {
    await api.post('/notifications/read-all').catch(() => {})
    qc.invalidateQueries({ queryKey: ['notifications'] })
  }

  return (
    <div className="relative" ref={box}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-lg border border-surface-border px-2 py-1 text-xs text-ink-soft hover:bg-surface-muted dark:border-[#2f3745] dark:hover:bg-[#222836]"
        title={t('notifications')}
      >
        🔔
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[9px] font-medium text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="card absolute right-0 top-10 z-50 w-80 shadow-pop">
          <div className="flex items-center justify-between border-b border-surface-border px-3 py-2 dark:border-[#2a3140]">
            <span className="text-xs font-semibold">{t('notifications')}</span>
            {unread > 0 && (
              <button onClick={readAll} className="text-[11px] text-brand-600 hover:underline">
                {t('mark_all_read')}
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 && (
              <div className="py-8 text-center text-xs text-ink-faint">{t('no_notifications')}</div>
            )}
            {items.map((n) => (
              <button
                key={n.id}
                onClick={() => openItem(n)}
                className={clsx(
                  'block w-full border-b border-surface-border px-3 py-2 text-left last:border-0 hover:bg-surface-muted dark:border-[#2a3140] dark:hover:bg-[#222836]',
                  !n.is_read && 'bg-brand-50/60 dark:bg-brand-900/20',
                )}
              >
                <div className="flex items-start gap-2">
                  {!n.is_read && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium">{n.title}</div>
                    {n.body && (
                      <div className="mt-0.5 line-clamp-2 text-[11px] text-ink-soft">{n.body}</div>
                    )}
                    <div className="mt-1 text-[10px] text-ink-faint">{fromNow(n.created_at)}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
