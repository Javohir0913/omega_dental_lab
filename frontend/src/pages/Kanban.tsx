import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import clsx from 'clsx'
import { api, errText } from '@/lib/api'
import { socket } from '@/lib/ws'
import { useAuth } from '@/lib/auth'
import { useIsMobile } from '@/lib/useMediaQuery'
import { useLang, useNm, useT } from '@/i18n'
import { toast } from '@/components/Toast'
import { Modal, Spinner } from '@/components/ui'
import SortableCard, { CardBody } from '@/components/OrderCardView'
import MoveModal from '@/components/MoveModal'
import PauseModal from '@/components/PauseModal'
import OrderForm from '@/components/OrderForm'
import WorkCalendarNotice from '@/components/WorkCalendarNotice'
import type { KanbanColumn, KanbanCursor, OrderCard, RequirementError, Stage, CustomField } from '@/lib/types'
import { useCardFields } from '@/lib/useCardFields'

function Column({
  col,
  children,
  isOver,
  onScrollEnd,
}: {
  col: KanbanColumn
  children: React.ReactNode
  isOver: boolean
  onScrollEnd?: () => void
}) {
  const nm = useNm()
  const { setNodeRef } = useDroppable({ id: `stage-${col.stage.id}`, data: { stage: col.stage } })

  return (
    <div className="flex w-[82vw] max-w-[300px] shrink-0 flex-col sm:w-[276px] lg:w-[300px] xl:w-[320px] 2xl:w-[360px]">
      <div className="mb-2 flex items-center gap-2 px-1">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: col.stage.color }} />
        <span className="truncate text-xs font-semibold">{nm(col.stage, 'name')}</span>
        <span className="ml-auto rounded-full bg-surface-muted px-1.5 text-[10px] text-ink-faint dark:bg-[#242b38]">
          {col.total}
        </span>
      </div>

      <div
        ref={setNodeRef}
        onScroll={
          onScrollEnd
            ? (e) => {
                const el = e.currentTarget
                if (el.scrollHeight - el.scrollTop - el.clientHeight < 150) onScrollEnd()
              }
            : undefined
        }
        className={clsx(
          'flex min-h-[120px] flex-1 flex-col gap-2 rounded-xl p-1.5 transition-colors overflow-y-auto scrollbar-kanban',
          isOver
            ? 'bg-brand-50 ring-1 ring-brand-200 dark:bg-brand-900/20'
            : 'bg-black/[0.02] dark:bg-white/[0.02]',
        )}
      >
        {children}
      </div>
    </div>
  )
}

/** Yupqa droppable чизғич — картани пастга тортиб Успех/Провалга ташлаш */
function FinalStrip({ stage, color }: { stage: Stage; color: string }) {
  const nm = useNm()
  const { setNodeRef, isOver } = useDroppable({ id: `final-${stage.id}`, data: { stage } })
  const icon = stage.kind === 'success' ? '✓' : '✕'
  return (
    <div
      ref={setNodeRef}
      className="flex flex-1 cursor-crosshair items-center justify-center gap-2.5 py-3.5 text-base font-medium transition-all duration-200 first:rounded-l-2xl last:rounded-r-2xl"
      style={{
        background: isOver
          ? `linear-gradient(135deg, ${color}, ${color}dd)`
          : `linear-gradient(135deg, ${color}11, ${color}05)`,
        color: isOver ? '#fff' : color,
        boxShadow: isOver ? `inset 0 0 20px ${color}44` : 'none',
      }}
    >
      <span className="text-base">{icon}</span>
      <span>{nm(stage, 'name')}</span>
    </div>
  )
}

