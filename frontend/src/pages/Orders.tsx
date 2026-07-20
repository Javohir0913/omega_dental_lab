import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useNm, useT } from '@/i18n'
import { Avatar, Badge, Empty, Spinner } from '@/components/ui'
import OrderForm from '@/components/OrderForm'
import { dt, fromNow } from '@/lib/format'
import type { OrderCard, Page, Stage } from '@/lib/types'

export default function OrdersPage() {
  const t = useT()
  const nm = useNm()
  const { can } = useAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [q, setQ] = useState('')
  const [stageId, setStageId] = useState<number | ''>('')
  const [closed, setClosed] = useState<'' | 'true' | 'false'>('')
  const [page, setPage] = useState(1)
  const [creating, setCreating] = useState(false)

  const { data: stages = [] } = useQuery({
    queryKey: ['stages'],
    queryFn: async () => (await api.get<Stage[]>('/stages')).data,
  })

  const { data, isLoading } = useQuery({
    queryKey: ['orders', q, stageId, closed, page],
    queryFn: async () =>
      (
        await api.get<Page<OrderCard>>('/orders', {
          params: {
            q: q || undefined,
            stage_id: stageId || undefined,
            is_closed: closed === '' ? undefined : closed === 'true',
            page,
            size: 30,
          },
        })
      ).data,
  })

  const items = data?.items ?? []
  const pages = data ? Math.max(1, Math.ceil(data.total / data.size)) : 1

  return (
    <div className="p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          className="input max-w-[220px]"
          placeholder={t('search')}
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setPage(1)
          }}
        />

        <select
          className="input max-w-[180px]"
          value={stageId}
          onChange={(e) => {
            setStageId(e.target.value ? Number(e.target.value) : '')
            setPage(1)
          }}
        >
          <option value="">{t('stage')}: {t('all')}</option>
          {stages.map((s) => (
            <option key={s.id} value={s.id}>
              {nm(s, 'name')}
            </option>
          ))}
        </select>

        <select
          className="input max-w-[150px]"
          value={closed}
          onChange={(e) => {
            setClosed(e.target.value as typeof closed)
            setPage(1)
          }}
        >
          <option value="">{t('all')}</option>
          <option value="false">В работе / Ishda</option>
          <option value="true">Закрыт / Yopilgan</option>
        </select>

        <div className="flex-1" />
        <span className="text-xs text-ink-faint">{data?.total ?? 0}</span>

        {can('order.create') && (
          <button className="btn-primary" onClick={() => setCreating(true)}>
            + {t('new_order')}
          </button>
        )}
      </div>

      {isLoading ? (
        <Spinner />
      ) : items.length === 0 ? (
        <Empty />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-surface-border text-left text-xs text-ink-faint dark:border-[#2a3140]">
              <tr>
                <th className="px-3 py-2 font-medium">№</th>
                <th className="px-3 py-2 font-medium">{t('order_title')}</th>
                <th className="px-3 py-2 font-medium">{t('stage')}</th>
                <th className="px-3 py-2 font-medium">{t('patient')}</th>
                <th className="px-3 py-2 font-medium">{t('doctor')}</th>
                <th className="px-3 py-2 font-medium">{t('responsible')}</th>
                <th className="px-3 py-2 font-medium">{t('deadline')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((o) => {
                const stage = stages.find((s) => s.id === o.stage_id)
                return (
                  <tr
                    key={o.id}
                    onClick={() => navigate(`/orders/${o.id}`)}
                    className="cursor-pointer border-b border-surface-border last:border-0 hover:bg-surface-muted dark:border-[#2a3140] dark:hover:bg-[#222836]"
                  >
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-[11px] text-ink-faint">
                      {o.number}
                    </td>
                    <td className="max-w-[240px] truncate px-3 py-2 font-medium">{o.title}</td>
                    <td className="px-3 py-2">
                      {stage && <Badge color={stage.color}>{nm(stage, 'name')}</Badge>}
                    </td>
                    <td className="max-w-[150px] truncate px-3 py-2 text-ink-soft">
                      {o.patient?.full_name ?? '—'}
                    </td>
                    <td className="max-w-[150px] truncate px-3 py-2 text-ink-soft">
                      {o.doctor?.full_name ?? '—'}
                    </td>
                    <td className="px-3 py-2">
                      {o.responsible ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Avatar name={o.responsible.full_name} size={20} />
                          <span className="text-xs">{o.responsible.full_name}</span>
                        </span>
                      ) : (
                        <span className="text-xs text-ink-faint">{t('free')}</span>
                      )}
                    </td>
                    <td
                      className={clsx(
                        'whitespace-nowrap px-3 py-2 text-xs',
                        o.is_overdue ? 'font-medium text-rose-600' : 'text-ink-soft',
                      )}
                    >
                      {o.deadline ? dt(o.deadline) : '—'}
                    </td>
                  </tr>
                )
              })}
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
          <button
            className="btn-ghost"
            disabled={page >= pages}
            onClick={() => setPage((p) => p + 1)}
          >
            →
          </button>
        </div>
      )}

      {creating && (
        <OrderForm
          onClose={() => setCreating(false)}
          onDone={(o) => {
            qc.invalidateQueries({ queryKey: ['orders'] })
            navigate(`/orders/${o.id}`)
          }}
        />
      )}
    </div>
  )
}
