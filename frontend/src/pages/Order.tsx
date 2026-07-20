import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { api, API_URL, errText, tokens } from '@/lib/api'
import { socket } from '@/lib/ws'
import { useAuth } from '@/lib/auth'
import { useLang, useNm, useT } from '@/i18n'
import { Avatar, Badge, Confirm, Empty, Field, Modal, Spinner, Tabs } from '@/components/ui'
import { toast } from '@/components/Toast'
import ChatPanel from '@/components/ChatPanel'
import MoveModal from '@/components/MoveModal'
import OrderForm from '@/components/OrderForm'
import { dt, duration, fileSize, fromNow } from '@/lib/format'
import type {
  CustomField,
  LogEntry,
  OrderDetail,
  Page,
  RequirementError,
  Stage,
  StageHistory,
} from '@/lib/types'

export default function OrderPage() {
  const { id } = useParams()
  const orderId = Number(id)
  const t = useT()
  const nm = useNm()
  const lang = useLang((s) => s.lang)
  const { can, me } = useAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [tab, setTab] = useState('info')
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [assigning, setAssigning] = useState(false)
  const [move, setMove] = useState<{
    stage: Stage
    req?: RequirementError | null
    needAssignee?: boolean
  } | null>(null)

  const { data: order, isLoading } = useQuery({
    queryKey: ['order', orderId],
    queryFn: async () => (await api.get<OrderDetail>(`/orders/${orderId}`)).data,
    enabled: Number.isFinite(orderId),
  })

  const { data: stages = [] } = useQuery({
    queryKey: ['stages'],
    queryFn: async () => (await api.get<Stage[]>('/stages')).data,
  })

  useEffect(() => {
    if (!Number.isFinite(orderId)) return
    socket.join(`order:${orderId}`)
    const off = socket.on('order.updated', () =>
      qc.invalidateQueries({ queryKey: ['order', orderId] }),
    )
    const off2 = socket.on('order.moved', () =>
      qc.invalidateQueries({ queryKey: ['order', orderId] }),
    )
    return () => {
      socket.leave(`order:${orderId}`)
      off()
      off2()
    }
  }, [orderId, qc])

  if (isLoading) return <Spinner />
  if (!order) return <Empty />

  const refresh = () => qc.invalidateQueries({ queryKey: ['order', orderId] })

  async function claim() {
    try {
      await api.post(`/orders/${orderId}/claim`)
      refresh()
      toast(t('claim') + ' ✓')
    } catch (e) {
      toast(errText(e, lang), 'error')
    }
  }

  async function tryMove(stage: Stage) {
    try {
      await api.post(`/orders/${orderId}/move`, { stage_id: stage.id })
      refresh()
      qc.invalidateQueries({ queryKey: ['kanban'] })
      toast(`→ ${nm(stage, 'name')}`)
    } catch (err) {
      const detail = (err as any)?.response?.data?.detail
      if (detail?.error === 'required_fields') setMove({ stage, req: detail as RequirementError })
      else if (detail?.error === 'next_assignee_required') setMove({ stage, needAssignee: true })
      else toast(errText(err, lang), 'error')
    }
  }

  async function remove() {
    try {
      await api.delete(`/orders/${orderId}`)
      toast(t('delete') + ' ✓')
      navigate('/')
    } catch (e) {
      toast(errText(e, lang), 'error')
    }
  }

  const canEdit = can('order.edit') || can('order.rename')

  return (
    <div className="mx-auto max-w-6xl p-4">
      {/* Sarlavha */}
      <div className="mb-3 flex flex-wrap items-start gap-3">
        <button onClick={() => navigate(-1)} className="btn-ghost px-2">
          ←
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-ink-faint">{order.number}</span>
            {order.stage && (
              <Badge color={order.stage.color}>{nm(order.stage, 'name')}</Badge>
            )}
            {order.is_overdue && <Badge color="#e11d48">{t('overdue')}</Badge>}
          </div>
          <h1 className="mt-0.5 text-lg font-semibold leading-tight">{order.title}</h1>
        </div>

        <div className="flex flex-wrap gap-2">
          {order.can_claim && (
            <button className="btn-primary" onClick={claim}>
              {t('claim')}
            </button>
          )}
          {can('order.assign.any') && (
            <button className="btn-ghost" onClick={() => setAssigning(true)}>
              {t('assign')}
            </button>
          )}
          {canEdit && (
            <button className="btn-ghost" onClick={() => setEditing(true)}>
              {t('edit')}
            </button>
          )}
          {can('order.delete') && (
            <button className="btn-ghost text-rose-600" onClick={() => setDeleting(true)}>
              {t('delete')}
            </button>
          )}
        </div>
      </div>

      {/* Bosqichlar chizig'i (Bitrix uslubida) */}
      {order.can_move && (
        <div className="mb-4 flex gap-1 overflow-x-auto pb-1">
          {stages.map((s) => {
            const current = s.id === order.stage_id
            return (
              <button
                key={s.id}
                onClick={() => !current && tryMove(s)}
                disabled={current}
                className={clsx(
                  'whitespace-nowrap rounded-md px-2.5 py-1 text-[11px] font-medium transition-all',
                  current ? 'text-white' : 'text-ink-soft hover:opacity-80',
                )}
                style={{
                  background: current ? s.color : `${s.color}1a`,
                  border: `1px solid ${s.color}${current ? '' : '33'}`,
                  color: current ? '#fff' : s.color,
                }}
              >
                {nm(s, 'name')}
              </button>
            )
          })}
        </div>
      )}

      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { value: 'info', label: t('order') },
          { value: 'chat', label: t('chat') },
          { value: 'files', label: t('files'), badge: order.files_count },
          { value: 'history', label: t('history') },
          ...(can('log.order') ? [{ value: 'log', label: t('log') }] : []),
        ]}
      />

      <div className="mt-4">
        {tab === 'info' && <InfoTab order={order} />}
        {tab === 'chat' &&
          (order.chat_id ? (
            <div className="card h-[60vh] overflow-hidden">
              <ChatPanel chatId={order.chat_id} />
            </div>
          ) : (
            <Empty />
          ))}
        {tab === 'files' && <FilesTab order={order} onChange={refresh} />}
        {tab === 'history' && <HistoryTab orderId={orderId} />}
        {tab === 'log' && <LogTab orderId={orderId} />}
      </div>

      {move && (
        <MoveModal
          order={order}
          toStage={move.stage}
          requirement={move.req}
          needAssignee={move.needAssignee}
          onClose={() => setMove(null)}
          onDone={() => {
            refresh()
            qc.invalidateQueries({ queryKey: ['kanban'] })
          }}
        />
      )}

      {editing && (
        <OrderForm order={order} onClose={() => setEditing(false)} onDone={refresh} />
      )}

      {assigning && (
        <AssignModal order={order} onClose={() => setAssigning(false)} onDone={refresh} />
      )}

      <Confirm
        open={deleting}
        text={`${order.number} — ${order.title}`}
        onCancel={() => setDeleting(false)}
        onOk={remove}
      />
    </div>
  )
}

