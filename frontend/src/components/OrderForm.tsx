import { Fragment, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { api, errText } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useLang, useT } from '@/i18n'
import { Field, Modal, NumberInput, SearchSelect } from '@/components/ui'
import { CustomFieldInput, FileFieldInput } from '@/components/FieldInput'
import ToothChart from '@/components/ToothChart'
import { useToothLabels } from '@/lib/useToothLabels'
import { useToothChartScale } from '@/lib/useToothChartScale'
import { fromLocalInput, toLocalInput } from '@/lib/format'
import { PatientForm } from '@/pages/Patients'
import { DoctorForm } from '@/pages/Doctors'
import type {
  Doctor,
  LayoutSection,
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
  const { can } = useAuth()
  const qc = useQueryClient()
  const edit = Boolean(order)
  const toothLabels = useToothLabels()
  const toothChartScale = useToothChartScale()

  const [title, setTitle] = useState(order?.title ?? '')
  const [teeth, setTeeth] = useState<number[]>(order?.teeth ?? [])
  const [photoFileId, setPhotoFileId] = useState<number | null>(order?.photo?.id ?? null)
  const [patientId, setPatientId] = useState<number | null>(order?.patient?.id ?? null)
  const [doctorId, setDoctorId] = useState<number | null>(order?.doctor?.id ?? null)
  const [creatingPatient, setCreatingPatient] = useState(false)
  const [creatingDoctor, setCreatingDoctor] = useState(false)
  const [pSearch, setPSearch] = useState('')
  const [dSearch, setDSearch] = useState('')
  const [serviceIds, setServiceIds] = useState<number[]>(order?.services.map((s) => s.id) ?? [])
  const [deadline, setDeadline] = useState(toLocalInput(order?.deadline))
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
  const { data: layout = [] } = useQuery({
    queryKey: ['order-layout'],
    queryFn: async () => (await api.get<LayoutSection[]>('/order-layout')).data,
  })

  async function submit() {
    setBusy(true)
    setError(null)
    setMissing(new Set())
    const body = {
      title: title.trim(),
      photo_file_id: photoFileId,
      patient_id: patientId,
      doctor_id: doctorId,
      service_ids: serviceIds,
      deadline: fromLocalInput(deadline),
      priority,
      description: description.trim() || null,
      teeth,
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

  const err = (ref: string) => (missing.has(ref) ? t('required') : null)

  const patList = (patients?.items ?? []).filter((p) => {
    const q = pSearch.toLowerCase()
    return !q || p.full_name.toLowerCase().includes(q) || (p.phone ?? '').includes(q)
  })
  const docList = (doctors?.items ?? []).filter((d) => {
    const q = dSearch.toLowerCase()
    return !q || d.full_name.toLowerCase().includes(q) || (d.clinic ?? '').toLowerCase().includes(q)
  })

  return (
    <>
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
          <button className="btn-primary" onClick={submit} disabled={busy}>
            {busy ? t('loading') : edit ? t('save') : t('create')}
          </button>
        </>
      }
    >
      <div className="grid gap-x-4 sm:grid-cols-2">
        {(() => {
          const SYSTEM_RENDERERS: Record<string, () => React.ReactNode> = {
            'sys:title': () => (
              <div className="sm:col-span-2" key="sys:title">
                <Field label={t('order_title')} error={err('sys:title')}>
                  <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
                </Field>
              </div>
            ),
            'sys:photo_file_id': () => (
              <div className="sm:col-span-2" key="sys:photo_file_id">
                <Field label={lang === 'ru' ? 'Фото проекта' : 'Proyekt rasmi'}>
                  <FileFieldInput
                    value={photoFileId}
                    onChange={(v) => setPhotoFileId(Array.isArray(v) ? (v[0] as number) ?? null : (v as number | null))}
                    orderId={order?.id}
                    lang={lang}
                    multiple={false}
                  />
                </Field>
              </div>
            ),
            'sys:patient_id': () => (
              <Field key="sys:patient_id" label={t('patient')} error={err('sys:patient_id')}>
                <div className="flex gap-2">
                  <div className="min-w-0 flex-1">
                    <SearchSelect
                      items={patList.map((p) => ({ id: p.id, label: p.full_name, sub: p.phone ? `📞 ${p.phone}` : undefined }))}
                      value={patientId}
                      onChange={setPatientId}
                      search={pSearch}
                      onSearchChange={setPSearch}
                      placeholder={t('search')}
                      clearLabel={t('none')}
                    />
                  </div>
                  {can('patient.manage') && (
                    <button
                      type="button"
                      className="btn-ghost shrink-0 px-2.5"
                      title={t('add')}
                      onClick={() => setCreatingPatient(true)}
                    >
                      +
                    </button>
                  )}
                </div>
              </Field>
            ),
            'sys:doctor_id': () => (
              <Field key="sys:doctor_id" label={t('doctor')} error={err('sys:doctor_id')}>
                <div className="flex gap-2">
                  <div className="min-w-0 flex-1">
                    <SearchSelect
                      items={docList.map((d) => ({ id: d.id, label: d.full_name, sub: d.clinic ? `🏥 ${d.clinic}` : undefined }))}
                      value={doctorId}
                      onChange={setDoctorId}
                      search={dSearch}
                      onSearchChange={setDSearch}
                      placeholder={t('search')}
                      clearLabel={t('none')}
                    />
                  </div>
                  {can('doctor.manage') && (
                    <button
                      type="button"
                      className="btn-ghost shrink-0 px-2.5"
                      title={t('add')}
                      onClick={() => setCreatingDoctor(true)}
                    >
                      +
                    </button>
                  )}
                </div>
              </Field>
            ),
            'sys:services': () => (
              <div className="sm:col-span-2" key="sys:services">
                <Field label={t('services')} error={err('sys:services')}>
                  <ServiceMultiSelect
                    services={services ?? []}
                    selectedIds={serviceIds}
                    onChange={setServiceIds}
                    lang={lang}
                    t={t}
                  />
                </Field>
              </div>
            ),
            'sys:teeth': () => (
              <div className="sm:col-span-2" key="sys:teeth">
                <Field label={t('teeth')}>
                  <ToothChart value={teeth} onChange={setTeeth} labels={toothLabels} scalePercent={toothChartScale} />
                </Field>
              </div>
            ),
            'sys:deadline': () => (
              <Field key="sys:deadline" label={t('deadline')} error={err('sys:deadline')}>
                <input
                  type="datetime-local"
                  className="input"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                />
              </Field>
            ),
            'sys:priority': () => (
              <Field
                key="sys:priority"
                label={t('priority')}
                hint={lang === 'ru' ? 'Меньше — выше в колонке' : 'Kam — ustunda tepada'}
              >
                <NumberInput
                  className="input"
                  value={priority}
                  onChange={(v) => setPriority(v ?? 500)}
                />
              </Field>
            ),
            'sys:description': () => (
              <div className="sm:col-span-2" key="sys:description">
                <Field label={t('description')} error={err('sys:description')}>
                  <textarea
                    className="input min-h-[70px]"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </Field>
              </div>
            ),
          }

          return layout.map((section, si) => (
            <Fragment key={section.code}>
              {layout.length > 1 && (
                <div
                  className={clsx(
                    'sm:col-span-2 text-xs font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-400',
                    si === 0 ? 'mb-1 mt-1' : 'mb-1 mt-6 border-t border-surface-border pt-4 dark:border-[#2a3140]',
                  )}
                >
                  {lang === 'ru' ? section.name_ru : section.name_uz}
                </div>
              )}
              {section.fields.filter((lf) => !lf.is_hidden).map((lf) =>
                lf.kind === 'system' ? (
                  SYSTEM_RENDERERS[lf.field_ref]?.() ?? null
                ) : lf.custom_field ? (
                  <div key={lf.field_ref} className={lf.custom_field.type === 'text' ? 'sm:col-span-2' : ''}>
                    <Field
                      label={lang === 'ru' ? lf.custom_field.label_ru : lf.custom_field.label_uz}
                      required={lf.custom_field.required_on_create}
                      hint={lang === 'ru' ? lf.custom_field.hint_ru : lf.custom_field.hint_uz}
                      error={err(`cf:${lf.custom_field.id}`)}
                    >
                      <CustomFieldInput
                        field={lf.custom_field}
                        value={cf[lf.custom_field.code]}
                        onChange={(v) => setCf((p) => ({ ...p, [lf.custom_field!.code]: v }))}
                        orderId={order?.id}
                      />
                    </Field>
                  </div>
                ) : null,
              )}
            </Fragment>
          ))
        })()}
      </div>

      {error && (
        <div className="whitespace-pre-line rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {error}
        </div>
      )}
    </Modal>

    {creatingPatient && (
      <PatientForm
        onClose={() => setCreatingPatient(false)}
        onDone={(p) => {
          setPatientId(p.id)
          qc.invalidateQueries({ queryKey: ['patients-select'] })
        }}
      />
    )}

    {creatingDoctor && (
      <DoctorForm
        onClose={() => setCreatingDoctor(false)}
        onDone={(d) => {
          setDoctorId(d.id)
          qc.invalidateQueries({ queryKey: ['doctors-select'] })
        }}
      />
    )}
    </>
  )
}

function ServiceMultiSelect({
  services,
  selectedIds,
  onChange,
  lang,
  t,
}: {
  services: ServiceItem[]
  selectedIds: number[]
  onChange: (ids: number[]) => void
  lang: string
  t: (k: string) => string
}) {
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)

  const selectedServices = services.filter((s) => selectedIds.includes(s.id))
  const filteredServices = services.filter((s) => {
    const name = lang === 'ru' ? s.name_ru : s.name_uz
    return name.toLowerCase().includes(search.toLowerCase()) || (s.code && s.code.toLowerCase().includes(search.toLowerCase()))
  })

  function toggle(id: number) {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((x) => x !== id))
    } else {
      onChange([...selectedIds, id])
    }
  }

  function clearAll() {
    onChange([])
  }

  function selectAllFiltered() {
    const filteredIds = filteredServices.map((s) => s.id)
    const newIds = Array.from(new Set([...selectedIds, ...filteredIds]))
    onChange(newIds)
  }

  return (
    <div className="space-y-2">
      {/* Selected tags bar */}
      {selectedServices.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50/50 p-2 dark:border-brand-900/30 dark:bg-brand-900/10">
          <div className="mr-1 flex items-center gap-1 text-xs font-semibold text-brand-700 dark:text-brand-300">
            <span>✓ {t('selected') ?? 'Tanlanganlar'}:</span>
            <span className="rounded-full bg-brand-500 px-1.5 py-0.2 text-[10px] font-bold text-white">
              {selectedServices.length}
            </span>
          </div>
          {selectedServices.map((s) => {
            const name = lang === 'ru' ? s.name_ru : s.name_uz
            return (
              <span
                key={s.id}
                className="inline-flex items-center gap-1.5 rounded-md bg-white px-2 py-1 text-xs font-medium text-ink shadow-sm border border-brand-200 dark:border-[#2f3745] dark:bg-[#1a1f2a] dark:text-[#e6e9ee]"
              >
                {name}
                <button
                  type="button"
                  onClick={() => toggle(s.id)}
                  className="rounded p-0.5 text-ink-faint hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-900/30"
                  title="O'chirish"
                >
                  ✕
                </button>
              </span>
            )
          })}
          <button
            type="button"
            onClick={clearAll}
            className="ml-auto text-xs text-rose-600 hover:underline dark:text-rose-400"
          >
            {t('clear_all') ?? 'Barchasini tozalash'}
          </button>
        </div>
      )}

      {/* Input / Dropdown trigger */}
      <div className="relative">
        <div className="relative flex items-center">
          <input
            type="text"
            className="input pr-8"
            placeholder={lang === 'ru' ? 'Поиск и выбор услуг...' : 'Xizmatlarni qidirish va tanlash...'}
            value={search}
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              setSearch(e.target.value)
              setOpen(true)
            }}
          />
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="absolute right-2.5 text-xs text-ink-faint hover:text-ink dark:hover:text-[#e6e9ee]"
          >
            {open ? '▲' : '▼'}
          </button>
        </div>

        {open && (
          <>
            <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
            <div className="absolute left-0 right-0 z-30 mt-1 max-h-60 overflow-y-auto rounded-xl border border-surface-border bg-white p-2 shadow-pop dark:border-[#2f3745] dark:bg-[#1e2533]">
              {/* Quick actions bar */}
              <div className="mb-2 flex items-center justify-between border-b border-surface-border pb-1.5 px-1 text-xs text-ink-faint dark:border-[#2f3745]">
                <span>{filteredServices.length} ta xizmat topildi</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={selectAllFiltered}
                    className="text-brand-600 hover:underline dark:text-brand-400"
                  >
                    Barchasini tanlash
                  </button>
                  {selectedIds.length > 0 && (
                    <button
                      type="button"
                      onClick={clearAll}
                      className="text-rose-600 hover:underline dark:text-rose-400"
                    >
                      Tozalash
                    </button>
                  )}
                </div>
              </div>

              {/* Service list items */}
              <div className="space-y-1">
                {filteredServices.map((s) => {
                  const on = selectedIds.includes(s.id)
                  const name = lang === 'ru' ? s.name_ru : s.name_uz
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => toggle(s.id)}
                      className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors ${
                        on
                          ? 'bg-brand-50 text-brand-900 font-medium dark:bg-brand-900/30 dark:text-brand-200'
                          : 'hover:bg-surface-muted text-ink dark:hover:bg-[#222836] dark:text-[#e6e9ee]'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 truncate">
                        <span className={`grid h-4 w-4 shrink-0 place-items-center rounded border text-[10px] ${
                          on
                            ? 'border-brand-500 bg-brand-500 text-white font-bold'
                            : 'border-surface-border dark:border-[#2f3745]'
                        }`}>
                          {on ? '✓' : ''}
                        </span>
                        <span className="truncate">{name}</span>
                        {s.code && (
                          <span className="rounded bg-surface-muted px-1.5 py-0.5 text-[10px] font-mono text-ink-faint dark:bg-[#151a23]">
                            {s.code}
                          </span>
                        )}
                      </div>
                    </button>
                  )
                })}

                {filteredServices.length === 0 && (
                  <div className="py-4 text-center text-xs text-ink-faint">
                    {lang === 'ru' ? 'Услуги не найдены' : 'Xizmatlar topilmadi'}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
