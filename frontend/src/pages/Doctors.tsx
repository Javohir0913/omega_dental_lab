import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, errText } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useLang, useT } from '@/i18n'
import { Confirm, Empty, Field, Modal, Spinner } from '@/components/ui'
import { toast } from '@/components/Toast'
import type { Doctor, Page } from '@/lib/types'

export default function DoctorsPage() {
  const t = useT()
  const lang = useLang((s) => s.lang)
  const { can } = useAuth()
  const qc = useQueryClient()

  const [q, setQ] = useState('')
  const [edit, setEdit] = useState<Doctor | null>(null)
  const [creating, setCreating] = useState(false)
  const [del, setDel] = useState<Doctor | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['doctors', q],
    queryFn: async () =>
      (await api.get<Page<Doctor>>('/doctors', { params: { q: q || undefined, size: 100 } })).data,
  })

  async function remove() {
    if (!del) return
    try {
      const { data } = await api.delete(`/doctors/${del.id}`)
      toast(data.detail === 'archived' ? (lang === 'ru' ? 'Архивирован' : 'Arxivlandi') : t('saved'))
      qc.invalidateQueries({ queryKey: ['doctors'] })
    } catch (e) {
      toast(errText(e, lang), 'error')
    } finally {
      setDel(null)
    }
  }

  const items = data?.items ?? []

  return (
    <div className="p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          className="input max-w-[240px]"
          placeholder={t('search')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="flex-1" />
        <span className="text-xs text-ink-faint">{data?.total ?? 0}</span>
        {can('doctor.manage') && (
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
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((d) => (
            <div key={d.id} className="card p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{d.full_name}</div>
                  {d.clinic && <div className="truncate text-xs text-ink-soft">{d.clinic}</div>}
                  {d.phone && <div className="text-xs text-ink-faint">{d.phone}</div>}
                </div>
                {can('doctor.manage') && (
                  <div className="flex shrink-0 gap-1">
                    <button
                      onClick={() => setEdit(d)}
                      className="rounded p-1 text-ink-faint hover:text-brand-600"
                    >
                      ✎
                    </button>
                    <button
                      onClick={() => setDel(d)}
                      className="rounded p-1 text-ink-faint hover:text-rose-600"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
              {d.note && <p className="mt-2 line-clamp-2 text-xs text-ink-soft">{d.note}</p>}
            </div>
          ))}
        </div>
      )}

      {(creating || edit) && (
        <DoctorForm
          doctor={edit ?? undefined}
          onClose={() => {
            setCreating(false)
            setEdit(null)
          }}
          onDone={() => qc.invalidateQueries({ queryKey: ['doctors'] })}
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

function DoctorForm({
  doctor,
  onClose,
  onDone,
}: {
  doctor?: Doctor
  onClose: () => void
  onDone: () => void
}) {
  const t = useT()
  const lang = useLang((s) => s.lang)
  const [form, setForm] = useState({
    full_name: doctor?.full_name ?? '',
    phone: doctor?.phone ?? '',
    clinic: doctor?.clinic ?? '',
    note: doctor?.note ?? '',
  })
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    const body = {
      full_name: form.full_name.trim(),
      phone: form.phone || null,
      clinic: form.clinic || null,
      note: form.note || null,
    }
    try {
      if (doctor) await api.patch(`/doctors/${doctor.id}`, body)
      else await api.post('/doctors', body)
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
      title={doctor ? t('edit') : t('add')}
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
      <Field label={t('phone')}>
        <input
          className="input"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
        />
      </Field>
      <Field label="Клиника / Klinika">
        <input
          className="input"
          value={form.clinic}
          onChange={(e) => setForm({ ...form, clinic: e.target.value })}
        />
      </Field>
      <Field label={t('description')}>
        <textarea
          className="input min-h-[60px]"
          value={form.note}
          onChange={(e) => setForm({ ...form, note: e.target.value })}
        />
      </Field>
    </Modal>
  )
}