/* ---------------- Ma'lumot ---------------- */

function InfoTab({ order }: { order: OrderDetail }) {
  const t = useT()
  const lang = useLang((s) => s.lang)

  const { data: fields = [] } = useQuery({
    queryKey: ['fields', 'order'],
    queryFn: async () =>
      (await api.get<CustomField[]>('/admin/fields', { params: { entity: 'order' } })).data,
  })

  const rows: [string, React.ReactNode][] = [
    [t('patient'), order.patient ? `${order.patient.full_name}${order.patient.phone ? ` · ${order.patient.phone}` : ''}` : '—'],
    [t('doctor'), order.doctor?.full_name ?? '—'],
    [
      t('services'),
      order.services.length
        ? order.services.map((s) => (lang === 'ru' ? s.name_ru : s.name_uz)).join(', ')
        : '—',
    ],
    [
      t('responsible'),
      order.responsible ? (
        <span className="inline-flex items-center gap-1.5">
          <Avatar name={order.responsible.full_name} size={20} />
          {order.responsible.full_name}
        </span>
      ) : (
        <span className="text-ink-faint">{t('free')}</span>
      ),
    ],
    [t('deadline'), order.deadline ? `${dt(order.deadline)} · ${fromNow(order.deadline)}` : '—'],
    [
      t('in_stage'),
      order.stage_entered_at ? fromNow(order.stage_entered_at) : '—',
    ],
    [t('priority'), String(order.priority)],
  ]

  for (const f of fields.filter((x) => x.is_active)) {
    const v = order.custom_fields[f.code]
    let text: string
    if (v == null || v === '') text = '—'
    else if (f.type === 'bool') text = v ? t('yes') : t('no')
    else if (f.type === 'select')
      text =
        f.options?.find((o) => o.value === v)?.[lang === 'ru' ? 'label_ru' : 'label_uz'] ??
        String(v)
    else if (Array.isArray(v)) text = v.join(', ')
    else text = String(v)
    rows.push([lang === 'ru' ? f.label_ru : f.label_uz, text])
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="card p-4 lg:col-span-2">
        <table className="w-full text-sm">
          <tbody>
            {rows.map(([label, value], i) => (
              <tr key={i} className="border-b border-surface-border last:border-0 dark:border-[#2a3140]">
                <td className="w-40 py-2 pr-3 align-top text-xs text-ink-faint">{label}</td>
                <td className="py-2">{value}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {order.description && (
          <div className="mt-3 border-t border-surface-border pt-3 dark:border-[#2a3140]">
            <div className="label">{t('description')}</div>
            <p className="whitespace-pre-wrap text-sm">{order.description}</p>
          </div>
        )}
      </div>

      <div className="card space-y-2 p-4 text-xs">
        <div>
          <span className="text-ink-faint">Создан: </span>
          {dt(order.created_at)}
        </div>
        {order.created_by && (
          <div>
            <span className="text-ink-faint">Автор: </span>
            {order.created_by.full_name}
          </div>
        )}
        {order.closed_at && (
          <div>
            <span className="text-ink-faint">Закрыт: </span>
            {dt(order.closed_at)}
          </div>
        )}
        {order.close_reason && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-rose-700">
            {order.close_reason}
          </div>
        )}
      </div>
    </div>
  )
}

/* ---------------- Fayllar ---------------- */

function FilesTab({ order, onChange }: { order: OrderDetail; onChange: () => void }) {
  const t = useT()
  const lang = useLang((s) => s.lang)
  const { can } = useAuth()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  async function upload(files: FileList | null) {
    if (!files?.length) return
    setBusy(true)
    for (const f of Array.from(files)) {
      const fd = new FormData()
      fd.append('file', f)
      fd.append('entity', 'order')
      fd.append('entity_id', String(order.id))
      try {
        await api.post('/files', fd)
      } catch (e) {
        toast(errText(e, lang), 'error')
      }
    }
    setBusy(false)
    if (input.current) input.current.value = ''
    onChange()
  }

  async function download(url: string, name: string) {
    const r = await fetch(`${API_URL}${url}`, {
      headers: { Authorization: `Bearer ${tokens.access}` },
    })
    const blob = await r.blob()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = name
    a.click()
    URL.revokeObjectURL(a.href)
  }

  async function remove(fileId: number) {
    try {
      await api.delete(`/files/${fileId}`)
      onChange()
    } catch (e) {
      toast(errText(e, lang), 'error')
    }
  }

  return (
    <div className="card p-4">
      {can('file.upload') && (
        <div className="mb-3">
          <input ref={input} type="file" multiple className="hidden" onChange={(e) => upload(e.target.files)} />
          <button className="btn-ghost" onClick={() => input.current?.click()} disabled={busy}>
            {busy ? t('loading') : `📎 ${t('attach')}`}
          </button>
        </div>
      )}

      {order.files.length === 0 ? (
        <Empty />
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {order.files.map((f) => (
            <div
              key={f.id}
              className="flex items-center gap-2 rounded-lg border border-surface-border p-2 dark:border-[#2f3745]"
            >
              <span className="text-lg">{f.is_image ? '🖼' : '📄'}</span>
              <button
                onClick={() => download(f.url, f.name)}
                className="min-w-0 flex-1 text-left"
              >
                <div className="truncate text-xs font-medium">{f.name}</div>
                <div className="text-[10px] text-ink-faint">
                  {fileSize(f.size)} · {f.uploaded_by?.full_name} · {fromNow(f.created_at)}
                </div>
              </button>
              {can('file.delete') && (
                <button onClick={() => remove(f.id)} className="text-ink-faint hover:text-rose-500">
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ---------------- Marshrut tarixi ---------------- */

function HistoryTab({ orderId }: { orderId: number }) {
  const nm = useNm()
  const t = useT()
  const { data = [], isLoading } = useQuery({
    queryKey: ['order-history', orderId],
    queryFn: async () => (await api.get<StageHistory[]>(`/orders/${orderId}/history`)).data,
  })

  if (isLoading) return <Spinner />
  if (!data.length) return <Empty />

  return (
    <div className="card p-4">
      <div className="space-y-0">
        {data.map((h, i) => (
          <div key={h.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className={clsx(
                  'mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full',
                  h.left_at ? 'bg-brand-400' : 'bg-emerald-500 ring-4 ring-emerald-100',
                )}
              />
              {i < data.length - 1 && <span className="w-px flex-1 bg-surface-border dark:bg-[#2a3140]" />}
            </div>

            <div className="flex-1 pb-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">
                  {nm({ name_ru: h.stage_name_ru, name_uz: h.stage_name_uz }, 'name')}
                </span>
                {h.was_overdue && <Badge color="#e11d48">{t('overdue')}</Badge>}
                {!h.left_at && <Badge color="#10b981">•</Badge>}
              </div>

              <div className="mt-0.5 text-xs text-ink-soft">
                {h.responsible ? h.responsible.full_name : '—'}
                {' · '}
                {dt(h.entered_at)}
                {h.duration_sec != null && ` · ${duration(h.duration_sec)}`}
              </div>

              {h.comment && (
                <div className="mt-1 rounded-lg bg-surface-muted px-2 py-1 text-xs dark:bg-[#242b38]">
                  {h.comment}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ---------------- Proyekt logi ---------------- */

function LogTab({ orderId }: { orderId: number }) {
  const lang = useLang((s) => s.lang)
  const t = useT()
  const [onlyFailed, setOnlyFailed] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['order-log', orderId, onlyFailed],
    queryFn: async () =>
      (
        await api.get<Page<LogEntry>>(`/logs/order/${orderId}`, {
          params: { size: 100, is_success: onlyFailed ? false : undefined },
        })
      ).data,
  })

  if (isLoading) return <Spinner />
  const items = data?.items ?? []

  return (
    <div className="card p-4">
      <label className="mb-3 flex cursor-pointer items-center gap-2 text-xs text-ink-soft">
        <input type="checkbox" checked={onlyFailed} onChange={(e) => setOnlyFailed(e.target.checked)} />
        {t('log_failed')}
      </label>

      {items.length === 0 ? (
        <Empty />
      ) : (
        <div className="space-y-1.5">
          {items.map((l) => (
            <div
              key={l.id}
              className={clsx(
                'flex gap-2 rounded-lg border px-2.5 py-1.5 text-xs',
                l.is_success
                  ? 'border-surface-border dark:border-[#2f3745]'
                  : 'border-rose-200 bg-rose-50/50 dark:border-rose-900/40 dark:bg-rose-900/10',
              )}
            >
              <span className="shrink-0">{l.is_success ? '✓' : '✕'}</span>
              <div className="min-w-0 flex-1">
                <div className="break-words">{lang === 'ru' ? l.message_ru : l.message_uz}</div>
                <div className="mt-0.5 text-[10px] text-ink-faint">
                  {l.actor_name ?? '—'} · {dt(l.created_at)} · <span className="font-mono">{l.action}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ---------------- Mas'ul biriktirish ---------------- */

function AssignModal({
  order,
  onClose,
  onDone,
}: {
  order: OrderDetail
  onClose: () => void
  onDone: () => void
}) {
  const t = useT()
  const lang = useLang((s) => s.lang)
  const [busy, setBusy] = useState(false)

  const { data: users = [] } = useQuery({
    queryKey: ['assignees', order.id, order.stage_id],
    queryFn: async () =>
      (
        await api.get<{ id: number; full_name: string; active_orders: number }[]>(
          `/orders/${order.id}/available-assignees`,
        )
      ).data,
  })

  async function assign(userId: number | null) {
    setBusy(true)
    try {
      await api.post(`/orders/${order.id}/assign`, { user_id: userId })
      onDone()
      onClose()
    } catch (e) {
      toast(errText(e, lang), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={t('assign')}>
      <div className="space-y-1">
        <button
          onClick={() => assign(null)}
          disabled={busy}
          className="w-full rounded-lg border border-surface-border px-2.5 py-1.5 text-left text-sm text-ink-faint hover:bg-surface-muted dark:border-[#2f3745] dark:hover:bg-[#222836]"
        >
          — {t('free')}
        </button>

        {users.length === 0 && <Empty />}

        {users.map((u) => (
          <button
            key={u.id}
            onClick={() => assign(u.id)}
            disabled={busy}
            className={clsx(
              'flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-sm transition-colors',
              order.responsible?.id === u.id
                ? 'border-brand-400 bg-brand-50 dark:bg-brand-900/20'
                : 'border-surface-border hover:bg-surface-muted dark:border-[#2f3745] dark:hover:bg-[#222836]',
            )}
          >
            <Avatar name={u.full_name} size={22} />
            <span className="flex-1 truncate">{u.full_name}</span>
            <span className="text-[10px] text-ink-faint">
              {u.active_orders} {t('active_orders')}
            </span>
          </button>
        ))}
      </div>
    </Modal>
  )
}
