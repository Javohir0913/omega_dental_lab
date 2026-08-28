import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { api, API_URL, errText, tokens } from '@/lib/api'
import { socket } from '@/lib/ws'
import { useAuth } from '@/lib/auth'
import { useLang, useNm, useT } from '@/i18n'
import { Avatar, Badge, Confirm, Empty, Field, Modal, NumberInput, SearchSelect, Spinner, Tabs } from '@/components/ui'
import { toast } from '@/components/Toast'
import ChatPanel from '@/components/ChatPanel'
import MoveModal from '@/components/MoveModal'
import PauseModal from '@/components/PauseModal'
import ControlRejectModal from '@/components/ControlRejectModal'
import QrModal from '@/components/QrModal'
import { CustomFieldInput, FileFieldInput } from '@/components/FieldInput'
import Model3DViewer from '@/components/Model3DViewer'
import Model3DThumbnail from '@/components/Model3DThumbnail'
import PhotoThumb from '@/components/PhotoThumb'
import ToothChart from '@/components/ToothChart'
import WorkCalendarNotice from '@/components/WorkCalendarNotice'
import { useToothLabels } from '@/lib/useToothLabels'
import { useToothChartScale } from '@/lib/useToothChartScale'
import { dt, duration, fileSize, fromLocalInput, fromNow, toLocalInput } from '@/lib/format'
import { RAW_EXTS } from '@/lib/fileTypes'
import type {
  CustomField,
  Doctor,
  LayoutSection,
  LogEntry,
  OrderControlEntry,
  OrderDetail,
  OrderUpdatePayload,
  Page,
  Patient,
  RequirementError,
  ServiceItem,
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
  const [deleting, setDeleting] = useState(false)
  const [showMoveBack, setShowMoveBack] = useState(false)
  const [showPause, setShowPause] = useState(false)
  const [showResume, setShowResume] = useState(false)
  const [showQr, setShowQr] = useState(false)
  const [showControlReject, setShowControlReject] = useState(false)
  const [move, setMove] = useState<{
    stage: Stage
    req?: RequirementError | null
    needAssignee?: boolean
    controlControllers?: { id: number; full_name: string }[]
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

  const { data: prevStage = null } = useQuery({
    queryKey: ['order-prev-stage', orderId, order?.stage_id],
    queryFn: async () => (await api.get<Stage | null>(`/orders/${orderId}/prev-stage`)).data,
    enabled: Boolean(order?.can_move_back),
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
    const off3 = socket.on('order.control_requested', () =>
      qc.invalidateQueries({ queryKey: ['order', orderId] }),
    )
    const off4 = socket.on('order.control_rejected', () =>
      qc.invalidateQueries({ queryKey: ['order', orderId] }),
    )
    return () => {
      socket.leave(`order:${orderId}`)
      off()
      off2()
      off3()
      off4()
    }
  }, [orderId, qc])

  // Chat tab ochilganda xabarlarni yangilash
  useEffect(() => {
    if (tab === 'chat' && order?.chat_id) {
      qc.invalidateQueries({ queryKey: ['chat', order.chat_id] })
    }
  }, [tab, order?.chat_id, qc])

  if (isLoading) return <Spinner />
  if (!order) return <Empty />

  const refresh = () => qc.invalidateQueries({ queryKey: ['order', orderId] })

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
      else if (detail?.error === 'control_required') setMove({ stage, controlControllers: detail.controllers ?? [] })
      else toast(errText(err, lang), 'error')
    }
  }

  async function approveControl() {
    try {
      await api.post(`/orders/${orderId}/control/approve`, {})
      refresh()
      qc.invalidateQueries({ queryKey: ['kanban'] })
      toast(`${t('control_approve')} ✓`)
    } catch (e) {
      toast(errText(e, lang), 'error')
    }
  }

  async function resume() {
    try {
      await api.post(`/orders/${orderId}/resume`)
      refresh()
      qc.invalidateQueries({ queryKey: ['kanban'] })
      toast(`${t('resume')} ✓`)
    } catch (e) {
      toast(errText(e, lang), 'error')
    }
  }

  async function remove() {
    try {
      await api.delete(`/orders/${orderId}`)
      toast(t('order_deleted_undo') + ' ✓')
      navigate('/orders')
    } catch (e) {
      toast(errText(e, lang), 'error')
    }
  }

  const canEdit = can('order.edit') || can('order.rename')
  const showChatTab = !order.is_closed || order.unread_messages > 0 || tab === 'chat'

  async function saveInline(payload: OrderUpdatePayload) {
    try {
      await api.patch(`/orders/${orderId}`, payload)
      refresh()
      toast(t('saved') + ' ✓')
    } catch (e) {
      toast(errText(e, lang), 'error')
    }
  }

  return (
    <div className="mx-auto max-w-6xl p-4 pb-20">
      {/* Sarlavha */}
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <button onClick={() => navigate(-1)} className="btn-ghost shrink-0 px-2">
            ←
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-ink-faint">{order.number}</span>
              {order.stage && (
                <Badge color={order.stage.color}>{nm(order.stage, 'name')}</Badge>
              )}
              {order.is_paused && <Badge color="#64748b">{t('paused_badge')}</Badge>}
              {order.control_status === 'pending' && <Badge color="#22c55e">🛡 {t('control_pending')}</Badge>}
              {!order.is_paused && order.is_overdue && <Badge color="#e11d48">{t('overdue')}</Badge>}
            </div>
            <h1 className="mt-0.5 text-lg font-semibold leading-tight">{order.title}</h1>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 sm:shrink-0">
          {!order.is_closed && !order.is_paused && order.can_move && (
            <button className="btn-ghost" onClick={() => setShowPause(true)}>
              {t('pause')}
            </button>
          )}
          {order.is_paused && order.can_resume && (
            <button className="btn-ghost" onClick={() => setShowResume(true)}>
              {t('resume')}
            </button>
          )}
          {order.can_approve_control && (
            <>
              <button className="btn-primary" onClick={approveControl}>
                {t('control_approve')}
              </button>
              <button className="btn-ghost text-rose-600" onClick={() => setShowControlReject(true)}>
                {t('control_reject')}
              </button>
            </>
          )}
          {can('order.qr.view') && (
            <button className="btn-ghost" onClick={() => setShowQr(true)}>
              {t('qr_code')}
            </button>
          )}
          {can('order.delete') && (
            <button className="btn-ghost text-rose-600" onClick={() => setDeleting(true)}>
              {t('delete')}
            </button>
          )}
        </div>
      </div>

      {order.is_paused && (
        <div className="mb-4 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-300">
          <div className="font-medium">
            {t('paused_badge')}
            {order.paused_by && ` — ${t('paused_by_label')}: ${order.paused_by.full_name}`}
            {order.paused_at && ` (${dt(order.paused_at)})`}
          </div>
          {order.pause_reason && <div className="mt-0.5">{t('pause_reason')}: {order.pause_reason}</div>}
        </div>
      )}

      {order.control_status === 'pending' && (
        <div className="mb-4 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-900/10 dark:text-emerald-300">
          <div className="font-medium">
            🛡 {t('control_pending')}
            {order.control_controller && ` — ${order.control_controller.full_name}`}
          </div>
        </div>
      )}

      {order.deadline_paused && (
        <WorkCalendarNotice
          variant="bar"
          remainingSec={order.stage_remaining_seconds}
          className="mb-4"
        />
      )}

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
          ...(showChatTab ? [{ value: 'chat', label: t('chat'), badge: order.unread_messages || undefined }] : []),
          { value: 'files', label: t('files'), badge: order.unread_files_count || undefined },
          { value: 'history', label: t('history') },
          ...(can('log.order') ? [{ value: 'log', label: t('log') }] : []),
        ]}
      />

      <div className="mt-4">
        {tab === 'info' && (
          <InfoTab
            order={order}
            canEdit={canEdit}
            onSave={saveInline}
            prevStage={prevStage}
            onMoveBack={() => setShowMoveBack(true)}
          />
        )}
        {tab === 'chat' &&
          (order.chat_id ? (
            <div className="card h-[60vh] overflow-hidden">
              <ChatPanel chatId={order.chat_id} chatType="order" onClose={() => setTab('info')} />
            </div>
          ) : (
            <Empty />
          ))}
        {tab === 'files' && <FilesTab order={order} onChange={refresh} isActive />}
        {tab === 'history' && <HistoryTab orderId={orderId} />}
        {tab === 'log' && <LogTab orderId={orderId} />}
      </div>

      {move && (
        <MoveModal
          order={order}
          toStage={move.stage}
          requirement={move.req}
          needAssignee={move.needAssignee}
          controlControllers={move.controlControllers}
          onClose={() => setMove(null)}
          onDone={() => {
            refresh()
            qc.invalidateQueries({ queryKey: ['kanban'] })
          }}
        />
      )}

      {showControlReject && (
        <ControlRejectModal
          order={order}
          onClose={() => setShowControlReject(false)}
          onDone={() => {
            refresh()
            qc.invalidateQueries({ queryKey: ['kanban'] })
          }}
        />
      )}

      <Confirm
        open={deleting}
        text={`${order.number} — ${order.title}`}
        onCancel={() => setDeleting(false)}
        onOk={remove}
      />

      {showQr && <QrModal order={order} onClose={() => setShowQr(false)} />}

      {showMoveBack && prevStage && (
        <Modal
          open
          onClose={() => setShowMoveBack(false)}
          title={t('move_back')}
          footer={
            <>
              <button className="btn-ghost" onClick={() => setShowMoveBack(false)}>
                {t('cancel')}
              </button>
              <button
                className="btn-primary"
                onClick={async () => {
                  setShowMoveBack(false)
                  await tryMove(prevStage)
                }}
              >
                {t('move_back')}
              </button>
            </>
          }
        >
          <p className="text-sm text-ink-soft">
            {t('move_back_confirm')}: <strong>{nm(prevStage, 'name')}</strong>?
          </p>
        </Modal>
      )}

      {showPause && (
        <PauseModal
          order={order}
          onClose={() => setShowPause(false)}
          onDone={() => refresh()}
        />
      )}

      {showResume && (
        <Modal
          open
          onClose={() => setShowResume(false)}
          title={t('resume')}
          footer={
            <>
              <button className="btn-ghost" onClick={() => setShowResume(false)}>
                {t('cancel')}
              </button>
              <button
                className="btn-primary"
                onClick={async () => {
                  setShowResume(false)
                  await resume()
                }}
              >
                {t('resume')}
              </button>
            </>
          }
        >
          <p className="text-sm text-ink-soft">{t('resume_confirm')}</p>
          {order.pause_reason && (
            <p className="mt-2 text-xs text-ink-faint">
              {t('pause_reason')}: {order.pause_reason}
            </p>
          )}
        </Modal>
      )}
    </div>
  )
}

