import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { api, errText } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useLang, useT } from '@/i18n'
import { Badge, Empty, Field, Modal, Spinner } from '@/components/ui'
import { toast } from '@/components/Toast'
import type { Doctor, Page } from '@/lib/types'

export default function DoctorsPage() {
  const t = useT()
  const lang = useLang((s) => s.lang)
  const { can } = useAuth()
  const qc = useQueryClient()
  const navigate = useNavigate()

  const [q, setQ] = useState('')
  const [edit, setEdit] = useState<Doctor | null>(null)
  const [creating, setCreating] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [archiving, setArchiving] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['doctors', q, showArchived],
    queryFn: async () =>
      (await api.get<Page<Doctor>>('/doctors', {
        params: { q: q || undefined, is_active: showArchived ? false : undefined, size: 100 },
      })).data,
  })

  async function toggleActive(d: Doctor) {
    setArchiving(true)
    try {
      if (d.is_active) {
        await api.delete(`/doctors/${d.id}`)
        toast(lang === 'ru' ? 'Архивирован' : 'Arxivlandi')
      } else {
        await api.patch(`/doctors/${d.id}`, { is_active: true })
        toast(lang === 'ru' ? 'Восстановлен' : 'Tiklandi')
      }
      qc.invalidateQueries({ queryKey: ['doctors'] })
    } catch (e) {
      toast(errText(e, lang), 'error')
    } finally {
      setArchiving(false)
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
        <button
          onClick={() => setShowArchived((v) => !v)}
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
        {!showArchived && can('doctor.manage') && (
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
            <div
              key={d.id}
              onClick={() => navigate(`/doctors/${d.id}`)}
              className="card cursor-pointer p-3 transition-shadow hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={clsx('truncate text-sm font-medium', !d.is_active && 'text-ink-faint')}>
                      {d.full_name}
                    </span>
                    {!d.is_active && <Badge color="#d97706">{lang === 'ru' ? 'Архив' : 'Arxiv'}</Badge>}
                  </div>
                  {d.clinic && <div className="truncate text-xs text-ink-soft">{d.clinic}</div>}
                  {d.phone && <div className="text-xs text-ink-faint">{d.phone}</div>}
                </div>
                {can('doctor.manage') && (
                  <div className="flex shrink-0 gap-1" onClick={(e) => e.stopPropagation()}>
                    {d.is_active ? (
                      <button
                        onClick={() => setEdit(d)}
                        className="rounded p-1 text-ink-faint hover:text-brand-600"
                      >
                        ✎
                      </button>
                    ) : (
                      <button
                        onClick={() => toggleActive(d)}
                        disabled={archiving}
                        className="rounded-md bg-brand-500 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-brand-600"
                      >
                        {t('restore')}
                      </button>
                    )}
                    {d.is_active && (
                      <button
                        onClick={() => toggleActive(d)}
                        disabled={archiving}
                        className="rounded p-1 text-ink-faint hover:text-rose-600"
                      >
                        ✕
                      </button>
                    )}
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
    </div>
  )
}

export function DoctorForm({
  doctor,
  onClose,
  onDone,
}: {
  doctor?: Doctor
  onClose: () => void
  onDone: (doctor: Doctor) => void
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
      const { data } = doctor
        ? await api.patch<Doctor>(`/doctors/${doctor.id}`, body)
        : await api.post<Doctor>('/doctors', body)
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

      <div className="grid gap-x-3 sm:grid-cols-2">
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
      </div>

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
