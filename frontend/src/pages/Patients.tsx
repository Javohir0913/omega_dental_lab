import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { api, errText } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useLang, useT } from '@/i18n'
import { Badge, Empty, Field, Modal, Spinner } from '@/components/ui'
import { CustomFieldInput } from '@/components/FieldInput'
import { toast } from '@/components/Toast'
import { dateOnly } from '@/lib/format'
import type { CustomField, Doctor, Page, Patient } from '@/lib/types'

export default function PatientsPage() {
  const t = useT()
  const lang = useLang((s) => s.lang)
  const { can } = useAuth()
  const qc = useQueryClient()
  const navigate = useNavigate()

  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [edit, setEdit] = useState<Patient | null>(null)
  const [creating, setCreating] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [archiving, setArchiving] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['patients', q, page, showArchived],
    queryFn: async () =>
      (await api.get<Page<Patient>>('/patients', {
        params: { q: q || undefined, is_active: showArchived ? false : undefined, page, size: 30 },
      })).data,
  })

  async function toggleActive(p: Patient) {
    setArchiving(true)
    try {
      if (p.is_active) {
        await api.delete(`/patients/${p.id}`)
        toast(lang === 'ru' ? 'Архивирован' : 'Arxivlandi')
      } else {
        await api.patch(`/patients/${p.id}`, { is_active: true })
        toast(lang === 'ru' ? 'Восстановлен' : 'Tiklandi')
      }
      qc.invalidateQueries({ queryKey: ['patients'] })
    } catch (e) {
      toast(errText(e, lang), 'error')
    } finally {
      setArchiving(false)
    }
  }

  const items = data?.items ?? []
  const pages = data ? Math.max(1, Math.ceil(data.total / data.size)) : 1

  return (
    <div className="p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          className="input max-w-[240px]"
          placeholder={t('search')}
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setPage(1)
          }}
        />
        <button
          onClick={() => { setShowArchived((v) => !v); setPage(1) }}
          className={clsx(
            'rounded-lg border px-2.5 py-1.5 text-xs transition-colors',
            showArchived
              ? 'border-amber-300 bg-amber-50 font-medium text-amber-700 dark:bg-amber-900/25'
              : 'border-surface-border text-ink-soft hover:bg-surface-muted dark:border-[#2f3745] dark:hover:bg-[#222836]',
          )}
        >
          🗂 {lang === 'ru' ? 'Архив' : 'Arxiv'}
        </button>
        <div className="flex-1" />
        <span className="text-xs text-ink-faint">{data?.total ?? 0}</span>
        {!showArchived && can('patient.manage') && (
          <button className="btn-primary" onClick={() => setCreating(true)}>
            + {t('add')}
          </button>
        )}
      </div>

      {isLoading ? (
        <Spinner />
      ) : items.length === 0 ? (
        <Empty />
      ) : (
        <div className="card overflow-x-auto">
          <table className="table-wide w-full text-sm">
            <thead className="border-b border-surface-border text-left text-xs text-ink-faint dark:border-[#2a3140]">
              <tr>
                <th className="px-3 py-2 font-medium">{t('full_name')}</th>
                <th className="px-3 py-2 font-medium">{t('phone')}</th>
                <th className="px-3 py-2 font-medium">{t('doctor')}</th>
                <th className="px-3 py-2 font-medium">Дата рожд.</th>
                <th className="w-20" />
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => navigate(`/patients/${p.id}`)}
                  className="cursor-pointer border-b border-surface-border last:border-0 hover:bg-surface-muted dark:border-[#2a3140] dark:hover:bg-[#222836]"
                >
                  <td className="px-3 py-2 font-medium">
                    <div className="flex items-center gap-1.5">
                      <span className={clsx(!p.is_active && 'text-ink-faint')}>{p.full_name}</span>
                      {!p.is_active && <Badge color="#d97706">{lang === 'ru' ? 'Архив' : 'Arxiv'}</Badge>}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-ink-soft">{p.phone ?? '—'}</td>
                  <td className="px-3 py-2 text-ink-soft">{p.doctor?.full_name ?? '—'}</td>
                  <td className="px-3 py-2 text-ink-soft">
                    {p.birth_date ? dateOnly(p.birth_date) : '—'}
                  </td>
                  <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                    {can('patient.manage') && (
                      <div className="flex justify-end gap-1">
                        {p.is_active ? (
                          <button
                            onClick={() => setEdit(p)}
                            className="rounded p-1 text-ink-faint hover:text-brand-600"
                          >
                            ✎
                          </button>
                        ) : (
                          <button
                            onClick={() => toggleActive(p)}
                            disabled={archiving}
                            className="rounded-md bg-brand-500 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-brand-600"
                          >
                            {t('restore')}
                          </button>
                        )}
                        {p.is_active && (
                          <button
                            onClick={() => toggleActive(p)}
                            disabled={archiving}
                            className="rounded p-1 text-ink-faint hover:text-rose-600"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
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
          <button className="btn-ghost" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
            →
          </button>
        </div>
      )}

      {(creating || edit) && (
        <PatientForm
          patient={edit ?? undefined}
          onClose={() => {
            setCreating(false)
            setEdit(null)
          }}
          onDone={() => qc.invalidateQueries({ queryKey: ['patients'] })}
        />
      )}
    </div>
  )
}

export function PatientForm({
  patient,
  onClose,
  onDone,
}: {
  patient?: Patient
  onClose: () => void
  onDone: (patient: Patient) => void
}) {
  const t = useT()
  const lang = useLang((s) => s.lang)
  const [form, setForm] = useState({
    full_name: patient?.full_name ?? '',
    phone: patient?.phone ?? '',
    birth_date: patient?.birth_date ?? '',
    gender: patient?.gender ?? '',
    doctor_id: patient?.doctor?.id ?? null,
    note: patient?.note ?? '',
  })
  const [cf, setCf] = useState<Record<string, unknown>>(patient?.custom_fields ?? {})
  const [busy, setBusy] = useState(false)

  const { data: doctors } = useQuery({
    queryKey: ['doctors-select'],
    queryFn: async () => (await api.get<Page<Doctor>>('/doctors', { params: { size: 200 } })).data,
  })
  const { data: fields = [] } = useQuery({
    queryKey: ['fields', 'patient'],
    queryFn: async () =>
      (await api.get<CustomField[]>('/admin/fields', { params: { entity: 'patient' } })).data,
  })

  async function submit() {
    setBusy(true)
    const body = {
      ...form,
      phone: form.phone || null,
      birth_date: form.birth_date || null,
      gender: form.gender || null,
      note: form.note || null,
      custom_fields: cf,
    }
    try {
      const { data } = patient
        ? await api.patch<Patient>(`/patients/${patient.id}`, body)
        : await api.post<Patient>('/patients', body)
      toast(t('saved'))
      onDone(data)
      onClose()
    } catch (e) {
      toast(errText(e, lang), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      wide
      title={patient ? t('edit') : t('add')}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            {t('cancel')}
          </button>
          <button className="btn-primary" onClick={submit} disabled={busy || !form.full_name.trim()}>
            {t('save')}
          </button>
        </>
      }
    >
      <Field label={t('full_name')} required>
        <input
          className="input"
          value={form.full_name}
          onChange={(e) => setForm({ ...form, full_name: e.target.value })}
          autoFocus
        />
      </Field>

      <div className="grid gap-x-3 sm:grid-cols-2">
        <Field label={t('phone')}>
          <input
            className="input"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
        </Field>

        <Field label="Дата рождения">
          <input
            type="date"
            className="input"
            value={form.birth_date}
            onChange={(e) => setForm({ ...form, birth_date: e.target.value })}
          />
        </Field>

        <Field label="Пол">
          <select
            className="input"
            value={form.gender}
            onChange={(e) => setForm({ ...form, gender: e.target.value })}
          >
            <option value="">—</option>
            <option value="m">М</option>
            <option value="f">Ж</option>
          </select>
        </Field>

        <Field label={t('doctor')}>
          <select
            className="input"
            value={form.doctor_id ?? ''}
            onChange={(e) =>
              setForm({ ...form, doctor_id: e.target.value ? Number(e.target.value) : null })
            }
          >
            <option value="">—</option>
            {(doctors?.items ?? []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.full_name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label={t('description')}>
        <textarea
          className="input min-h-[60px]"
          value={form.note}
          onChange={(e) => setForm({ ...form, note: e.target.value })}
        />
      </Field>

      {fields
        .filter((f) => f.is_active)
        .map((f) => (
          <Field
            key={f.id}
            label={lang === 'ru' ? f.label_ru : f.label_uz}
            required={f.required_on_create}
            hint={lang === 'ru' ? f.hint_ru : f.hint_uz}
          >
            <CustomFieldInput
              field={f}
              value={cf[f.code]}
              onChange={(v) => setCf((p) => ({ ...p, [f.code]: v }))}
            />
          </Field>
        ))}
    </Modal>
  )
}
