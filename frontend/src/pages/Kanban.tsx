import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useDroppable } from '@dnd-kit/core'
import clsx from 'clsx'
import { api, errText } from '@/lib/api'
import { socket } from '@/lib/ws'
import { useAuth } from '@/lib/auth'
import { useLang, useNm, useT } from '@/i18n'
import { toast } from '@/components/Toast'
import { Spinner } from '@/components/ui'
import SortableCard, { CardBody } from '@/components/OrderCardView'
import MoveModal from '@/components/MoveModal'
import OrderForm from '@/components/OrderForm'
import type { KanbanColumn, OrderCard, RequirementError, Stage } from '@/lib/types'

function Column({
  col,
  children,
  isOver,
}: {
  col: KanbanColumn
  children: React.ReactNode
  isOver: boolean
}) {
  const nm = useNm()
  const { setNodeRef } = useDroppable({ id: `stage-${col.stage.id}`, data: { stage: col.stage } })

  return (
    <div className="flex w-[276px] shrink-0 flex-col">
      <div className="mb-2 flex items-center gap-2 px-1">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: col.stage.color }} />
        <span className="truncate text-xs font-semibold">{nm(col.stage, 'name')}</span>
        <span className="ml-auto rounded-full bg-surface-muted px-1.5 text-[10px] text-ink-faint dark:bg-[#242b38]">
          {col.total}
        </span>
      </div>

      <div
        ref={setNodeRef}
        className={clsx(
          'flex min-h-[120px] flex-1 flex-col gap-2 rounded-xl p-1.5 transition-colors',
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

export default function KanbanPage() {
  const t = useT()
  const nm = useNm()
  const lang = useLang((s) => s.lang)
  const { can } = useAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [q, setQ] = useState('')
  const [onlyMine, setOnlyMine] = useState(false)
  const [onlyFree, setOnlyFree] = useState(false)
  const [overdue, setOverdue] = useState(false)
  const [dragging, setDragging] = useState<OrderCard | null>(null)
  const [overStage, setOverStage] = useState<number | null>(null)
  const [creating, setCreating] = useState(false)
  const [move, setMove] = useState<{
    order: OrderCard
    stage: Stage
    req?: RequirementError | null
    needAssignee?: boolean
  } | null>(null)

  const params = { q: q || undefined, only_mine: onlyMine, only_free: onlyFree, overdue }

  const { data, isLoading } = useQuery({
    queryKey: ['kanban', params],
    queryFn: async () =>
      (await api.get<{ columns: KanbanColumn[] }>('/orders/kanban', { params })).data,
  })

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
  const columns = data?.columns ?? []
  const stages = useMemo(() => columns.map((c) => c.stage), [columns])

  function onDragStart(e: DragStartEvent) {
    setDragging((e.active.data.current as { order: OrderCard })?.order ?? null)
  }

  async function onDragEnd(e: DragEndEvent) {
    const order = dragging
    setDragging(null)
    setOverStage(null)
    if (!order || !e.over) return

    const overData = e.over.data.current as { stage?: Stage; order?: OrderCard } | undefined
    const targetStage = overData?.stage ?? stages.find((s) => s.id === overData?.order?.stage_id)
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

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      {/* Filtrlar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-surface-border bg-white px-4 py-2.5 dark:border-[#2a3140] dark:bg-[#171c26]">
        <input
          className="input max-w-[220px]"
          placeholder={t('search')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />

        {[
          { on: onlyMine, set: setOnlyMine, label: t('only_mine') },
          { on: onlyFree, set: setOnlyFree, label: t('only_free') },
          { on: overdue, set: setOverdue, label: t('overdue') },
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

        <div className="flex-1" />

        {can('order.create') && (
          <button className="btn-primary" onClick={() => setCreating(true)}>
            + {t('new_order')}
          </button>
        )}
      </div>

      {/* Doska */}
      {isLoading ? (
        <Spinner />
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
          <div className="flex flex-1 gap-3 overflow-x-auto p-4">
            {columns.map((col) => (
              <Column key={col.stage.id} col={col} isOver={overStage === col.stage.id}>
                <SortableContext
                  items={col.orders.map((o) => o.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {col.orders.map((o) => (
                    <SortableCard
                      key={o.id}
                      order={o}
                      onOpen={() => navigate(`/orders/${o.id}`)}
                      onClaim={() => claim(o)}
                    />
                  ))}
                </SortableContext>

                {col.orders.length === 0 && (
                  <div className="grid flex-1 place-items-center text-[11px] text-ink-faint">—</div>
                )}
                {col.total > col.orders.length && (
                  <div className="py-1 text-center text-[10px] text-ink-faint">
                    +{col.total - col.orders.length}
                  </div>
                )}
              </Column>
            ))}
          </div>

          <DragOverlay>{dragging && <div className="w-[262px] rotate-2"><CardBody order={dragging} /></div>}</DragOverlay>
        </DndContext>
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
