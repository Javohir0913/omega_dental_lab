import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, errText } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useLang, useT } from '@/i18n'
import { Confirm, Empty, Field, Modal, Spinner } from '@/components/ui'
import { CustomFieldInput } from '@/components/FieldInput'
import { toast } from '@/components/Toast'
import { dateOnly } from '@/lib/format'
import type { CustomField, Doctor, Page, Patient } from '@/lib/types'

export default function PatientsPage() {
  const t = useT()
  const lang = useLang((s) => s.lang)
  const { can } = useAuth()
  const qc = useQueryClient()

  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [edit, setEdit] = useState<Patient | null>(null)
  const [creating, setCreating] = useState(false)
  const [del, setDel] = useState<Patient | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['patients', q, page],
    queryFn: async () =>
      (await api.get<Page<Patient>>('/patients', { params: { q: q || undefined, page, size: 30 } }))
        .data,
  })

  async function remove() {
    if (!del) return
    try {
      const { data } = await api.delete(`/patients/${del.id}`)
      toast(data.detail === 'archived' ? (lang === 'ru' ? 'Архивирован' : 'Arxivlandi') : t('saved'))
      qc.invalidateQueries({ queryKey: ['patients'] })
    } catch (e) {
      toast(errText(e, lang), 'error')
    } finally {
      setDel(null)
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
        <div className="flex-1" />
        <span className="text-xs text-ink-faint">{data?.total ?? 0}</span>
        {can('patient.manage') && (
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
          <table className="w-full text-sm">
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
                  className="border-b border-surface-border last:border-0 hover:bg-surface-muted dark:border-[#2a3140] dark:hover:bg-[#222836]"
                >
                  <td className="px-3 py-2 font-medium">{p.full_name}</td>
                  <td className="px-3 py-2 text-ink-soft">{p.phone ?? '—'}</td>
                  <td className="px-3 py-2 text-ink-soft">{p.doctor?.full_name ?? '—'}</td>
                  <td className="px-3 py-2 text-ink-soft">
                    {p.birth_date ? dateOnly(p.birth_date) : '—'}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {can('patient.manage') && (
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => setEdit(p)}
                          className="rounded p-1 text-ink-faint hover:text-brand-600"
                        >
                          ✎
                        </button>
                        <button
                          onClick={() => setDel(p)}
                          className="rounded p-1 text-ink-faint hover:text-rose-600"
                        >
                          ✕
                        </button>
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

      <Confirm
        open={Boolean(del)}
        text={del?.full_name ?? ''}
        onCancel={() => setDel(null)}
        onOk={remove}
      />
    </div>
  )
}

function PatientForm({
  patient,
  onClose,
  onDone,
}: {
  patient?: Patient
  onClose: () => void
  onDone: () => void
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
      if (patient) await api.patch(`/patients/${patient.id}`, body)
      else await api.post('/patients', body)
      toast(t('saved'))
      onDone()
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
