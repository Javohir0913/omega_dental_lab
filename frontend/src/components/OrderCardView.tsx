import clsx from 'clsx'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Avatar } from '@/components/ui'
import { useT } from '@/i18n'
import { deadlineInfo } from '@/lib/format'
import type { OrderCard } from '@/lib/types'

export function CardBody({ order, onOpen, onClaim }: {
  order: OrderCard
  onOpen?: () => void
  onClaim?: () => void
}) {
  const t = useT()
  const dl = deadlineInfo(order.stage_deadline ?? order.deadline)

  return (
    <div
      onClick={onOpen}
      className={clsx(
        'card cursor-pointer p-2.5 transition-shadow hover:shadow-pop',
        order.is_overdue && 'border-l-2 border-l-rose-400',
      )}
      style={order.color ? { borderLeft: `3px solid ${order.color}` } : undefined}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-mono text-[10px] text-ink-faint">{order.number}</span>
        {order.priority < 300 && (
          <span className="chip bg-amber-100 text-amber-700">↑</span>
        )}
      </div>

      <div className="mt-0.5 line-clamp-2 text-[13px] font-medium leading-snug">{order.title}</div>

      {order.patient && (
        <div className="mt-1 truncate text-[11px] text-ink-soft">☺ {order.patient.full_name}</div>
      )}
      {order.doctor && (
        <div className="truncate text-[11px] text-ink-faint">✚ {order.doctor.full_name}</div>
      )}

      {order.services.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {order.services.slice(0, 2).map((s) => (
            <span key={s.id} className="chip bg-surface-muted text-ink-soft dark:bg-[#242b38]">
              {s.name_ru}
            </span>
          ))}
          {order.services.length > 2 && (
            <span className="chip text-ink-faint">+{order.services.length - 2}</span>
          )}
        </div>
      )}

      <div className="mt-2 flex items-center justify-between gap-2 border-t border-surface-border pt-2 dark:border-[#2a3140]">
        {order.responsible ? (
          <div className="flex min-w-0 items-center gap-1.5">
            <Avatar name={order.responsible.full_name} size={20} />
            <span className="truncate text-[11px] text-ink-soft">
              {order.responsible.full_name}
            </span>
          </div>
        ) : order.can_claim ? (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onClaim?.()
            }}
            className="rounded-md bg-brand-500 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-brand-600"
          >
            {t('claim')}
          </button>
        ) : (
          <span className="chip bg-surface-muted text-ink-faint dark:bg-[#242b38]">
            {t('free')}
          </span>
        )}

        <div className="flex shrink-0 items-center gap-1.5 text-[10px] text-ink-faint">
          {order.files_count > 0 && <span>📎{order.files_count}</span>}
          {dl && (
            <span
              className={clsx(
                dl.overdue && 'font-medium text-rose-600',
                dl.soon && !dl.overdue && 'text-amber-600',
              )}
            >
              🕐 {dl.text}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

/** Sudrab ko'chiriladigan karta. */
export default function SortableCard({
  order,
  onOpen,
  onClaim,
}: {
  order: OrderCard
  onOpen: () => void
  onClaim: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: order.id,
    data: { order },
    disabled: !order.can_move,
  })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={clsx(isDragging && 'opacity-40')}
      {...attributes}
      {...listeners}
    >
      <CardBody order={order} onOpen={onOpen} onClaim={onClaim} />
    </div>
  )
}
