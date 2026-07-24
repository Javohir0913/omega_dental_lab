import { useState, useRef, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { api, errText } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useLang, useNm, useT } from '@/i18n'
import { Avatar, Badge, Empty, Modal, Spinner } from '@/components/ui'
import { toast } from '@/components/Toast'
import OrderForm from '@/components/OrderForm'
import PauseModal from '@/components/PauseModal'
import { CardBody } from '@/components/OrderCardView'
import { deadlineInfo, dt, fromNow } from '@/lib/format'
import type { OrderCard, Page, Stage } from '@/lib/types'

export default function OrdersPage() {
  const t = useT()
  const nm = useNm()
  const lang = useLang((s) => s.lang)
  const { can } = useAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [q, setQ] = useState('')
  const [stageIds, setStageIds] = useState<number[]>([])
  const [showStageFilter, setShowStageFilter] = useState(false)
  const stageFilterRef = useRef<HTMLDivElement>(null)
  const [closed, setClosedState] = useState<'' | 'active' | 'paused' | 'success' | 'fail'>(
    () => (localStorage.getItem('omega_orders_closed') as '' | 'active' | 'paused' | 'success' | 'fail') || '',
  )
  const setClosed = (v: '' | 'active' | 'paused' | 'success' | 'fail') => {
    setClosedState(v)
    localStorage.setItem('omega_orders_closed', v)
    setPage(1)
  }
  const [trash, setTrash] = useState(false)
  const [view, setViewState] = useState<'table' | 'card'>(
    () => (localStorage.getItem('omega_orders_view') as 'table' | 'card') || 'table',
  )
  const setView = (v: 'table' | 'card') => {
    setViewState(v)
    localStorage.setItem('omega_orders_view', v)
  }
  const [page, setPage] = useState(1)
  const [creating, setCreating] = useState(false)
  const [pauseTarget, setPauseTarget] = useState<OrderCard | null>(null)
  const [resumeTarget, setResumeTarget] = useState<OrderCard | null>(null)

  useEffect(() => {
    if (!showStageFilter) return
    const h = (e: MouseEvent) => {
      if (stageFilterRef.current && !stageFilterRef.current.contains(e.target as Node)) setShowStageFilter(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [showStageFilter])

  const { data: stages = [] } = useQuery({
    queryKey: ['stages'],
    queryFn: async () => (await api.get<Stage[]>('/stages')).data,
  })

  const successStageId = stages.find((s) => s.kind === 'success')?.id
  const failStageId = stages.find((s) => s.kind === 'fail')?.id

  const { data, isLoading } = useQuery({
    queryKey: trash
      ? ['trash-orders', q, page]
      : ['orders', q, stageIds, closed, page, successStageId, failStageId],
    enabled: trash ? true : closed === '' || closed === 'active' || closed === 'paused' || (closed === 'success' && !!successStageId) || (closed === 'fail' && !!failStageId),
    queryFn: async () => {
      if (trash) {
        const res = await api.get<OrderCard[]>('/orders/trash/list')
        return { items: res.data, total: res.data.length, page: 1, size: res.data.length } as Page<OrderCard>
      }
      const p: Record<string, unknown> = {
        q: q || undefined,
        page,
        size: 30,
      }
      if (stageIds.length > 0) p.stage_id = stageIds
      if (closed === 'active') p.is_closed = false
      else if (closed === 'paused') p.paused = true
      else if (closed === 'success' && successStageId) {
        p.is_closed = true
        p.stage_id = [successStageId]
      } else if (closed === 'fail' && failStageId) {
        p.is_closed = true
        p.stage_id = [failStageId]
      }
      const res = await api.get<Page<OrderCard>>('/orders', { params: p })
      return res.data
    },
  })

  const items = data?.items ?? []
  const pages = trash ? 1 : Math.max(1, Math.ceil((data?.total ?? 0) / (data?.size ?? 30)))

  const orderedStages = useMemo(
    () => stages.filter((s) => s.kind !== 'success' && s.kind !== 'fail').sort((a, b) => a.sort - b.sort),
    [stages],
  )
  function prevStageOf(order: OrderCard): Stage | null {
    const idx = orderedStages.findIndex((s) => s.id === order.stage_id)
    if (idx <= 0) return null
    return orderedStages[idx - 1]
  }

  function refreshOrders() {
    qc.invalidateQueries({ queryKey: ['orders'] })
  }

  async function handleClaim(order: OrderCard) {
    try {
      await api.post(`/orders/${order.id}/claim`)
      refreshOrders()
      toast(`${order.number} — ${t('claim')} ✓`)
    } catch (e) {
      toast(errText(e, lang), 'error')
    }
  }

  async function handleResume(order: OrderCard) {
    try {
      await api.post(`/orders/${order.id}/resume`)
      refreshOrders()
      toast(`${order.number} — ${t('resume')} ✓`)
    } catch (e) {
      toast(errText(e, lang), 'error')
    }
  }

  async function handleMoveBack(order: OrderCard) {
    const stage = prevStageOf(order)
    if (!stage) return
    try {
      await api.post(`/orders/${order.id}/move`, { stage_id: stage.id })
      refreshOrders()
      toast(`${order.number} → ${nm(stage, 'name')}`)
    } catch (e) {
      toast(errText(e, lang), 'error')
    }
  }

  async function handleRestore(orderId: number) {
    try {
      await api.post(`/orders/${orderId}/restore`)
      toast(t('order_restored') + ' ✓')
      qc.invalidateQueries({ queryKey: ['trash-orders'] })
      qc.invalidateQueries({ queryKey: ['orders'] })
    } catch (e) {
      toast(errText(e, lang), 'error')
    }
  }

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

        {!trash && (
          <>
            <div className="relative" ref={stageFilterRef}>
              <button
                onClick={() => setShowStageFilter((v) => !v)}
                className={clsx(
                  'rounded-lg border px-2.5 py-1.5 text-xs transition-colors',
                  stageIds.length > 0
                    ? 'border-brand-300 bg-brand-50 font-medium text-brand-700 dark:bg-brand-900/25'
                    : 'border-surface-border text-ink-soft hover:bg-surface-muted dark:border-[#2f3745] dark:hover:bg-[#222836]',
                )}
              >
                {t('stage')}{stageIds.length > 0 ? ` (${stageIds.length})` : ''}
              </button>
              {showStageFilter && (
                <div className="absolute left-0 top-full z-30 mt-1 w-60 max-w-[calc(100vw-2rem)] rounded-lg border border-surface-border bg-white shadow-pop dark:border-[#2f3745] dark:bg-[#1e2533]">
                  <div className="max-h-56 overflow-y-auto p-2">
                    {(() => {
                      const work = stages.filter((s) => s.kind === 'work')
                      const final = stages.filter((s) => s.kind === 'success' || s.kind === 'fail')
                      return (
                        <>
                          {work.map((s) => (
                            <label
                              key={s.id}
                              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-surface-muted dark:hover:bg-[#222836]"
                            >
                              <input
                                type="checkbox"
                                className="accent-brand-500"
                                checked={stageIds.includes(s.id)}
                                onChange={() => {
                                  setStageIds((prev) =>
                                    prev.includes(s.id) ? prev.filter((id) => id !== s.id) : [...prev, s.id],
                                  )
                                  setPage(1)
                                }}
                              />
                              {nm(s, 'name')}
                            </label>
                          ))}
                          {work.length > 0 && final.length > 0 && (
                            <div className="my-1 border-t border-surface-border dark:border-[#2f3745]" />
                          )}
                          {final.map((s) => (
                            <label
                              key={s.id}
                              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-surface-muted dark:hover:bg-[#222836]"
                            >
                              <input
                                type="checkbox"
                                className="accent-brand-500"
                                checked={stageIds.includes(s.id)}
                                onChange={() => {
                                  setStageIds((prev) =>
                                    prev.includes(s.id) ? prev.filter((id) => id !== s.id) : [...prev, s.id],
                                  )
                                  setPage(1)
                                }}
                              />
                              {nm(s, 'name')}
                            </label>
                          ))}
                        </>
                      )
                    })()}
                  </div>
                  {stageIds.length > 0 && (
                    <div className="border-t border-surface-border px-2 py-1.5 dark:border-[#2f3745]">
                      <button
                        className="text-xs text-ink-faint hover:text-ink"
                        onClick={() => { setStageIds([]); setPage(1) }}
                      >
                        {t('all')}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            <select
              className="input max-w-[150px]"
              value={closed}
              onChange={(e) => setClosed(e.target.value as typeof closed)}
            >
              <option value="">{t('all')}</option>
              <option value="active">В работе / Ishda</option>
              <option value="paused">{t('paused_badge')}</option>
              <option value="success">{stages.find((s) => s.kind === 'success') ? nm(stages.find((s) => s.kind === 'success')!, 'name') : 'Успех'}</option>
              <option value="fail">{stages.find((s) => s.kind === 'fail') ? nm(stages.find((s) => s.kind === 'fail')!, 'name') : 'Провал'}</option>
            </select>
          </>
        )}

        <div className="flex-1" />
        <span className="text-xs text-ink-faint">{data?.total ?? 0}</span>

        {!trash && (
          <div className="flex overflow-hidden rounded-lg border border-surface-border dark:border-[#2f3745]">
            <button
              onClick={() => setView('table')}
              className={clsx(
                'px-2.5 py-1.5 text-xs transition-colors',
                view === 'table'
                  ? 'bg-brand-50 font-medium text-brand-700 dark:bg-brand-900/25'
                  : 'text-ink-soft hover:bg-surface-muted dark:hover:bg-[#222836]',
              )}
            >
              {lang === 'ru' ? 'Таблица' : 'Jadval'}
            </button>
            <button
              onClick={() => setView('card')}
              className={clsx(
                'border-l border-surface-border px-2.5 py-1.5 text-xs transition-colors dark:border-[#2f3745]',
                view === 'card'
                  ? 'bg-brand-50 font-medium text-brand-700 dark:bg-brand-900/25'
                  : 'text-ink-soft hover:bg-surface-muted dark:hover:bg-[#222836]',
              )}
            >
              {lang === 'ru' ? 'Карточки' : 'Kartalar'}
            </button>
          </div>
        )}

        <button
          onClick={() => { setTrash((v) => !v); setPage(1) }}
          className={clsx(
            'rounded-lg border px-2.5 py-1.5 text-xs transition-colors',
            trash
              ? 'border-rose-300 bg-rose-50 font-medium text-rose-700 dark:bg-rose-900/25'
              : 'border-surface-border text-ink-soft hover:bg-surface-muted dark:border-[#2f3745] dark:hover:bg-[#222836]',
          )}
        >
          🗑 {t('trash')}
        </button>

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
      ) : !trash && view === 'card' ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((o) => (
            <CardBody
              key={o.id}
              order={o}
              onOpen={() => navigate(`/orders/${o.id}`)}
              onClaim={() => handleClaim(o)}
              prevStage={prevStageOf(o)}
              onMoveBack={() => handleMoveBack(o)}
              onPause={() => setPauseTarget(o)}
              onResume={() => setResumeTarget(o)}
            />
          ))}
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-surface-border text-left text-xs text-ink-faint dark:border-[#2a3140]">
              <tr>
                <th className="px-3 py-2 font-medium">№</th>
                <th className="px-3 py-2 font-medium">{t('order_title')}</th>
                {!trash && <th className="px-3 py-2 font-medium">{t('stage')}</th>}
                <th className="px-3 py-2 font-medium">{t('patient')}</th>
                <th className="px-3 py-2 font-medium">{t('doctor')}</th>
                <th className="px-3 py-2 font-medium">{t('responsible')}</th>
                {!trash && <th className="px-3 py-2 font-medium">{t('cf_deadline')}</th>}
                {!trash && <th className="px-3 py-2 font-medium">{t('cf_project_deadline')}</th>}
                {trash && <th className="px-3 py-2 font-medium">{t('deleted_at')}</th>}
                {trash && <th className="px-3 py-2 font-medium" />}
              </tr>
            </thead>
            <tbody>
              {items.map((o) => {
                const stage = stages.find((s) => s.id === o.stage_id)
                return (
                  <tr
                    key={o.id}
                    onClick={() => !trash && navigate(`/orders/${o.id}`)}
                    className={clsx(
                      'border-b border-surface-border last:border-0 dark:border-[#2a3140]',
                      !trash && 'cursor-pointer hover:bg-surface-muted dark:hover:bg-[#222836]',
                    )}
                  >
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-[11px] text-ink-faint">
                      {o.number}
                    </td>
                    <td className="max-w-[240px] truncate px-3 py-2 font-medium">{o.title}</td>
                    {!trash && (
                      <td className="px-3 py-2">
                        {stage && <Badge color={stage.color}>{nm(stage, 'name')}</Badge>}
                      </td>
                    )}
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
                    {!trash && (
                      <td
                        className={clsx(
                          'whitespace-nowrap px-3 py-2 text-xs',
                          !o.is_closed && deadlineInfo(o.stage_deadline)?.overdue
                            ? 'font-medium text-rose-600'
                            : 'text-ink-soft',
                        )}
                      >
                        {o.stage_deadline ? dt(o.stage_deadline) : '—'}
                      </td>
                    )}
                    {!trash && (
                      <td
                        className={clsx(
                          'whitespace-nowrap px-3 py-2 text-xs',
                          !o.is_closed && deadlineInfo(o.deadline)?.overdue
                            ? 'font-medium text-rose-600'
                            : 'text-ink-soft',
                        )}
                      >
                        {o.deadline ? dt(o.deadline) : '—'}
                      </td>
                    )}
                    {trash && (
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-ink-faint">
                        {o.deleted_at ? fromNow(o.deleted_at) : '—'}
                      </td>
                    )}
                    {trash && (
                      <td className="px-3 py-2">
                        <button
                          onClick={() => handleRestore(o.id)}
                          className="rounded-md bg-brand-500 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-brand-600"
                        >
                          {t('restore')}
                        </button>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {!trash && pages > 1 && (
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

      {pauseTarget && (
        <PauseModal
          order={pauseTarget}
          onClose={() => setPauseTarget(null)}
          onDone={() => refreshOrders()}
        />
      )}

      {resumeTarget && (
        <Modal
          open
          onClose={() => setResumeTarget(null)}
          title={t('resume')}
          footer={
            <>
              <button className="btn-ghost" onClick={() => setResumeTarget(null)}>
                {t('cancel')}
              </button>
              <button
                className="btn-primary"
                onClick={async () => {
                  const target = resumeTarget
                  setResumeTarget(null)
                  await handleResume(target)
                }}
              >
                {t('resume')}
              </button>
            </>
          }
        >
          <p className="text-sm text-ink-soft">{t('resume_confirm')}</p>
          {resumeTarget.pause_reason && (
            <p className="mt-2 text-xs text-ink-faint">
              {t('pause_reason')}: {resumeTarget.pause_reason}
            </p>
          )}
        </Modal>
      )}
    </div>
  )
}
