import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, errText } from '@/lib/api'
import { useLang, useT } from '@/i18n'
import { Field, Modal } from '@/components/ui'
import { CustomFieldInput } from '@/components/FieldInput'
import type {
  CustomField,
  Doctor,
  OrderDetail,
  Page,
  Patient,
  RequirementError,
  ServiceItem,
} from '@/lib/types'

export default function OrderForm({
  order,
  onClose,
  onDone,
}: {
  order?: OrderDetail
  onClose: () => void
  onDone: (o: OrderDetail) => void
}) {
  const t = useT()
  const lang = useLang((s) => s.lang)
  const edit = Boolean(order)

  const [title, setTitle] = useState(order?.title ?? '')
  const [patientId, setPatientId] = useState<number | null>(order?.patient?.id ?? null)
  const [doctorId, setDoctorId] = useState<number | null>(order?.doctor?.id ?? null)
  const [serviceIds, setServiceIds] = useState<number[]>(order?.services.map((s) => s.id) ?? [])
  const [deadline, setDeadline] = useState(order?.deadline?.slice(0, 16) ?? '')
  const [priority, setPriority] = useState(order?.priority ?? 500)
  const [description, setDescription] = useState(order?.description ?? '')
  const [cf, setCf] = useState<Record<string, unknown>>(order?.custom_fields ?? {})
  const [error, setError] = useState<string | null>(null)
  const [missing, setMissing] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)

  const { data: patients } = useQuery({
    queryKey: ['patients-select'],
    queryFn: async () => (await api.get<Page<Patient>>('/patients', { params: { size: 200 } })).data,
  })
  const { data: doctors } = useQuery({
    queryKey: ['doctors-select'],
    queryFn: async () => (await api.get<Page<Doctor>>('/doctors', { params: { size: 200 } })).data,
  })
  const { data: services } = useQuery({
    queryKey: ['services-select'],
    queryFn: async () => (await api.get<ServiceItem[]>('/services')).data,
  })
  const { data: fields } = useQuery({
    queryKey: ['fields', 'order'],
    queryFn: async () =>
      (await api.get<CustomField[]>('/admin/fields', { params: { entity: 'order' } })).data,
  })

  async function submit() {
    setBusy(true)
    setError(null)
    setMissing(new Set())
    const body = {
      title: title.trim(),
      patient_id: patientId,
      doctor_id: doctorId,
      service_ids: serviceIds,
      deadline: deadline || null,
      priority,
      description: description.trim() || null,
      custom_fields: cf,
    }
    try {
      const { data } = edit
        ? await api.patch<OrderDetail>(`/orders/${order!.id}`, body)
        : await api.post<OrderDetail>('/orders', body)
      onDone(data)
      onClose()
    } catch (e) {
      const detail = (e as any)?.response?.data?.detail
      if (detail?.error === 'required_fields') {
        const r = detail as RequirementError
        setMissing(new Set(r.fields.map((f) => f.field_ref)))
        setError(t('fill_required'))
      } else {
        setError(errText(e, lang))
      }
    } finally {
      setBusy(false)
    }
  }

  const activeFields = (fields ?? []).filter((f) => f.is_active)
  const err = (ref: string) => (missing.has(ref) ? t('required') : null)

  return (
    <Modal
      open
      onClose={onClose}
      wide
      title={edit ? `${order!.number} — ${t('edit')}` : t('new_order')}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose} disabled={busy}>
            {t('cancel')}
          </button>
          <button className="btn-primary" onClick={submit} disabled={busy || !title.trim()}>
            {busy ? t('loading') : edit ? t('save') : t('create')}
          </button>
        </>
      }
    >
      <div className="grid gap-x-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label={t('order_title')} required error={err('sys:title')}>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          </Field>
        </div>

        <Field label={t('patient')} error={err('sys:patient_id')}>
          <select
            className="input"
            value={patientId ?? ''}
            onChange={(e) => setPatientId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">—</option>
            {(patients?.items ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
                {p.phone ? ` · ${p.phone}` : ''}
              </option>
            ))}
          </select>
        </Field>

        <Field label={t('doctor')} error={err('sys:doctor_id')}>
          <select
            className="input"
            value={doctorId ?? ''}
            onChange={(e) => setDoctorId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">—</option>
            {(doctors?.items ?? []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.full_name}
                {d.clinic ? ` · ${d.clinic}` : ''}
              </option>
            ))}
          </select>
        </Field>

        <div className="sm:col-span-2">
          <Field label={t('services')} error={err('sys:services')}>
            <div className="flex flex-wrap gap-1.5">
              {(services ?? []).map((s) => {
                const on = serviceIds.includes(s.id)
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() =>
                      setServiceIds((prev) =>
                        on ? prev.filter((x) => x !== s.id) : [...prev, s.id],
                      )
                    }
                    className={
                      on
                        ? 'chip border border-brand-300 bg-brand-100 text-brand-700'
                        : 'chip border border-surface-border bg-white text-ink-soft dark:border-[#2f3745] dark:bg-[#151a23]'
                    }
                  >
                    {lang === 'ru' ? s.name_ru : s.name_uz}
                  </button>
                )
              })}
            </div>
          </Field>
        </div>

        <Field label={t('deadline')} error={err('sys:deadline')}>
          <input
            type="datetime-local"
            className="input"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
          />
        </Field>

        <Field
          label={t('priority')}
          hint={lang === 'ru' ? 'Меньше — выше в колонке' : 'Kam — ustunda tepada'}
        >
          <input
            type="number"
            className="input"
            value={priority}
            onChange={(e) => setPriority(Number(e.target.value))}
          />
        </Field>

        <div className="sm:col-span-2">
          <Field label={t('description')} error={err('sys:description')}>
            <textarea
              className="input min-h-[70px]"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
        </div>

        {activeFields.map((f) => (
          <div key={f.id} className={f.type === 'text' ? 'sm:col-span-2' : ''}>
            <Field
              label={lang === 'ru' ? f.label_ru : f.label_uz}
              required={f.required_on_create}
              hint={lang === 'ru' ? f.hint_ru : f.hint_uz}
              error={err(`cf:${f.id}`)}
            >
              <CustomFieldInput
                field={f}
                value={cf[f.code]}
                onChange={(v) => setCf((p) => ({ ...p, [f.code]: v }))}
              />
            </Field>
          </div>
        ))}
      </div>

      {error && (
        <div className="whitespace-pre-line rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {error}
        </div>
      )}
    </Modal>
  )
}