/* ---------------- Ma'lumot (inline tahrirlash) ---------------- */

function InfoTab({
  order,
  canEdit,
  onSave,
  prevStage,
  onMoveBack,
}: {
  order: OrderDetail
  canEdit: boolean
  onSave: (payload: OrderUpdatePayload) => Promise<void>
  prevStage?: Stage | null
  onMoveBack?: () => void
}) {
  const t = useT()
  const lang = useLang((s) => s.lang)
  const toothLabels = useToothLabels()
  const toothChartScale = useToothChartScale()

  const [title, setTitle] = useState(order.title)
  const [photoFileId, setPhotoFileId] = useState<number | null>(order.photo?.id ?? null)
  const [patientId, setPatientId] = useState<number | null>(order.patient?.id ?? null)
  const [doctorId, setDoctorId] = useState<number | null>(order.doctor?.id ?? null)
  const [serviceIds, setServiceIds] = useState<number[]>(order.services.map((s) => s.id))
  const [teeth, setTeeth] = useState<number[]>(order.teeth ?? [])
  const [deadline, setDeadline] = useState(toLocalInput(order.deadline))
  const [priority, setPriority] = useState<number>(order.priority)
  const [description, setDescription] = useState(order.description ?? '')
  const [cf, setCf] = useState<Record<string, unknown>>({ ...order.custom_fields })
  const [saving, setSaving] = useState(false)
  const [pSearch, setPSearch] = useState('')
  const [dSearch, setDSearch] = useState('')
  const [sSearch, setSSearch] = useState('')
  const [showServices, setShowServices] = useState(false)
  const [showAssign, setShowAssign] = useState(false)
  const assignRef = useRef<HTMLDivElement>(null)

  // reset when order changes
  useEffect(() => {
    setTitle(order.title)
    setPhotoFileId(order.photo?.id ?? null)
    setPatientId(order.patient?.id ?? null)
    setDoctorId(order.doctor?.id ?? null)
    setServiceIds(order.services.map((s) => s.id))
    setTeeth(order.teeth ?? [])
    setDeadline(toLocalInput(order.deadline))
    setPriority(order.priority)
    setDescription(order.description ?? '')
    setCf({ ...order.custom_fields })
    setPSearch('')
    setDSearch('')
    setSSearch('')
  }, [order])

  const origDeadline = toLocalInput(order.deadline)
  const dirty =
    title !== order.title ||
    photoFileId !== (order.photo?.id ?? null) ||
    patientId !== (order.patient?.id ?? null) ||
    doctorId !== (order.doctor?.id ?? null) ||
    JSON.stringify(serviceIds) !== JSON.stringify(order.services.map((s) => s.id)) ||
    JSON.stringify(teeth) !== JSON.stringify(order.teeth ?? []) ||
    deadline !== origDeadline ||
    priority !== order.priority ||
    description !== (order.description ?? '') ||
    JSON.stringify(cf) !== JSON.stringify(order.custom_fields)

  async function handleSave() {
    setSaving(true)
    const payload: OrderUpdatePayload = {}
    if (title !== order.title) payload.title = title
    if (photoFileId !== (order.photo?.id ?? null)) payload.photo_file_id = photoFileId
    if (patientId !== (order.patient?.id ?? null)) payload.patient_id = patientId
    if (doctorId !== (order.doctor?.id ?? null)) payload.doctor_id = doctorId
    if (JSON.stringify(serviceIds) !== JSON.stringify(order.services.map((s) => s.id))) payload.service_ids = serviceIds
    if (JSON.stringify(teeth) !== JSON.stringify(order.teeth ?? [])) payload.teeth = teeth
    if (deadline !== origDeadline) payload.deadline = fromLocalInput(deadline)
    if (priority !== order.priority) payload.priority = priority
    if (description !== (order.description ?? '')) payload.description = description || null
    if (JSON.stringify(cf) !== JSON.stringify(order.custom_fields)) payload.custom_fields = cf
    await onSave(payload)
    setTempUploadedFileIds([])
    setSaving(false)
  }

  const [tempUploadedFileIds, setTempUploadedFileIds] = useState<number[]>([])

  function handleCancel() {
    // Otmena qilinganda saqlanmagan barcha yangi fayllarni serverdan ham o'chirish
    if (tempUploadedFileIds.length > 0) {
      tempUploadedFileIds.forEach((id) => {
        api.delete(`/files/${id}`).catch(() => {})
      })
      setTempUploadedFileIds([])
    }

    setTitle(order.title)
    setPhotoFileId(order.photo?.id ?? null)
    setPatientId(order.patient?.id ?? null)
    setDoctorId(order.doctor?.id ?? null)
    setServiceIds(order.services.map((s) => s.id))
    setTeeth(order.teeth ?? [])
    setDeadline(origDeadline)
    setPriority(order.priority)
    setDescription(order.description ?? '')
    setCf({ ...order.custom_fields })
    setPSearch('')
    setDSearch('')
    setSSearch('')
  }

  async function handleAssign(userId: number | null) {
    try {
      await api.post(`/orders/${order.id}/assign`, { user_id: userId })
      setShowAssign(false)
      await onSave({})
    } catch (e) {
      toast(errText(e, lang), 'error')
    }
  }

  async function handleClaim() {
    try {
      await api.post(`/orders/${order.id}/claim`)
      setShowAssign(false)
      await onSave({})
    } catch (e) {
      toast(errText(e, lang), 'error')
    }
  }

  const { data: layout = [] } = useQuery({
    queryKey: ['order-layout'],
    queryFn: async () => (await api.get<LayoutSection[]>('/order-layout')).data,
  })

  const { data: patients } = useQuery({
    queryKey: ['patients-select'],
    queryFn: async () => (await api.get<Page<Patient>>('/patients', { params: { size: 200 } })).data,
    enabled: canEdit,
  })
  const { data: doctors } = useQuery({
    queryKey: ['doctors-select'],
    queryFn: async () => (await api.get<Page<Doctor>>('/doctors', { params: { size: 200 } })).data,
    enabled: canEdit,
  })
  const { data: services } = useQuery({
    queryKey: ['services-select'],
    queryFn: async () => (await api.get<ServiceItem[]>('/services')).data,
    enabled: canEdit,
  })
  const { data: assignableUsers = [] } = useQuery({
    queryKey: ['assignees', order.id, order.stage_id],
    queryFn: async () =>
      (await api.get<{ id: number; full_name: string; active_orders: number }[]>(
        `/orders/${order.id}/available-assignees`,
      )).data,
    enabled: canEdit,
  })

  // click outside to close assign dropdown
  useEffect(() => {
    if (!showAssign) return
    const h = (e: MouseEvent) => {
      if (assignRef.current && !assignRef.current.contains(e.target as Node)) setShowAssign(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [showAssign])

  const patList = (patients?.items ?? []).filter((p) => {
    const q = pSearch.toLowerCase()
    return !q || p.full_name.toLowerCase().includes(q) || (p.phone ?? '').includes(q)
  })
  const docList = (doctors?.items ?? []).filter((d) => {
    const q = dSearch.toLowerCase()
    return !q || d.full_name.toLowerCase().includes(q) || (d.clinic ?? '').toLowerCase().includes(q)
  })
  const svcList = (services ?? []).filter((s) => {
    const q = sSearch.toLowerCase()
    const name = (lang === 'ru' ? s.name_ru : s.name_uz).toLowerCase()
    return !q || name.includes(q)
  })

  const selectedPatient = patients?.items?.find((p) => p.id === patientId)
  const selectedDoctor = doctors?.items?.find((d) => d.id === doctorId)

  const selectedServices = services?.filter((s) => serviceIds.includes(s.id)) ?? []

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="card min-w-0 overflow-x-auto p-4 lg:col-span-2">
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col className="w-20 sm:w-40" />
            <col className="w-[calc(100%-5rem)] sm:w-[calc(100%-10rem)]" />
          </colgroup>
          <tbody>
            {(() => {
              const inStageRow = (
                <tr key="_in_stage" className="border-b border-surface-border dark:border-[#2a3140]">
                  <td className="w-20 break-words py-2 pr-2 align-top text-xs text-ink-faint sm:w-40 sm:pr-3">{t('in_stage')}</td>
                  <td className="py-2">
                    {order.stage_entered_at ? fromNow(order.stage_entered_at) : '—'}
                    {order.stage_remaining_seconds != null && (
                      <span className="ml-2 text-xs text-ink-faint">
                        · {t('wc_work_time_left')}:{' '}
                        <span className={clsx(order.stage_remaining_seconds < 0 && 'text-rose-600')}>
                          {order.stage_remaining_seconds < 0
                            ? `−${duration(-order.stage_remaining_seconds)}`
                            : duration(order.stage_remaining_seconds)}
                        </span>
                      </span>
                    )}
                  </td>
                </tr>
              )

              const SYSTEM_ROW_RENDERERS: Record<string, () => React.ReactNode> = {
                'sys:title': () => (
                  <tr key="sys:title" className="border-b border-surface-border dark:border-[#2a3140]">
                    <td className="w-20 break-words py-2 pr-2 align-top text-xs text-ink-faint sm:w-40 sm:pr-3">{t('order_title')}</td>
                    <td className="py-2">
                      {canEdit ? (
                        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
                      ) : (
                        order.title
                      )}
                    </td>
                  </tr>
                ),
                'sys:photo_file_id': () => (
                  <tr key="sys:photo_file_id" className="border-b border-surface-border dark:border-[#2a3140]">
                    <td className="w-20 break-words py-2 pr-2 align-top text-xs text-ink-faint sm:w-40 sm:pr-3">
                      {lang === 'ru' ? 'Фото проекта' : 'Proyekt rasmi'}
                    </td>
                    <td className="py-2">
                      {canEdit ? (
                        <FileFieldInput
                          value={photoFileId}
                          onChange={(v) => setPhotoFileId(Array.isArray(v) ? (v[0] as number) ?? null : (v as number | null))}
                          orderId={order.id}
                          lang={lang}
                          multiple={false}
                        />
                      ) : order.photo ? (
                        <PhotoThumb photo={order.photo} className="h-20 w-20 overflow-hidden rounded-lg" />
                      ) : (
                        <span className="text-ink-faint">—</span>
                      )}
                    </td>
                  </tr>
                ),
                'sys:patient_id': () => (
                  <tr key="sys:patient_id" className="border-b border-surface-border dark:border-[#2a3140]">
                    <td className="w-20 break-words py-2 pr-2 align-top text-xs text-ink-faint sm:w-40 sm:pr-3">{t('patient')}</td>
                    <td className="py-2">
                      {canEdit ? (
                        <SearchSelect
                          items={patList.map((p) => ({ id: p.id, label: p.full_name, sub: p.phone ? `📞 ${p.phone}` : undefined }))}
                          value={patientId}
                          onChange={setPatientId}
                          search={pSearch}
                          onSearchChange={setPSearch}
                          placeholder={t('search')}
                        />
                      ) : (
                        order.patient
                          ? `${order.patient.full_name}${order.patient.phone ? ` · ${order.patient.phone}` : ''}`
                          : '—'
                      )}
                    </td>
                  </tr>
                ),
                'sys:doctor_id': () => (
                  <tr key="sys:doctor_id" className="border-b border-surface-border dark:border-[#2a3140]">
                    <td className="w-20 break-words py-2 pr-2 align-top text-xs text-ink-faint sm:w-40 sm:pr-3">{t('doctor')}</td>
                    <td className="py-2">
                      {canEdit ? (
                        <SearchSelect
                          items={docList.map((d) => ({ id: d.id, label: d.full_name, sub: d.clinic ? `🏥 ${d.clinic}` : undefined }))}
                          value={doctorId}
                          onChange={setDoctorId}
                          search={dSearch}
                          onSearchChange={setDSearch}
                          placeholder={t('search')}
                        />
                      ) : (
                        order.doctor?.full_name ?? '—'
                      )}
                    </td>
                  </tr>
                ),
                'sys:services': () => (
                  <tr key="sys:services" className="border-b border-surface-border dark:border-[#2a3140]">
                    <td className="w-20 break-words py-2 pr-2 align-top text-xs text-ink-faint sm:w-40 sm:pr-3">{t('services')}</td>
                    <td className="py-2">
                      {canEdit ? (
                        <div className="relative">
                          {selectedServices.length > 0 && (
                            <div className="mb-1.5 flex flex-wrap gap-1.5">
                              {selectedServices.map((s) => {
                                const name = lang === 'ru' ? s.name_ru : s.name_uz
                                return (
                                  <span key={s.id} className="inline-flex items-center gap-1 rounded-md bg-brand-50 px-2 py-0.5 text-xs text-brand-700 dark:bg-brand-900/20 dark:text-brand-300">
                                    {name}
                                    <button
                                      className="ml-0.5 text-brand-400 hover:text-brand-600 dark:hover:text-brand-200"
                                      onClick={() => setServiceIds((prev) => prev.filter((id) => id !== s.id))}
                                    >
                                      ✕
                                    </button>
                                  </span>
                                )
                              })}
                            </div>
                          )}
                          <input
                            className="input w-full"
                            value={sSearch}
                            placeholder={selectedServices.length === 0 ? t('search') : ''}
                            onFocus={() => setShowServices(true)}
                            onChange={(e) => { setSSearch(e.target.value); setShowServices(true) }}
                          />
                          {showServices && (
                            <>
                              <div className="fixed inset-0 z-10" onClick={() => { setShowServices(false); setSSearch('') }} />
                              <div className="absolute left-0 right-0 z-20 mt-1 max-h-48 overflow-y-auto rounded-lg border border-surface-border bg-white shadow-pop dark:border-[#2f3745] dark:bg-[#1e2533]">
                                {svcList.map((s) => {
                                  const on = serviceIds.includes(s.id)
                                  const name = lang === 'ru' ? s.name_ru : s.name_uz
                                  return (
                                    <button
                                      key={s.id}
                                      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-surface-muted dark:hover:bg-[#222836] ${on ? 'bg-brand-50 dark:bg-brand-900/20' : ''}`}
                                      onClick={() => setServiceIds((prev) => (on ? prev.filter((x) => x !== s.id) : [...prev, s.id]))}
                                    >
                                      <span className={`grid h-4 w-4 shrink-0 place-items-center rounded border text-[9px] ${on ? 'border-brand-500 bg-brand-500 text-white' : 'border-surface-border dark:border-[#2f3745]'}`}>
                                        {on ? '✓' : ''}
                                      </span>
                                      <span className="truncate">{name}</span>
                                    </button>
                                  )
                                })}
                                {svcList.length === 0 && <div className="px-3 py-2 text-xs text-ink-faint">{t('empty')}</div>}
                              </div>
                            </>
                          )}
                        </div>
                      ) : order.services.length ? (
                        order.services.map((s) => (lang === 'ru' ? s.name_ru : s.name_uz)).join(', ')
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ),
                'sys:teeth': () => (
                  <tr key="sys:teeth" className="border-b border-surface-border dark:border-[#2a3140]">
                    <td colSpan={2} className="py-2">
                      <div className="mb-1.5 text-xs text-ink-faint">{t('teeth')}</div>
                      {canEdit ? (
                        <ToothChart value={teeth} onChange={setTeeth} labels={toothLabels} scalePercent={toothChartScale} />
                      ) : (order.teeth ?? []).length > 0 ? (
                        (order.teeth ?? []).map((c) => toothLabels[String(c)] ?? String(c)).join(', ')
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ),
                'sys:responsible_id': () => (
                  <Fragment key="sys:responsible_id">
                    <tr className="border-b border-surface-border dark:border-[#2a3140]">
                      <td className="w-20 break-words py-2 pr-2 align-top text-xs text-ink-faint sm:w-40 sm:pr-3">{t('responsible')}</td>
                      <td className="py-2">
                        {canEdit ? (
                          <div className="relative" ref={assignRef}>
                            <div className="flex items-center gap-2">
                              <button
                                className="flex flex-1 items-center gap-1.5 text-left text-sm"
                                onClick={() => setShowAssign((v) => !v)}
                              >
                                {order.responsible ? (
                                  <span className="flex items-center gap-1.5">
                                    <Avatar name={order.responsible.full_name} size={18} />
                                    {order.responsible.full_name}
                                  </span>
                                ) : (
                                  <span className="text-ink-faint">{t('free')}</span>
                                )}
                                <span className="text-[10px] text-ink-faint">▼</span>
                              </button>
                              {order.can_claim && !order.responsible && (
                                <button
                                  onClick={handleClaim}
                                  className="rounded-md bg-brand-500 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-brand-600"
                                >
                                  {t('claim')}
                                </button>
                              )}
                              {prevStage && order.can_move_back && onMoveBack && (
                                <button
                                  onClick={onMoveBack}
                                  className="rounded-md border border-surface-border px-2 py-0.5 text-[10px] font-medium text-ink-soft hover:bg-surface-muted dark:border-[#2f3745] dark:hover:bg-[#242b38]"
                                >
                                  {t('move_back')}
                                </button>
                              )}
                            </div>
                            {showAssign && (
                              <div className="absolute left-0 right-0 z-20 mt-1 max-h-48 overflow-y-auto rounded-lg border border-surface-border bg-white shadow-pop dark:border-[#2f3745] dark:bg-[#1e2533]">
                                <button
                                  className="w-full px-3 py-1.5 text-left text-xs text-ink-faint hover:bg-surface-muted dark:hover:bg-[#222836]"
                                  onClick={() => handleAssign(null)}
                                >
                                  — {t('free')}
                                </button>
                                {assignableUsers.map((u) => (
                                  <button
                                    key={u.id}
                                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-surface-muted dark:hover:bg-[#222836] ${order.responsible?.id === u.id ? 'bg-brand-50 font-medium dark:bg-brand-900/20' : ''}`}
                                    onClick={() => handleAssign(u.id)}
                                  >
                                    <Avatar name={u.full_name} size={18} />
                                    <span className="flex-1 truncate">{u.full_name}</span>
                                    <span className="text-[10px] text-ink-faint">
                                      {u.active_orders}
                                    </span>
                                  </button>
                                ))}
                                {assignableUsers.length === 0 && (
                                  <div className="px-3 py-2 text-xs text-ink-faint">{t('empty')}</div>
                                )}
                              </div>
                            )}
                          </div>
                        ) : order.responsible ? (
                          <span className="inline-flex items-center gap-1.5">
                            <Avatar name={order.responsible.full_name} size={18} />
                            {order.responsible.full_name}
                          </span>
                        ) : (
                          <span className="text-ink-faint">{t('free')}</span>
                        )}
                      </td>
                    </tr>
                    {inStageRow}
                  </Fragment>
                ),
                'sys:deadline': () => (
                  <tr key="sys:deadline" className="border-b border-surface-border dark:border-[#2a3140]">
                    <td className="w-20 break-words py-2 pr-2 align-top text-xs text-ink-faint sm:w-40 sm:pr-3">{t('deadline')}</td>
                    <td className="py-2">
                      {canEdit ? (
                        <input type="datetime-local" className="input w-full max-w-[220px]" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
                      ) : order.deadline ? (
                        `${dt(order.deadline)} · ${fromNow(order.deadline)}`
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ),
                'sys:priority': () => (
                  <tr key="sys:priority" className="border-b border-surface-border dark:border-[#2a3140]">
                    <td className="w-20 break-words py-2 pr-2 align-top text-xs text-ink-faint sm:w-40 sm:pr-3">{t('priority')}</td>
                    <td className="py-2">
                      {canEdit ? (
                        <NumberInput min={0} max={10} className="input w-20" value={priority} onChange={(v) => setPriority(v ?? 0)} />
                      ) : (
                        String(order.priority)
                      )}
                    </td>
                  </tr>
                ),
              }

              const hasResponsibleRow = layout.some((s) => s.fields.some((f) => f.field_ref === 'sys:responsible_id'))

              return (
                <>
                  {layout.map((section, si) => (
                    <Fragment key={section.code}>
                      {layout.length > 1 && (
                        <tr>
                          <td
                            colSpan={2}
                            className={clsx(
                              'pb-2 text-xs font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-400',
                              si === 0 ? 'pt-0' : 'border-t border-surface-border pt-6 dark:border-[#2a3140]',
                            )}
                          >
                            {lang === 'ru' ? section.name_ru : section.name_uz}
                          </td>
                        </tr>
                      )}
                      {section.fields.filter((lf) => !lf.is_hidden).map((lf) =>
                        lf.kind === 'system' ? (
                          SYSTEM_ROW_RENDERERS[lf.field_ref]?.() ?? null
                        ) : lf.custom_field ? (
                          <CustomFieldRow
                            key={lf.field_ref}
                            field={lf.custom_field}
                            value={cf[lf.custom_field.code]}
                            canEdit={canEdit}
                            orderId={order.id}
                            lang={lang}
                            t={t}
                            onChange={(v) => setCf((p) => ({ ...p, [lf.custom_field!.code]: v }))}
                            onFileAdded={(ids) => setTempUploadedFileIds((prev) => [...prev, ...ids])}
                          />
                        ) : null,
                      )}
                    </Fragment>
                  ))}
                  {!hasResponsibleRow && inStageRow}
                </>
              )
            })()}
          </tbody>
        </table>

        {/* Description */}
        <div className="mt-3 border-t border-surface-border pt-3 dark:border-[#2a3140]">
          <div className="label">{t('description')}</div>
          {canEdit ? (
            <textarea className="input min-h-[80px]" value={description} onChange={(e) => setDescription(e.target.value)} />
          ) : order.description ? (
            <p className="whitespace-pre-wrap text-sm">{order.description}</p>
          ) : (
            <p className="text-sm text-ink-faint">—</p>
          )}
        </div>
      </div>

      <div className="card space-y-2 p-4 text-xs">
        <div><span className="text-ink-faint">Создан: </span>{dt(order.created_at)}</div>
        {order.created_by && <div><span className="text-ink-faint">Автор: </span>{order.created_by.full_name}</div>}
        {order.closed_at && <div><span className="text-ink-faint">Закрыт: </span>{dt(order.closed_at)}</div>}
        {order.close_reason && <div className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-rose-700">{order.close_reason}</div>}
      </div>

      {/* Sticky bottom bar — markazlashtirilgan */}
      {canEdit && dirty && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-surface-border bg-white px-3 py-3 shadow-pop dark:border-[#2a3140] dark:bg-[#171c26] sm:px-4">
          <div className="mx-auto flex max-w-6xl flex-col justify-center gap-2 sm:flex-row sm:gap-4">
            <button className="btn-ghost w-full px-6 py-2 sm:min-w-[120px] sm:w-auto" onClick={handleCancel} disabled={saving}>
              {t('cancel')}
            </button>
            <button className="btn-primary w-full px-6 py-2 sm:min-w-[120px] sm:w-auto" onClick={handleSave} disabled={saving}>
              {saving ? t('loading') : t('save')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function CustomFieldRow({
  field: f,
  value: val,
  canEdit,
  orderId,
  lang,
  t,
  onChange,
  onFileAdded,
}: {
  field: CustomField
  value: unknown
  canEdit: boolean
  orderId: number
  lang: string
  t: (k: string) => string
  onChange: (v: unknown) => void
  onFileAdded: (ids: number[]) => void
}) {
  const label = lang === 'ru' ? f.label_ru : f.label_uz
  return (
    <tr className="border-b border-surface-border dark:border-[#2a3140]">
      <td className="w-20 break-words py-2 pr-2 align-top text-xs text-ink-faint sm:w-40 sm:pr-3">{label}</td>
      <td className="py-2">
        {f.type === 'file' ? (
          /* Fayl maydonini har doim interaktiv ko'rsatamiz */
          <CustomFieldInput
            field={f}
            value={val}
            onChange={canEdit ? (v) => {
              // Yangi qo'shilgan fayl ID larini kuzatib borish
              const prevIds = Array.isArray(val) ? val : val != null ? [val] : []
              const nextIds = Array.isArray(v) ? v : v != null ? [v] : []
              const added = nextIds.filter((x): x is number => typeof x === 'number' && !prevIds.includes(x))
              if (added.length > 0) {
                onFileAdded(added)
              }
              onChange(v)
            } : () => {}}
            orderId={orderId}
          />
        ) : canEdit ? (
          <CustomFieldInput field={f} value={val} onChange={onChange} />
        ) : (
          renderCfValue(f, val, lang, t)
        )}
      </td>
    </tr>
  )
}

function renderCfValue(f: CustomField, v: unknown, lang: string, t: (k: string) => string) {
  if (v == null || v === '') return <span className="text-ink-faint">—</span>
  if (f.type === 'bool') return v ? t('yes') : t('no')
  if (f.type === 'select')
    return f.options?.find((o) => o.value === v)?.[lang === 'ru' ? 'label_ru' : 'label_uz'] ?? String(v)
  if (Array.isArray(v)) return v.join(', ')
  return String(v)
}

/* ---------------- Fayllar ---------------- */

const PREVIEW_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
  webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', heic: 'image/heic', heif: 'image/heif',
  mp4: 'video/mp4', webm: 'video/webm', ogg: 'video/ogg',
  mp3: 'audio/mpeg', wav: 'audio/wav',
  html: 'text/html', htm: 'text/html',
}

const MODEL3D_EXTS = ['stl', 'obj', 'ply']
const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'heic', 'heif']

type FileLike = { name: string; url: string }
type LightboxItem = { url: string; name: string; sourceUrl: string }
type SampleFile = {
  id: string
  name: string
  mime?: string | null
  size: number
  is_image: boolean
  url: string
  created_at: string
  group?: string
}

function fileExt(name: string) {
  return name.split('.').pop()?.toLowerCase() ?? ''
}

function fileIcon(name: string, isImage: boolean): string {
  if (isImage) return '🖼️'
  const ext = fileExt(name)
  if (MODEL3D_EXTS.includes(ext)) return '🧠'
  if (RAW_EXTS.includes(ext)) return '📷'
  if (['html', 'htm'].includes(ext)) return '🌐'
  if (ext === 'pdf') return '📕'
  if (['doc', 'docx'].includes(ext)) return '📝'
  if (['xls', 'xlsx', 'csv'].includes(ext)) return '📊'
  if (['ppt', 'pptx'].includes(ext)) return '📊'
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return '🗜️'
  if (['mp4', 'webm', 'avi', 'mov', 'mkv'].includes(ext)) return '🎬'
  if (['mp3', 'wav', 'ogg', 'aac'].includes(ext)) return '🎵'
  return '📄'
}

// CR2/CR3 (Canon RAW) — serverdan JPEG preview olib ko'rsatadi, asl fayl faqat yuklab olishda ishlatiladi
function RawThumbnail({ url, name }: { url: string; name: string }) {
  const [src, setSrc] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let revoked: string | null = null
    let cancelled = false
    fetch(`${API_URL}${url}/preview`, { headers: { Authorization: `Bearer ${tokens.access ?? ''}` } })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.blob()
      })
      .then((b) => {
        if (cancelled) return
        revoked = URL.createObjectURL(b)
        setSrc(revoked)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
      if (revoked) URL.revokeObjectURL(revoked)
    }
  }, [url])

  if (failed) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <span className="text-4xl">📷</span>
      </div>
    )
  }
  if (!src) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-surface-border border-t-brand-500 dark:border-[#334155]" />
      </div>
    )
  }
  return (
    <img
      src={src}
      alt={name}
      className="absolute inset-0 h-full w-full object-cover transition-transform group-hover:scale-105"
    />
  )
}

function FilesTab({ order, onChange, isActive }: { order: OrderDetail; onChange: () => void; isActive: boolean }) {
  const t = useT()
  const lang = useLang((s) => s.lang)
  const { can } = useAuth()
  const qc = useQueryClient()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null)
  const [lightboxUrls, setLightboxUrls] = useState<LightboxItem[]>([])
  const [model3d, setModel3d] = useState<{ url: string; name: string } | null>(null)
  const [fileToDelete, setFileToDelete] = useState<{ id: number; name: string } | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [selectedSampleIds, setSelectedSampleIds] = useState<Set<string>>(new Set())
  const [zipping, setZipping] = useState(false)

  const { data: fields = [] } = useQuery({
    queryKey: ['fields', 'order'],
    queryFn: async () =>
      (await api.get<CustomField[]>('/admin/fields', { params: { entity: 'order' } })).data,
  })

  const { data: sampleFiles = [] } = useQuery({
    queryKey: ['sample-files'],
    queryFn: async () => (await api.get<SampleFile[]>('/files/sample')).data,
    enabled: isActive,
    staleTime: 5 * 60 * 1000,
  })

  // Fayllar tabi ochilganda — shu foydalanuvchi uchun "yangi fayl" hisoblagichini nolga tushirish
  useEffect(() => {
    if (!isActive) return
    api
      .post(`/orders/${order.id}/files/read`)
      .then(() => {
        onChange()
        qc.invalidateQueries({ queryKey: ['kanban'] })
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, order.id])

  // Lightbox shortcut'lari
  useEffect(() => {
    if (lightboxIdx === null) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setLightboxIdx(null); return }
      if (e.key === 'ArrowRight') {
        setLightboxIdx((i) => {
          if (i === null) return null
          const next = Math.min(i + 1, lightboxUrls.length - 1)
          loadLightboxImage(next)
          return next
        })
      }
      if (e.key === 'ArrowLeft') {
        setLightboxIdx((i) => {
          if (i === null) return null
          const prev = Math.max(i - 1, 0)
          loadLightboxImage(prev)
          return prev
        })
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [lightboxIdx, lightboxUrls.length])

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
    await api.post(`/orders/${order.id}/files/read`).catch(() => {})
    onChange()
  }

  async function openOrDownload(files: FileLike[], url: string, name: string) {
    try {
      const ext = fileExt(name)
      // 3D model formatlari
      if (MODEL3D_EXTS.includes(ext)) {
        const r = await fetch(`${API_URL}${url}`, {
          headers: { Authorization: `Bearer ${tokens.access ?? ''}` },
        })
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        const blob = await r.blob()
        const objectUrl = URL.createObjectURL(blob)
        setModel3d({ url: objectUrl, name })
        return
      }

      const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg']
  const isImgExt = IMAGE_EXTS.includes(ext) || ['heic', 'heif'].includes(ext)
      const isRawExt = RAW_EXTS.includes(ext)
      const mime = PREVIEW_MIME[ext]

      const fetchUrl = isRawExt ? `${url}/preview` : url
      const r = await fetch(`${API_URL}${fetchUrl}`, {
        headers: { Authorization: `Bearer ${tokens.access ?? ''}` },
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const blob = await r.blob()
      const objectUrl = URL.createObjectURL(new Blob([blob], { type: (isRawExt ? 'image/jpeg' : mime) || blob.type || 'application/octet-stream' }))

      if (isImgExt || isRawExt) {
        // Barcha rasm (va RAW preview) fayllarini to'plab, index topamiz
        const isImgOrRaw = (n: string) => {
          const e = fileExt(n)
          return IMAGE_EXTS.includes(e) || ['heic', 'heif'].includes(e) || RAW_EXTS.includes(e)
        }
        const imgFiles = files.filter((f) => isImgOrRaw(f.name))
        const clickedIdx = imgFiles.findIndex((f) => f.name === name && f.url === url)
        const urls = imgFiles.map((f) => ({
          url: '',
          name: f.name,
          sourceUrl: RAW_EXTS.includes(fileExt(f.name)) ? `${f.url}/preview` : f.url,
        }))
        urls[Math.max(clickedIdx, 0)].url = objectUrl
        setLightboxUrls(urls)
        setLightboxIdx(Math.max(clickedIdx, 0))
      } else if (mime) {
        // PDF/video/audio — yangi tabda ochish
        window.open(objectUrl, '_blank')
      } else {
        // Ko'rib bo'lmaydigan fayl — yuklab ol
        const a = document.createElement('a')
        a.href = objectUrl
        a.download = name
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
      }
    } catch (err) {
      console.error('openOrDownload error:', err)
      toast(lang === 'ru' ? 'Не удалось открыть файл' : 'Faylni ochib bo\'lmadi', 'error')
    }
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

  function toggleFileSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSampleSelect(id: string) {
    setSelectedSampleIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function clearSelection() {
    setSelectedIds(new Set())
    setSelectedSampleIds(new Set())
  }

  async function downloadZip() {
    if (selectedIds.size === 0 && selectedSampleIds.size === 0) return
    setZipping(true)
    try {
      const res = await api.post(
        '/files/zip',
        {
          file_ids: Array.from(selectedIds),
          sample_paths: Array.from(selectedSampleIds).map((id) => id.replace(/^sample:/, '')),
        },
        { responseType: 'blob' },
      )
      const a = document.createElement('a')
      a.href = URL.createObjectURL(res.data as Blob)
      a.download = `${order.number ?? 'fayllar'}.zip`
      a.click()
      URL.revokeObjectURL(a.href)
      clearSelection()
    } catch (e) {
      toast(errText(e, lang), 'error')
    } finally {
      setZipping(false)
    }
  }

  async function remove(fileId: number) {
    try {
      await api.delete(`/files/${fileId}`)
      setFileToDelete(null)
      onChange()
    } catch (e) {
      toast(errText(e, lang), 'error')
    }
  }

  // Lightbox navigatsiya yordamchi funksiyasi — kerakli rasimni lazy yuklaydi
  async function loadLightboxImage(idx: number) {
    const entry = lightboxUrls[idx]
    if (!entry || entry.url) return // allaqachon yuklangan
    const ext = fileExt(entry.name)
    const mime = PREVIEW_MIME[ext]
    const r = await fetch(`${API_URL}${entry.sourceUrl}`, {
      headers: { Authorization: `Bearer ${tokens.access ?? ''}` },
    })
    if (!r.ok) return
    const blob = await r.blob()
    const objectUrl = URL.createObjectURL(new Blob([blob], { type: mime || blob.type }))
    setLightboxUrls((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx], url: objectUrl }
      return next
    })
  }

  const lightbox = lightboxIdx !== null ? lightboxUrls[lightboxIdx] ?? null : null

  return (
    <>
      {/* 3D Model Viewer */}
      {model3d && (
        <Model3DViewer
          url={model3d.url}
          name={model3d.name}
          onClose={() => setModel3d(null)}
          onDownload={() => download(order.files.find(f => f.name === model3d.name)?.url ?? '', model3d.name)}
        />
      )}

      {/* Lightbox */}
      {lightbox && lightboxIdx !== null && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90"
          onClick={() => setLightboxIdx(null)}
        >
          {/* Header */}
          <div className="mb-3 flex w-full max-w-5xl shrink-0 items-center justify-between px-4">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <span className="truncate text-sm text-white/80">{lightbox.name}</span>
              {lightboxUrls.length > 1 && (
                <span className="shrink-0 rounded bg-white/10 px-2 py-0.5 text-xs text-white/60">
                  {lightboxIdx + 1} / {lightboxUrls.length}
                </span>
              )}
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                className="rounded-md bg-white/10 px-3 py-1 text-xs text-white hover:bg-white/20"
                onClick={(e) => { e.stopPropagation(); download(order.files.find(f => f.name === lightbox.name)?.url ?? '', lightbox.name) }}
              >
                ⬇ Yuklab olish
              </button>
              <button
                className="rounded-md bg-white/10 px-3 py-1 text-xs text-white hover:bg-white/20"
                onClick={() => setLightboxIdx(null)}
              >
                ✕ Yopish
              </button>
            </div>
          </div>

          {/* Image area with arrows */}
          <div className="relative flex w-full flex-1 items-center justify-center" onClick={(e) => e.stopPropagation()}>
            {/* Chap strelka */}
            {lightboxUrls.length > 1 && lightboxIdx > 0 && (
              <button
                className="absolute left-4 z-10 flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-2xl text-white backdrop-blur-sm hover:bg-white/25 transition-colors"
                onClick={() => { const ni = lightboxIdx - 1; setLightboxIdx(ni); loadLightboxImage(ni) }}
              >
                ‹
              </button>
            )}

            {/* Rasm */}
            {lightbox.url ? (
              <img
                key={lightboxIdx}
                src={lightbox.url}
                alt={lightbox.name}
                className="max-h-[80vh] max-w-[85vw] rounded-lg object-contain shadow-2xl"
              />
            ) : (
              <div className="flex h-40 w-40 items-center justify-center">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-white/20 border-t-white" />
              </div>
            )}

            {/* O'ng strelka */}
            {lightboxUrls.length > 1 && lightboxIdx < lightboxUrls.length - 1 && (
              <button
                className="absolute right-4 z-10 flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-2xl text-white backdrop-blur-sm hover:bg-white/25 transition-colors"
                onClick={() => { const ni = lightboxIdx + 1; setLightboxIdx(ni); loadLightboxImage(ni) }}
              >
                ›
              </button>
            )}
          </div>

          {/* Pastki dot navigatsiya */}
          {lightboxUrls.length > 1 && (
            <div className="mt-4 flex shrink-0 gap-1.5">
              {lightboxUrls.map((_, i) => (
                <button
                  key={i}
                  className={`h-1.5 rounded-full transition-all ${
                    i === lightboxIdx ? 'w-5 bg-white' : 'w-1.5 bg-white/30 hover:bg-white/60'
                  }`}
                  onClick={(e) => { e.stopPropagation(); setLightboxIdx(i); loadLightboxImage(i) }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Confirm File Delete Modal */}
      <Confirm
        open={fileToDelete !== null}
        text={fileToDelete ? fileToDelete.name : ''}
        onCancel={() => setFileToDelete(null)}
        onOk={() => fileToDelete && remove(fileToDelete.id)}
      />

      <div className="card p-4 space-y-6">
        {can('file.upload') && (
          <div>
            <input ref={input} type="file" multiple className="hidden" onChange={(e) => upload(e.target.files)} />
            <button className="btn-ghost" onClick={() => input.current?.click()} disabled={busy}>
              {busy ? t('loading') : `📎 ${t('attach')}`}
            </button>
          </div>
        )}

        {(selectedIds.size > 0 || selectedSampleIds.size > 0) && (
          <div className="sticky top-0 z-20 flex items-center justify-between gap-3 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 dark:border-[#2f3d55] dark:bg-[#16233a]">
            <span className="text-sm font-medium text-ink dark:text-[#e6e9ee]">
              {selectedIds.size + selectedSampleIds.size} ta fayl tanlandi
            </span>
            <div className="flex items-center gap-2">
              <button className="btn-ghost px-3 py-1 text-xs" onClick={clearSelection}>
                Bekor qilish
              </button>
              <button className="btn-primary px-3 py-1 text-xs" onClick={downloadZip} disabled={zipping}>
                {zipping ? 'Tayyorlanmoqda…' : '⬇ ZIP yuklab olish'}
              </button>
            </div>
          </div>
        )}

        {order.files.length === 0 ? (
          <Empty />
        ) : (
          (() => {
            // Custom fields file mapping
            const fileToFieldMap = new Map<number, string>()
            const fileFieldDefs = fields.filter((f) => f.type === 'file')

            fileFieldDefs.forEach((f) => {
              const label = lang === 'ru' ? f.label_ru : f.label_uz
              const val = order.custom_fields?.[f.code]
              if (val != null) {
                const ids = Array.isArray(val) ? val : [val]
                ids.forEach((id) => {
                  if (typeof id === 'number') {
                    fileToFieldMap.set(id, label)
                  }
                })
              }
            })

            // Group files
            const groupsMap = new Map<string, typeof order.files>()
            order.files.forEach((f) => {
              const category = fileToFieldMap.get(f.id) || (lang === 'ru' ? 'Общие файлы' : 'Umumiy fayllar')
              if (!groupsMap.has(category)) groupsMap.set(category, [])
              groupsMap.get(category)!.push(f)
            })

            const groups = Array.from(groupsMap.entries())

            return (
              <div className="space-y-6">
                {groups.map(([categoryName, groupFiles]) => (
                  <div key={categoryName} className="space-y-2">
                    <div className="flex items-center gap-2 border-b border-surface-border pb-1.5 dark:border-[#2f3745]">
                      <span className="text-sm font-semibold text-ink dark:text-[#e6e9ee]">{categoryName}</span>
                      <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-medium text-ink-faint dark:bg-[#222836]">
                        {groupFiles.length}
                      </span>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {groupFiles.map((f) => {
                        const ext = fileExt(f.name)
                        const isImg = f.is_image || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext)
                        const canPreview = !!PREVIEW_MIME[ext]
                        return (
                          <div
                            key={f.id}
                            className="group relative overflow-hidden rounded-xl border border-surface-border dark:border-[#2f3745] transition-shadow hover:shadow-md"
                          >
                            <label
                              className="absolute left-2 top-2 z-20 flex h-5 w-5 cursor-pointer items-center justify-center rounded border border-white/50 bg-black/40 backdrop-blur-sm"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <input
                                type="checkbox"
                                className="h-3.5 w-3.5 accent-brand-500"
                                checked={selectedIds.has(f.id)}
                                onChange={() => toggleFileSelect(f.id)}
                              />
                            </label>

                            {/* Rasm thumbnail */}
                            {isImg ? (
                              <button
                                className="relative block w-full overflow-hidden bg-surface-muted dark:bg-[#1e2533]"
                                style={{ paddingTop: '56.25%' }}
                                onClick={() => openOrDownload(order.files, f.url, f.name)}
                                title="Ko'rish"
                              >
                                <img
                                  src={`${API_URL}${f.url}`}
                                  alt={f.name}
                                  className="absolute inset-0 h-full w-full object-cover transition-transform group-hover:scale-105"
                                  loading="lazy"
                                  onError={(e) => {
                                    const img = e.currentTarget
                                    if (!img.dataset.tried) {
                                      img.dataset.tried = '1'
                                      fetch(`${API_URL}${f.url}`, {
                                        headers: { Authorization: `Bearer ${tokens.access}` },
                                      })
                                        .then((r) => r.blob())
                                        .then((b) => { img.src = URL.createObjectURL(b) })
                                        .catch(() => {})
                                    }
                                  }}
                                />
                                <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/20">
                                  <span className="rounded-full bg-black/50 px-3 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
                                    🔍 Ko'rish
                                  </span>
                                </div>
                              </button>
                            ) : MODEL3D_EXTS.includes(ext) ? (
                              <button
                                className="relative block w-full overflow-hidden bg-gradient-to-b from-[#0f172a] to-[#1e293b]"
                                style={{ paddingTop: '56.25%' }}
                                onClick={() => openOrDownload(order.files, f.url, f.name)}
                                title="3D modelni ko'rish"
                              >
                                <Model3DThumbnail url={f.url} name={f.name} className="absolute inset-0 h-full w-full" />
                                <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/20">
                                  <span className="rounded-full bg-black/50 px-3 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
                                    🔍 Ko'rish
                                  </span>
                                </div>
                                <span className="absolute left-2 bottom-2 rounded bg-[#1e3a5f] px-2 py-0.5 text-[10px] font-bold text-[#7dd3fc]">
                                  {ext.toUpperCase()}
                                </span>
                                <span className="absolute right-2 top-2 rounded bg-brand-500 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">
                                  3D
                                </span>
                              </button>
                            ) : RAW_EXTS.includes(ext) ? (
                              <button
                                className="relative block w-full overflow-hidden bg-surface-muted dark:bg-[#1e2533]"
                                style={{ paddingTop: '56.25%' }}
                                onClick={() => openOrDownload(order.files, f.url, f.name)}
                                title="Ko'rish"
                              >
                                <RawThumbnail url={f.url} name={f.name} />
                                <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/20">
                                  <span className="rounded-full bg-black/50 px-3 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
                                    🔍 Ko'rish
                                  </span>
                                </div>
                                <span className="absolute right-2 top-2 rounded bg-black/50 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                                  {ext.toUpperCase()}
                                </span>
                              </button>
                            ) : (
                              <button
                                className="flex w-full items-center justify-center bg-surface-muted py-6 dark:bg-[#1e2533]"
                                onClick={() => openOrDownload(order.files, f.url, f.name)}
                                title={canPreview ? 'Ko\'rish' : 'Yuklab olish'}
                              >
                                <span className="text-4xl">{fileIcon(f.name, false)}</span>
                                {canPreview && (
                                  <span className="absolute right-2 top-2 rounded bg-brand-500 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">
                                    preview
                                  </span>
                                )}
                              </button>
                            )}

                            {/* Footer */}
                            <div className="flex items-center gap-2 px-2.5 py-2">
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-xs font-medium" title={f.name}>{f.name}</div>
                                <div className="text-[10px] text-ink-faint">
                                  {fileSize(f.size)} · {fromNow(f.created_at)}
                                </div>
                              </div>
                              <button
                                className="shrink-0 rounded p-1 text-ink-faint hover:bg-surface-muted hover:text-ink dark:hover:bg-[#2a3140] dark:hover:text-[#e6e9ee]"
                                title="Yuklab olish"
                                onClick={() => download(f.url, f.name)}
                              >
                                ⬇
                              </button>
                              {can('file.delete') && (
                                <button
                                  onClick={() => setFileToDelete({ id: f.id, name: f.name })}
                                  className="shrink-0 rounded p-1 text-ink-faint hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-900/20"
                                  title="O'chirish"
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}

                {sampleFiles.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 border-b border-surface-border pb-1.5 dark:border-[#2f3745]">
                      <span className="text-sm font-semibold text-ink dark:text-[#e6e9ee]">Namuna fayllari</span>
                      <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-medium text-ink-faint dark:bg-[#222836]">
                        {sampleFiles.length}
                      </span>
                    </div>

                    {(() => {
                      const sampleGroups = new Map<string, SampleFile[]>()
                      sampleFiles.forEach((f) => {
                        const key = f.group && f.group !== '.' ? f.group : 'Namuna'
                        if (!sampleGroups.has(key)) sampleGroups.set(key, [])
                        sampleGroups.get(key)!.push(f)
                      })

                      return Array.from(sampleGroups.entries()).map(([categoryName, groupFiles]) => (
                        <div key={categoryName} className="space-y-2">
                          {categoryName !== 'Namuna' && (
                            <div className="text-xs text-ink-faint">{categoryName}</div>
                          )}
                          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {groupFiles.map((f) => {
                              const ext = fileExt(f.name)
                              const isImg = f.is_image || IMAGE_EXTS.includes(ext)
                              const canPreview = !!PREVIEW_MIME[ext] || isImg
                              return (
                                <div
                                  key={f.id}
                                  className="group relative overflow-hidden rounded-xl border border-surface-border dark:border-[#2f3745] transition-shadow hover:shadow-md"
                                >
                                  <label
                                    className="absolute left-2 top-2 z-20 flex h-5 w-5 cursor-pointer items-center justify-center rounded border border-white/50 bg-black/40 backdrop-blur-sm"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <input
                                      type="checkbox"
                                      className="h-3.5 w-3.5 accent-brand-500"
                                      checked={selectedSampleIds.has(f.id)}
                                      onChange={() => toggleSampleSelect(f.id)}
                                    />
                                  </label>

                                  {isImg ? (
                                    <button
                                      className="relative block w-full overflow-hidden bg-surface-muted dark:bg-[#1e2533]"
                                      style={{ paddingTop: '56.25%' }}
                                      onClick={() => openOrDownload(sampleFiles, f.url, f.name)}
                                      title="Ko'rish"
                                    >
                                      <img
                                        src={`${API_URL}${f.url}`}
                                        alt={f.name}
                                        className="absolute inset-0 h-full w-full object-cover transition-transform group-hover:scale-105"
                                        loading="lazy"
                                      />
                                      <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/20">
                                        <span className="rounded-full bg-black/50 px-3 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
                                          🔍 Ko'rish
                                        </span>
                                      </div>
                                    </button>
                                  ) : MODEL3D_EXTS.includes(ext) ? (
                                    <button
                                      className="relative block w-full overflow-hidden bg-gradient-to-b from-[#0f172a] to-[#1e293b]"
                                      style={{ paddingTop: '56.25%' }}
                                      onClick={() => openOrDownload(sampleFiles, f.url, f.name)}
                                      title="3D modelni ko'rish"
                                    >
                                      <Model3DThumbnail url={f.url} name={f.name} className="absolute inset-0 h-full w-full" />
                                      <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/20">
                                        <span className="rounded-full bg-black/50 px-3 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
                                          🔍 Ko'rish
                                        </span>
                                      </div>
                                      <span className="absolute left-2 bottom-2 rounded bg-[#1e3a5f] px-2 py-0.5 text-[10px] font-bold text-[#7dd3fc]">
                                        {ext.toUpperCase()}
                                      </span>
                                      <span className="absolute right-2 top-2 rounded bg-brand-500 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">
                                        3D
                                      </span>
                                    </button>
                                  ) : (
                                    <button
                                      className="flex w-full items-center justify-center bg-surface-muted py-6 dark:bg-[#1e2533]"
                                      onClick={() => openOrDownload(sampleFiles, f.url, f.name)}
                                      title={canPreview ? 'Ko\'rish' : 'Yuklab olish'}
                                    >
                                      <span className="text-4xl">{fileIcon(f.name, false)}</span>
                                      {canPreview && (
                                        <span className="absolute right-2 top-2 rounded bg-brand-500 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">
                                          preview
                                        </span>
                                      )}
                                    </button>
                                  )}

                                  <div className="flex items-center gap-2 px-2.5 py-2">
                                    <div className="min-w-0 flex-1">
                                      <div className="truncate text-xs font-medium" title={f.name}>{f.name}</div>
                                      <div className="text-[10px] text-ink-faint">
                                        {fileSize(f.size)} · {fromNow(f.created_at)}
                                      </div>
                                    </div>
                                    <button
                                      className="shrink-0 rounded p-1 text-ink-faint hover:bg-surface-muted hover:text-ink dark:hover:bg-[#2a3140] dark:hover:text-[#e6e9ee]"
                                      title="Yuklab olish"
                                      onClick={() => download(f.url, f.name)}
                                    >
                                      ⬇
                                    </button>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      ))
                    })()}
                  </div>
                )}
              </div>
            )
          })()
        )}
      </div>
    </>
  )
}

/* ---------------- Marshrut tarixi ---------------- */

function HistoryTab({ orderId }: { orderId: number }) {
  const nm = useNm()
  const t = useT()
  const lang = useLang((s) => s.lang)
  const { data = [], isLoading } = useQuery({
    queryKey: ['order-history', orderId],
    queryFn: async () => (await api.get<StageHistory[]>(`/orders/${orderId}/history`)).data,
  })

  const summary = useMemo(() => {
    const map = new Map<
      string,
      { stage_id: number; name_ru: string; name_uz: string; who: string; seconds: number; count: number }
    >()
    for (const h of data) {
      if (h.duration_sec == null) continue
      const who = h.responsible ? h.responsible.full_name : '—'
      const key = `${h.stage_id}:${who}`
      if (!map.has(key)) {
        map.set(key, {
          stage_id: h.stage_id, name_ru: h.stage_name_ru, name_uz: h.stage_name_uz,
          who, seconds: 0, count: 0,
        })
      }
      const e = map.get(key)!
      e.seconds += h.duration_sec
      e.count += 1
    }
    return [...map.values()].sort((a, b) => b.seconds - a.seconds)
  }, [data])

  if (isLoading) return <Spinner />
  if (!data.length) return <Empty />

  return (
    <div className="space-y-3">
      {summary.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="table-wide w-full text-sm">
            <thead className="border-b border-surface-border text-left text-xs text-ink-faint dark:border-[#2a3140]">
              <tr>
                <th className="px-3 py-2 font-medium">{lang === 'ru' ? 'Этап' : 'Bosqich'}</th>
                <th className="px-3 py-2 font-medium">{lang === 'ru' ? 'Кто' : 'Kim'}</th>
                <th className="px-3 py-2 font-medium">{lang === 'ru' ? 'Заходов' : 'Marta'}</th>
                <th className="px-3 py-2 font-medium">{lang === 'ru' ? 'Время' : 'Vaqt'}</th>
              </tr>
            </thead>
            <tbody>
              {summary.map((s) => (
                <tr
                  key={`${s.stage_id}:${s.who}`}
                  className="border-t border-surface-border first:border-0 dark:border-[#2a3140]"
                >
                  <td className="px-3 py-1.5">{nm({ name_ru: s.name_ru, name_uz: s.name_uz }, 'name')}</td>
                  <td className="px-3 py-1.5">{s.who}</td>
                  <td className="px-3 py-1.5">{s.count}</td>
                  <td className="px-3 py-1.5 font-medium">{duration(s.seconds)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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

      <ControlHistoryCard orderId={orderId} />
    </div>
  )
}

function ControlHistoryCard({ orderId }: { orderId: number }) {
  const nm = useNm()
  const t = useT()
  const lang = useLang((s) => s.lang)
  const { data = [] } = useQuery({
    queryKey: ['order-controls', orderId],
    queryFn: async () => (await api.get<OrderControlEntry[]>(`/orders/${orderId}/controls`)).data,
  })

  if (!data.length) return null

  const statusColor = { pending: '#22c55e', approved: '#0ea5e9', rejected: '#e11d48' } as const
  const statusLabel = { pending: t('control_pending'), approved: t('control_approve'), rejected: t('control_reject') } as const

  return (
    <div className="card p-4">
      <div className="mb-3 text-sm font-semibold">{t('control_history')}</div>
      <div className="space-y-3">
        {data.map((c) => (
          <div key={c.id} className="rounded-lg border border-surface-border p-2.5 text-xs dark:border-[#2a3140]">
            <div className="flex flex-wrap items-center gap-2">
              <Badge color={statusColor[c.status]}>{statusLabel[c.status]}</Badge>
              <span className="font-medium">
                {nm({ name_ru: c.from_stage_name_ru, name_uz: c.from_stage_name_uz }, 'name')}
                {' → '}
                {nm({ name_ru: c.target_stage_name_ru, name_uz: c.target_stage_name_uz }, 'name')}
              </span>
            </div>
            <div className="mt-1 text-ink-soft">
              {lang === 'ru' ? 'Отправил' : 'Yubordi'}: {c.requested_by?.full_name ?? '—'}
              {' · '}
              {lang === 'ru' ? 'Контролёр' : 'Kontrolyor'}: {c.controller?.full_name ?? '—'}
              {' · '}
              {dt(c.requested_at)}
            </div>
            {c.comment && (
              <div className="mt-1 rounded-md bg-surface-muted px-2 py-1 dark:bg-[#242b38]">{c.comment}</div>
            )}
            {c.status !== 'pending' && (
              <div className="mt-1 text-ink-faint">
                {c.resolved_at && dt(c.resolved_at)}
                {c.resolved_comment && ` — ${c.resolved_comment}`}
              </div>
            )}
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
