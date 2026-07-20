import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { api } from '@/lib/api'
import { useLang, useT } from '@/i18n'
import { Badge, Empty, Modal, Spinner } from '@/components/ui'
import { dt } from '@/lib/format'
import type { LogEntry, Page } from '@/lib/types'

const LEVEL_COLOR: Record<string, string> = {
  info: '#3768b0',
  warning: '#d97706',
  error: '#e11d48',
}

export default function LogsPage() {
  const t = useT()
  const lang = useLang((s) => s.lang)
  const navigate = useNavigate()

  const [q, setQ] = useState('')
  const [level, setLevel] = useState('')
  const [category, setCategory] = useState('')
  const [failedOnly, setFailedOnly] = useState(false)
  const [page, setPage] = useState(1)
  const [detail, setDetail] = useState<LogEntry | null>(null)

  const { data: meta } = useQuery({
    queryKey: ['log-meta'],
    queryFn: async () =>
      (await api.get<{ levels: string[]; categories: string[] }>('/logs/meta')).data,
  })

  const { data: stats } = useQuery({
    queryKey: ['log-stats'],
    queryFn: async () =>
      (
        await api.get<{ total: number; errors: number; failed: number; by_category: Record<string, number> }>(
          '/logs/system/stats',
        )
      ).data,
  })

  const { data, isLoading } = useQuery({
    queryKey: ['logs', q, level, category, failedOnly, page],
    queryFn: async () =>
      (
        await api.get<Page<LogEntry>>('/logs/system', {
          params: {
            q: q || undefined,
            level: level || undefined,
            category: category || undefined,
            is_success: failedOnly ? false : undefined,
            page,
            size: 50,
          },
        })
      ).data,
  })

  const items = data?.items ?? []
  const pages = data ? Math.max(1, Math.ceil(data.total / data.size)) : 1

  return (
    <div className="p-4">
      <div className="mb-3 grid gap-2 sm:grid-cols-3">
        <div className="card p-3">
          <div className="text-xs text-ink-faint">{t('log_system')}</div>
          <div className="text-lg font-semibold">{stats?.total ?? 0}</div>
        </div>
        <div className="card p-3">
          <div className="text-xs text-ink-faint">{t('log_failed')}</div>
          <div className="text-lg font-semibold text-amber-600">{stats?.failed ?? 0}</div>
        </div>
        <div className="card p-3">
          <div className="text-xs text-ink-faint">{t('log_errors')}</div>
          <div className="text-lg font-semibold text-rose-600">{stats?.errors ?? 0}</div>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          className="input max-w-[240px]"
          placeholder={t('search')}
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setPage(1)
          }}
        />
        <select
          className="input max-w-[150px]"
          value={level}
          onChange={(e) => {
            setLevel(e.target.value)
            setPage(1)
          }}
        >
          <option value="">{t('level')}: {t('all')}</option>
          {(meta?.levels ?? []).map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <select
          className="input max-w-[160px]"
          value={category}
          onChange={(e) => {
            setCategory(e.target.value)
            setPage(1)
          }}
        >
          <option value="">{t('category')}: {t('all')}</option>
          {(meta?.categories ?? []).map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-ink-soft">
          <input
            type="checkbox"
            checked={failedOnly}
            onChange={(e) => {
              setFailedOnly(e.target.checked)
              setPage(1)
            }}
          />
          {t('log_failed')}
        </label>
        <div className="flex-1" />
        <span className="text-xs text-ink-faint">{data?.total ?? 0}</span>
      </div>

      {isLoading ? (
        <Spinner />
      ) : items.length === 0 ? (
        <Empty />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="border-b border-surface-border text-left text-ink-faint dark:border-[#2a3140]">
              <tr>
                <th className="px-3 py-2 font-medium">{t('when')}</th>
                <th className="px-3 py-2 font-medium">{t('level')}</th>
                <th className="px-3 py-2 font-medium">{t('who')}</th>
                <th className="px-3 py-2 font-medium">{t('what')}</th>
                <th className="px-3 py-2 font-medium">IP</th>
              </tr>
            </thead>
            <tbody>
              {items.map((l) => (
                <tr
                  key={l.id}
                  onClick={() => setDetail(l)}
                  className={clsx(
                    'cursor-pointer border-b border-surface-border last:border-0 hover:bg-surface-muted dark:border-[#2a3140] dark:hover:bg-[#222836]',
                    !l.is_success && 'bg-rose-50/40 dark:bg-rose-900/10',
                  )}
                >
                  <td className="whitespace-nowrap px-3 py-1.5 text-ink-faint">{dt(l.created_at)}</td>
                  <td className="px-3 py-1.5">
                    <Badge color={LEVEL_COLOR[l.level]}>{l.level}</Badge>
                  </td>
                  <td className="max-w-[140px] truncate px-3 py-1.5">{l.actor_name ?? '—'}</td>
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className={l.is_success ? 'text-emerald-600' : 'text-rose-600'}>
                        {l.is_success ? '✓' : '✕'}
                      </span>
                      <span className="max-w-[420px] truncate">
                        {lang === 'ru' ? l.message_ru : l.message_uz}
                      </span>
                      {l.order_id && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            navigate(`/orders/${l.order_id}`)
                          }}
                          className="text-brand-600 hover:underline"
                        >
                          #{l.order_id}
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-1.5 font-mono text-ink-faint">{l.ip ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <div className="mt-3 flex items-center justify-center gap-2">
          <button className="btn-ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            ←
          </button>
          <span className="text-xs text-ink-faint">
            {page} / {pages}
          </span>
          <button className="btn-ghost" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
            →
          </button>
        </div>
      )}

      {detail && (
        <Modal open onClose={() => setDetail(null)} wide title={detail.action}>
          <div className="space-y-2 text-xs">
            {(
              [
                [t('when'), dt(detail.created_at)],
                [t('level'), detail.level],
                [t('category'), detail.category],
                [t('who'), detail.actor_name ?? '—'],
                ['IP', detail.ip ?? '—'],
                ['URL', detail.path ? `${detail.method} ${detail.path}` : '—'],
                ['User-Agent', detail.user_agent ?? '—'],
                ['RU', detail.message_ru],
                ['UZ', detail.message_uz],
              ] as [string, string][]
            ).map(([k, v]) => (
              <div key={k} className="flex gap-3 border-b border-surface-border pb-1.5 dark:border-[#2a3140]">
                <span className="w-24 shrink-0 text-ink-faint">{k}</span>
                <span className="min-w-0 flex-1 break-words">{v}</span>
              </div>
            ))}

            {detail.meta && (
              <div>
                <div className="label">meta</div>
                <pre className="max-h-60 overflow-auto rounded-lg bg-surface-muted p-2 text-[11px] dark:bg-[#242b38]">
                  {JSON.stringify(detail.meta, null, 2)}
                </pre>
              </div>
            )}

            {detail.error_text && (
              <div>
                <div className="label text-rose-600">traceback</div>
                <pre className="max-h-72 overflow-auto rounded-lg bg-rose-50 p-2 text-[11px] text-rose-800 dark:bg-rose-900/20 dark:text-rose-200">
                  {detail.error_text}
                </pre>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}