export default function KanbanPage() {
  const t = useT()
  const nm = useNm()
  const lang = useLang((s) => s.lang)
  const { can } = useAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [q, setQ] = useState('')
  const [onlyMine, setOnlyMineState] = useState(() => localStorage.getItem('omega_kanban_only_mine') === 'true')
  const [onlyFree, setOnlyFreeState] = useState(() => localStorage.getItem('omega_kanban_only_free') === 'true')
  const [overdue, setOverdueState] = useState(() => localStorage.getItem('omega_kanban_overdue') === 'true')
  const [paused, setPausedState] = useState(() => localStorage.getItem('omega_kanban_paused') === 'true')
  const [workOnly, setWorkOnlyState] = useState(() => localStorage.getItem('omega_kanban_work_only') === 'true')
  const [hideClosed, setHideClosedState] = useState(() => localStorage.getItem('omega_kanban_hide_closed') === 'true')

  const setOnlyMine = (v: boolean) => { setOnlyMineState(v); localStorage.setItem('omega_kanban_only_mine', String(v)) }
  const setOnlyFree = (v: boolean) => { setOnlyFreeState(v); localStorage.setItem('omega_kanban_only_free', String(v)) }
  const setOverdue = (v: boolean) => { setOverdueState(v); localStorage.setItem('omega_kanban_overdue', String(v)) }
  const setPaused = (v: boolean) => { setPausedState(v); localStorage.setItem('omega_kanban_paused', String(v)) }
  const setWorkOnly = (v: boolean) => { setWorkOnlyState(v); localStorage.setItem('omega_kanban_work_only', String(v)) }
  const setHideClosed = (v: boolean) => { setHideClosedState(v); localStorage.setItem('omega_kanban_hide_closed', String(v)) }
  const [dragging, setDragging] = useState<OrderCard | null>(null)
  const [overStage, setOverStage] = useState<number | null>(null)
  const [creating, setCreating] = useState(false)
  const [move, setMove] = useState<{
    order: OrderCard
    stage: Stage
    req?: RequirementError | null
    needAssignee?: boolean
  } | null>(null)
  const [showFields, setShowFields] = useState(false)
  const fieldsRef = useRef<HTMLDivElement>(null)

  const isMobile = useIsMobile()
  const [showFilters, setShowFilters] = useState(false)
  const [activeStageId, setActiveStageId] = useState<number | null>(null)
  const [moveTarget, setMoveTarget] = useState<OrderCard | null>(null)
  const activeFilterCount = [onlyMine, onlyFree, overdue, paused, workOnly, hideClosed].filter(Boolean).length

  const params = { q: q || undefined, only_mine: onlyMine, only_free: onlyFree, overdue, paused }
  const COLUMN_PAGE_SIZE = 10

  const { data, isLoading } = useQuery({
    queryKey: ['kanban', params],
    queryFn: async () =>
      (await api.get<{ columns: KanbanColumn[] }>('/orders/kanban', { params: { ...params, limit_per_column: COLUMN_PAGE_SIZE } })).data,
  })

  // Ustunda "yana yuklash": har ustun uchun qo'shimcha yuklangan kartalar.
  // Qidiruv/filtr o'zgarsa — tozalanadi, oddiy real-time yangilanishda saqlanib qoladi.
  const [extra, setExtra] = useState<Record<number, OrderCard[]>>({})
  const [cursors, setCursors] = useState<Record<number, KanbanCursor>>({})
  const [loadingMore, setLoadingMore] = useState<Record<number, boolean>>({})
  const paramsKey = JSON.stringify(params)
  useEffect(() => {
    setExtra({})
    setCursors({})
  }, [paramsKey])

  async function loadMore(col: KanbanColumn) {
    const stageId = col.stage.id
    if (loadingMore[stageId]) return
    // Keyset (cursor) bo'yicha: oldingi so'rovdan qaytgan cursor, yoki hali
    // bo'lmasa — hozir ko'rinib turgan oxirgi kartadan hosil qilinadi. Offsetdan
    // farqli o'laroq, shu orada ustunga yangi karta qo'shilib ketsa ham
    // (masalan Success/Fail), allaqachon yuklangan kartalar buzilmaydi.
    const last = col.orders[col.orders.length - 1]
    const cursor = cursors[stageId] ?? (last && { id: last.id, closed_at: last.closed_at, priority: last.priority, sort: last.sort })
    if (!cursor) return
    setLoadingMore((m) => ({ ...m, [stageId]: true }))
    try {
      const res = await api.get<{ items: OrderCard[]; total: number; next_cursor: KanbanCursor | null }>(
        '/orders/kanban/column',
        {
          params: {
            stage_id: stageId,
            limit: COLUMN_PAGE_SIZE,
            after_id: cursor.id,
            after_closed_at: cursor.closed_at ?? undefined,
            after_priority: cursor.priority ?? undefined,
            after_sort: cursor.sort ?? undefined,
            ...params,
          },
        },
      )
      setExtra((e) => ({ ...e, [stageId]: [...(e[stageId] ?? []), ...res.data.items] }))
      setCursors((c) => {
        const n = { ...c }
        if (res.data.next_cursor) n[stageId] = res.data.next_cursor
        else delete n[stageId]
        return n
      })
    } catch (err) {
      toast(errText(err, lang), 'error')
    } finally {
      setLoadingMore((m) => ({ ...m, [stageId]: false }))
    }
  }

  const { data: orderFields } = useQuery({
    queryKey: ['fields', 'order'],
    queryFn: async () =>
      (await api.get<CustomField[]>('/admin/fields', { params: { entity: 'order' } })).data,
  })

  const { visibility, toggle, showAll } = useCardFields()

  // click outside to close fields popover
  useEffect(() => {
    if (!showFields) return
    const h = (e: MouseEvent) => {
      if (fieldsRef.current && !fieldsRef.current.contains(e.target as Node)) setShowFields(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [showFields])

  const systemFieldDefs = [
    { key: 'title', label: lang === 'ru' ? 'Название проекта' : 'Proyekt nomi' },
    { key: 'number', label: lang === 'ru' ? 'Номер (id)' : 'Raqami (id)' },
    { key: 'photo', label: lang === 'ru' ? 'Фото проекта' : 'Proyekt rasmi' },
    { key: 'patient', label: t('cf_patient') },
    { key: 'doctor', label: t('cf_doctor') },
    { key: 'services', label: t('cf_services') },
    { key: 'responsible', label: t('cf_responsible') },
    { key: 'deadline', label: t('cf_deadline') },
    { key: 'project_deadline', label: t('cf_project_deadline') },
    { key: 'priority', label: t('cf_priority') },
    { key: 'files', label: t('cf_files') },
  ]

  const cardCustomFields = (orderFields ?? []).filter((f) => f.is_active && f.show_in_card)
  const fieldDefs = [
    ...systemFieldDefs,
    ...cardCustomFields.map((f) => ({
      key: f.code,
      label: lang === 'ru' ? f.label_ru : f.label_uz,
    })),
  ]

  // real-time: har qanday o'zgarishda doskani yangilaymiz
  useEffect(() => {
    const refresh = () => qc.invalidateQueries({ queryKey: ['kanban'] })
    const offs = [
      socket.on('order.moved', refresh),
      socket.on('order.created', refresh),
      socket.on('order.updated', refresh),
      socket.on('order.deleted', refresh),
      socket.on('stages.changed', refresh),
    ]
    return () => offs.forEach((off) => off())
  }, [qc])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const allColumns = useMemo(() => {
    const base = data?.columns ?? []
    return base.map((c) => {
      const ex = extra[c.stage.id]
      return ex && ex.length ? { ...c, orders: [...c.orders, ...ex] } : c
    })
  }, [data, extra])
  const columns = workOnly ? allColumns.filter((c) => c.stage.kind === 'work') : allColumns
  const stages = useMemo(() => columns.map((c) => c.stage), [columns])
  const finalStages = useMemo(() => allColumns.filter((c) => c.stage.kind === 'success' || c.stage.kind === 'fail').map((c) => c.stage), [allColumns])
  const [moveBack, setMoveBack] = useState<{ order: OrderCard; stage: Stage } | null>(null)
  const [pauseTarget, setPauseTarget] = useState<OrderCard | null>(null)
  const [resumeTarget, setResumeTarget] = useState<OrderCard | null>(null)
  const visibleColumns = useMemo(() => {
    if (!hideClosed) return columns
    return columns.map((col) => {
      const orders = col.orders.filter((o) => !o.is_closed || o.unread_messages > 0)
      return { ...col, total: orders.length, orders }
    })
  }, [columns, hideClosed])

  // mobil: joriy tanlangan ustun endi ro'yxatda bo'lmasa — birinchisiga o'tamiz
  useEffect(() => {
    if (visibleColumns.length === 0) return
    if (!visibleColumns.some((c) => c.stage.id === activeStageId)) {
      setActiveStageId(visibleColumns[0].stage.id)
    }
  }, [visibleColumns, activeStageId])

  const activeColumn = visibleColumns.find((c) => c.stage.id === activeStageId) ?? visibleColumns[0]
  const allMoveStages = useMemo(() => allColumns.map((c) => c.stage), [allColumns])

  function onDragStart(e: DragStartEvent) {
    setDragging((e.active.data.current as { order: OrderCard })?.order ?? null)
  }

  async function onDragEnd(e: DragEndEvent) {
    const order = dragging
    setDragging(null)
    setOverStage(null)
    if (!order || !e.over) return

    const overData = e.over.data.current as { stage?: Stage; order?: OrderCard } | undefined
    const targetStage = overData?.stage ?? [...stages, ...finalStages].find((s) => s.id === overData?.order?.stage_id)
    if (!targetStage || targetStage.id === order.stage_id) return

    await tryMove(order, targetStage)
  }

  async function tryMove(order: OrderCard, stage: Stage) {
    try {
      await api.post(`/orders/${order.id}/move`, { stage_id: stage.id })
      qc.invalidateQueries({ queryKey: ['kanban'] })
      toast(`${order.number} → ${nm(stage, 'name')}`)
    } catch (err) {
      const detail = (err as any)?.response?.data?.detail
      // Majburiy maydon yoki bajaruvchi kerak bo'lsa — modal ochiladi,
      // foydalanuvchi to'ldiradi va o'sha yerdan qayta yuboriladi.
      if (detail?.error === 'required_fields') {
        setMove({ order, stage, req: detail as RequirementError })
      } else if (detail?.error === 'next_assignee_required') {
        setMove({ order, stage, needAssignee: true })
      } else {
        toast(errText(err, lang), 'error')
      }
    }
  }

  async function claim(order: OrderCard) {
    try {
      await api.post(`/orders/${order.id}/claim`)
      qc.invalidateQueries({ queryKey: ['kanban'] })
      toast(`${order.number} — ${t('claim')} ✓`)
    } catch (err) {
      toast(errText(err, lang), 'error')
    }
  }

  async function resume(order: OrderCard) {
    try {
      await api.post(`/orders/${order.id}/resume`)
      qc.invalidateQueries({ queryKey: ['kanban'] })
      toast(`${order.number} — ${t('resume')} ✓`)
    } catch (err) {
      toast(errText(err, lang), 'error')
    }
  }

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col">
      {/* Filtrlar */}
      <div className="border-b border-surface-border bg-white dark:border-[#2a3140] dark:bg-[#171c26]">
        <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 sm:px-4">
          <input
            className="input min-w-0 flex-1 sm:max-w-[220px] sm:flex-initial"
            placeholder={t('search')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />

          <button
            onClick={() => setShowFilters((v) => !v)}
            className={clsx(
              'shrink-0 rounded-lg border px-2.5 py-1.5 text-xs transition-colors md:hidden',
              showFilters || activeFilterCount > 0
                ? 'border-brand-300 bg-brand-50 font-medium text-brand-700 dark:bg-brand-900/25'
                : 'border-surface-border text-ink-soft hover:bg-surface-muted dark:border-[#2f3745] dark:hover:bg-[#222836]',
            )}
          >
            ⚙ {lang === 'ru' ? 'Фильтры' : 'Filtrlar'}
            {activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
          </button>

          <div
            className={clsx(
              'w-full flex-wrap items-center gap-2 md:w-auto md:flex-1',
              showFilters ? 'flex' : 'hidden',
              'md:flex',
            )}
          >
            {[
              { on: onlyMine, set: setOnlyMine, label: t('only_mine') },
              { on: onlyFree, set: setOnlyFree, label: t('only_free') },
              { on: overdue, set: setOverdue, label: t('overdue') },
              { on: paused, set: setPaused, label: t('paused_badge') },
              { on: workOnly, set: setWorkOnly, label: lang === 'ru' ? 'В работе' : 'Ishda' },
              { on: hideClosed, set: setHideClosed, label: lang === 'ru' ? 'Скрыть закрытые' : 'Yopiqni yashirish' },
            ].map((f) => (
              <button
                key={f.label}
                onClick={() => f.set(!f.on)}
                className={clsx(
                  'rounded-lg border px-2.5 py-1.5 text-xs transition-colors',
                  f.on
                    ? 'border-brand-300 bg-brand-50 font-medium text-brand-700 dark:bg-brand-900/25'
                    : 'border-surface-border text-ink-soft hover:bg-surface-muted dark:border-[#2f3745] dark:hover:bg-[#222836]',
                )}
              >
                {f.label}
              </button>
            ))}

            <div className="hidden flex-1 md:block" />

            <WorkCalendarNotice />

            <div className="relative" ref={fieldsRef}>
              <button
                className="rounded-lg border border-surface-border px-2.5 py-1.5 text-xs text-ink-soft hover:bg-surface-muted dark:border-[#2f3745] dark:hover:bg-[#222836]"
                onClick={() => setShowFields((v) => !v)}
              >
                ⚙ {t('card_fields')}
              </button>

              {showFields && (
                <div className="absolute right-0 top-full z-30 mt-1 w-52 max-w-[calc(100vw-2rem)] rounded-lg border border-surface-border bg-white shadow-pop dark:border-[#2f3745] dark:bg-[#1e2533]">
                  <div className="max-h-64 overflow-y-auto p-2">
                    {fieldDefs.map((f) => (
                      <label
                        key={f.key}
                        className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-surface-muted dark:hover:bg-[#222836]"
                      >
                        <input
                          type="checkbox"
                          className="accent-brand-500"
                          checked={visibility[f.key] !== false}
                          onChange={() => toggle(f.key)}
                        />
                        {f.label}
                      </label>
                    ))}
                  </div>
                  <div className="border-t border-surface-border px-2 py-1.5 dark:border-[#2f3745]">
                    <button className="text-xs text-ink-faint hover:text-ink dark:hover:text-[#e6e9ee]" onClick={showAll}>
                      {t('all')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="ml-auto shrink-0 md:ml-0" />

          {can('order.create') && (
            <button className="btn-primary shrink-0" onClick={() => setCreating(true)}>
              + {t('new_order')}
            </button>
          )}
        </div>
      </div>

      {/* Doska */}
      {isLoading ? (
        <Spinner />
      ) : isMobile ? (
        <MobileBoard
          columns={visibleColumns}
          activeColumn={activeColumn}
          onSelectStage={setActiveStageId}
          fields={visibility}
          cfDefs={cardCustomFields}
          onOpen={(o) => navigate(`/orders/${o.id}`)}
          onClaim={claim}
          onMoveBack={async (o) => {
            const stage = (await api.get<Stage | null>(`/orders/${o.id}/prev-stage`)).data
            if (stage) setMoveBack({ order: o, stage })
          }}
          onPause={setPauseTarget}
          onResume={setResumeTarget}
          onMove={setMoveTarget}
          onLoadMore={loadMore}
          loadingMore={loadingMore}
          lang={lang}
        />
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={onDragStart}
          onDragOver={(e) => {
            const d = e.over?.data.current as { stage?: Stage; order?: OrderCard } | undefined
            setOverStage(d?.stage?.id ?? d?.order?.stage_id ?? null)
          }}
          onDragEnd={onDragEnd}
          onDragCancel={() => {
            setDragging(null)
            setOverStage(null)
          }}
        >
          <div className="flex flex-1 gap-3 overflow-x-auto overflow-y-hidden p-3 sm:p-4">
            {visibleColumns.map((col) => {
              const hasMore = col.total > col.orders.length
              return (
                <Column
                  key={col.stage.id}
                  col={col}
                  isOver={overStage === col.stage.id}
                  onScrollEnd={hasMore ? () => loadMore(col) : undefined}
                >
                  <SortableContext
                    items={col.orders.map((o) => o.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {col.orders.map((o) => (
                      <SortableCard
                        key={o.id}
                        order={o}
                        fields={visibility}
                        cfDefs={cardCustomFields}
                        onOpen={() => navigate(`/orders/${o.id}`)}
                        onClaim={() => claim(o)}
                        onMoveBack={async () => {
                          const stage = (await api.get<Stage | null>(`/orders/${o.id}/prev-stage`)).data
                          if (stage) setMoveBack({ order: o, stage })
                        }}
                        onPause={() => setPauseTarget(o)}
                        onResume={() => setResumeTarget(o)}
                      />
                    ))}
                  </SortableContext>

                  {col.orders.length === 0 && (
                    <div className="grid flex-1 place-items-center text-[11px] text-ink-faint">—</div>
                  )}
                  {hasMore && (
                    <div className="py-1 text-center text-[10px]">
                      {loadingMore[col.stage.id] ? (
                        <span className="text-ink-faint">…</span>
                      ) : (
                        <button
                          className="text-ink-faint hover:text-brand-600 hover:underline"
                          onClick={() => loadMore(col)}
                        >
                          +{col.total - col.orders.length} · {lang === 'ru' ? 'ещё' : 'yana'}
                        </button>
                      )}
                    </div>
                  )}
                </Column>
              )
            })}
          </div>

          {/* Drop zone: картани пастга судраб Успех/Провалга ташлаш */}
          {dragging && finalStages.length === 2 && (
            <div className="mx-4 mb-3 mt-1">
              <div className="flex shrink-0 overflow-hidden rounded-2xl border border-white/10 shadow-lg backdrop-blur-xl dark:border-white/5">
                <FinalStrip stage={finalStages[0]} color={finalStages[0].color} />
                <div className="w-px bg-white/20" />
                <FinalStrip stage={finalStages[1]} color={finalStages[1].color} />
              </div>
            </div>
          )}

          <DragOverlay>{dragging && <div className="w-[262px] rotate-2"><CardBody order={dragging} fields={visibility} cfDefs={cardCustomFields} /></div>}</DragOverlay>
        </DndContext>
      )}

      {moveBack && (
        <Modal
          open
          onClose={() => setMoveBack(null)}
          title={t('move_back')}
          footer={
            <>
              <button className="btn-ghost" onClick={() => setMoveBack(null)}>
                {t('cancel')}
              </button>
              <button
                className="btn-primary"
                onClick={async () => {
                  await tryMove(moveBack.order, moveBack.stage)
                  setMoveBack(null)
                }}
              >
                {t('move_back')}
              </button>
            </>
          }
        >
          <p className="text-sm text-ink-soft">
            {t('move_back_confirm')}: <strong>{nm(moveBack.stage, 'name')}</strong>?
          </p>
        </Modal>
      )}

      {pauseTarget && (
        <PauseModal
          order={pauseTarget}
          onClose={() => setPauseTarget(null)}
          onDone={() => qc.invalidateQueries({ queryKey: ['kanban'] })}
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
                  await resume(resumeTarget)
                  setResumeTarget(null)
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

      {move && (
        <MoveModal
          order={move.order}
          toStage={move.stage}
          requirement={move.req}
          needAssignee={move.needAssignee}
          onClose={() => setMove(null)}
          onDone={() => {
            qc.invalidateQueries({ queryKey: ['kanban'] })
            toast(t('saved'))
          }}
        />
      )}

      {moveTarget && (
        <Modal open onClose={() => setMoveTarget(null)} title={t('move_to')}>
          <div className="mb-3 text-xs text-ink-faint">
            {moveTarget.number} · {moveTarget.title}
          </div>
          <div className="flex flex-wrap gap-2">
            {allMoveStages
              .filter((s) => s.id !== moveTarget.stage_id)
              .map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={async () => {
                    await tryMove(moveTarget, s)
                    setMoveTarget(null)
                  }}
                  className="rounded-lg px-3 py-2 text-sm font-medium transition-opacity hover:opacity-80"
                  style={{
                    background: `${s.color}1a`,
                    border: `1px solid ${s.color}33`,
                    color: s.color,
                  }}
                >
                  {nm(s, 'name')}
                </button>
              ))}
          </div>
        </Modal>
      )}

      {creating && (
        <OrderForm
          onClose={() => setCreating(false)}
          onDone={(o) => {
            qc.invalidateQueries({ queryKey: ['kanban'] })
            navigate(`/orders/${o.id}`)
          }}
        />
      )}
    </div>
  )
}

/* ---------------- Mobil доска: bitta ustun + bosqichlar tab-strip ---------------- */

function MobileBoard({
  columns,
  activeColumn,
  onSelectStage,
  fields,
  cfDefs,
  onOpen,
  onClaim,
  onMoveBack,
  onPause,
  onResume,
  onMove,
  onLoadMore,
  loadingMore,
  lang,
}: {
  columns: KanbanColumn[]
  activeColumn?: KanbanColumn
  onSelectStage: (stageId: number) => void
  fields: Record<string, boolean>
  cfDefs: CustomField[]
  onOpen: (o: OrderCard) => void
  onClaim: (o: OrderCard) => void
  onMoveBack: (o: OrderCard) => void
  onPause: (o: OrderCard) => void
  onResume: (o: OrderCard) => void
  onMove: (o: OrderCard) => void
  onLoadMore: (col: KanbanColumn) => void
  loadingMore: Record<number, boolean>
  lang: string
}) {
  const nm = useNm()
  const hasMore = !!activeColumn && activeColumn.total > activeColumn.orders.length

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 gap-1.5 overflow-x-auto border-b border-surface-border bg-white px-3 py-2 dark:border-[#2a3140] dark:bg-[#171c26]">
        {columns.map((col) => {
          const active = col.stage.id === activeColumn?.stage.id
          return (
            <button
              key={col.stage.id}
              onClick={() => onSelectStage(col.stage.id)}
              className={clsx(
                'flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                active ? 'text-white' : 'text-ink-soft',
              )}
              style={{
                background: active ? col.stage.color : `${col.stage.color}14`,
                border: `1px solid ${col.stage.color}${active ? '' : '33'}`,
              }}
            >
              {nm(col.stage, 'name')}
              <span
                className={clsx(
                  'rounded-full px-1.5 text-[10px]',
                  active ? 'bg-white/25' : 'bg-black/5 dark:bg-white/10',
                )}
              >
                {col.total}
              </span>
            </button>
          )
        })}
      </div>

      <div
        className="flex-1 overflow-y-auto p-3"
        onScroll={
          hasMore && activeColumn
            ? (e) => {
                const el = e.currentTarget
                if (el.scrollHeight - el.scrollTop - el.clientHeight < 200) onLoadMore(activeColumn)
              }
            : undefined
        }
      >
        {!activeColumn || activeColumn.orders.length === 0 ? (
          <div className="grid h-full place-items-center text-sm text-ink-faint">—</div>
        ) : (
          <div className="flex flex-col gap-2">
            {activeColumn.orders.map((o) => (
              <CardBody
                key={o.id}
                order={o}
                fields={fields}
                cfDefs={cfDefs}
                onOpen={() => onOpen(o)}
                onClaim={() => onClaim(o)}
                onMoveBack={() => onMoveBack(o)}
                onPause={() => onPause(o)}
                onResume={() => onResume(o)}
                onMove={() => onMove(o)}
              />
            ))}
            {hasMore && (
              <div className="py-1 text-center text-xs">
                {loadingMore[activeColumn.stage.id] ? (
                  <span className="text-ink-faint">…</span>
                ) : (
                  <button
                    className="text-ink-faint hover:text-brand-600 hover:underline"
                    onClick={() => onLoadMore(activeColumn)}
                  >
                    +{activeColumn.total - activeColumn.orders.length} · {lang === 'ru' ? 'ещё' : 'yana'}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
