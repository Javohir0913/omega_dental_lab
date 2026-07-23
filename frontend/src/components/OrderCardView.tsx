import clsx from 'clsx'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Avatar } from '@/components/ui'
import { useLang, useT } from '@/i18n'
import { deadlineInfo } from '@/lib/format'
import type { CustomField, OrderCard, Stage } from '@/lib/types'

export function CardBody({
  order,
  onOpen,
  onClaim,
  fields,
  cfDefs,
  prevStage,
  onMoveBack,
}: {
  order: OrderCard
  onOpen?: () => void
  onClaim?: () => void
  fields?: Record<string, boolean>
  cfDefs?: CustomField[]
  prevStage?: Stage | null
  onMoveBack?: () => void
}) {
  const t = useT()
  const lang = useLang((s) => s.lang)
  const dl = deadlineInfo(order.stage_deadline ?? order.deadline)
  const projectDl = deadlineInfo(order.deadline)
  const show = (key: string) => fields?.[key] !== false
  const hasBottom =
    show('responsible') || show('files') || show('deadline') || show('project_deadline')

  function cfRawVal(code: string) {
    const val = (order as any).custom_fields?.[code]
    if (val == null || val === '') return null
    return val
  }

  function cfDisplay(f: CustomField) {
    const val = cfRawVal(f.code)
    if (val == null) return <span className="text-ink-faint">—</span>
    if (f.type === 'bool') return val ? t('yes') : t('no')
    if (f.type === 'select')
      return f.options?.find((o) => o.value === val)?.[lang === 'ru' ? 'label_ru' : 'label_uz'] ?? String(val)
    if (f.type === 'multiselect' && Array.isArray(val)) {
      if (val.length === 0) return <span className="text-ink-faint">—</span>
      return val
        .map((v) => f.options?.find((o) => o.value === v)?.[lang === 'ru' ? 'label_ru' : 'label_uz'] ?? String(v))
        .join(', ')
    }
    if (f.type === 'file') {
      const ids = Array.isArray(val) ? val : [val]
      return <span>📎 {ids.length}</span>
    }
    if (Array.isArray(val)) return val.join(', ')
    return String(val)
  }

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
        <div className="flex shrink-0 items-center gap-1">
          {show('priority') && order.priority < 300 && (
            <span className="chip bg-amber-100 text-amber-700">↑</span>
          )}
          {prevStage && order.can_move && onMoveBack && (
            <button
              type="button"
              title={t('move_back')}
              onClick={(e) => {
                e.stopPropagation()
                onMoveBack()
              }}
              className="rounded p-0.5 text-ink-faint hover:bg-surface-muted hover:text-ink dark:hover:bg-[#242b38]"
            >
              ⏮
            </button>
          )}
        </div>
      </div>

      <div className="mt-0.5 line-clamp-2 text-[13px] font-medium leading-snug">{order.title}</div>

      {order.has_3d_files && (
        <div className="mt-1 inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700 dark:border-sky-900/40 dark:bg-sky-900/20 dark:text-sky-300">
          🦷 3D
        </div>
      )}

      {show('patient') && (
        <div className="mt-1 truncate text-[11px] text-ink-soft">
          ☺ {order.patient ? order.patient.full_name : <span className="text-ink-faint">—</span>}
        </div>
      )}
      {show('doctor') && (
        <div className="truncate text-[11px] text-ink-faint">
          ✚ {order.doctor ? order.doctor.full_name : <span className="text-ink-faint">—</span>}
        </div>
      )}

      {show('services') && (
        order.services.length > 0 ? (
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
        ) : (
          <div className="mt-1.5 text-[11px] text-ink-faint">—</div>
        )
      )}

      {show('project_deadline') && projectDl && (
        <div className="mt-1 truncate text-[11px]">
          <span className="text-ink-faint">📅 {t('cf_project_deadline')}: </span>
          <span
            className={clsx(
              projectDl.overdue && 'font-medium text-rose-600',
              projectDl.soon && !projectDl.overdue && 'text-amber-600',
            )}
          >
            {projectDl.text}
          </span>
        </div>
      )}

      {cfDefs?.map((f) => show(f.code) ? (
        <div key={f.code} className="mt-1 truncate text-[11px]">
          <span className="text-ink-faint">{lang === 'ru' ? f.label_ru : f.label_uz}: </span>
          <span className="text-ink-soft">{cfDisplay(f)}</span>
        </div>
      ) : null)}

      {hasBottom && (
        <div className="mt-2 flex items-center justify-between gap-2 border-t border-surface-border pt-2 dark:border-[#2a3140]">
          {show('responsible') && order.responsible ? (
            <div className="flex min-w-0 items-center gap-1.5">
              <Avatar name={order.responsible.full_name} size={20} />
              <span className="truncate text-[11px] text-ink-soft">
                {order.responsible.full_name}
              </span>
            </div>
          ) : show('responsible') && order.can_claim ? (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onClaim?.()
              }}
              className="rounded-md bg-brand-500 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-brand-600"
            >
              {t('claim')}
            </button>
          ) : show('responsible') ? (
            <span className="chip bg-surface-muted text-ink-faint dark:bg-[#242b38]">
              {t('free')}
            </span>
          ) : null}

          <div className="ml-auto flex shrink-0 items-center gap-1.5 text-[10px] text-ink-faint">
            {show('files') && order.unread_files_count > 0 && (
              <span className="rounded-full bg-brand-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                📎{order.unread_files_count}
              </span>
            )}
            {show('deadline') && dl && (
              <span
                className={clsx(
                  order.is_overdue && 'font-medium text-rose-600',
                  dl.soon && !order.is_overdue && 'text-amber-600',
                )}
              >
                🕐 {dl.text}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/** Sudrab ko'chiriladigan karta. */
export default function SortableCard({
  order,
  onOpen,
  onClaim,
  fields,
  cfDefs,
  prevStage,
  onMoveBack,
}: {
  order: OrderCard
  onOpen: () => void
  onClaim: () => void
  fields?: Record<string, boolean>
  cfDefs?: CustomField[]
  prevStage?: Stage | null
  onMoveBack?: () => void
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
      <CardBody
        order={order}
        onOpen={onOpen}
        onClaim={onClaim}
        fields={fields}
        cfDefs={cfDefs}
        prevStage={prevStage}
        onMoveBack={onMoveBack}
      />
    </div>
  )
}
