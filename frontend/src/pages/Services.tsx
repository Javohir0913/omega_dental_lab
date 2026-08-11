import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { api, errText } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useLang, useT } from '@/i18n'
import { Confirm, Empty, Field, Modal, Spinner } from '@/components/ui'
import { toast } from '@/components/Toast'
import type { ServiceItem } from '@/lib/types'

export default function ServicesPage() {
  const t = useT()
  const lang = useLang((s) => s.lang)
  const { can } = useAuth()
  const qc = useQueryClient()

  const [edit, setEdit] = useState<ServiceItem | null>(null)
  const [creating, setCreating] = useState(false)
  const [del, setDel] = useState<ServiceItem | null>(null)
  const [showInactive, setShowInactive] = useState(false)
  const [list, setList] = useState<ServiceItem[]>([])

  const { data = [], isLoading } = useQuery({
    queryKey: ['services', showInactive],
    queryFn: async () =>
      (await api.get<ServiceItem[]>('/services', { params: { include_inactive: showInactive } }))
        .data,
  })

  useEffect(() => setList(data), [data])

  /** Xizmatlar tartibini almashtirish (yuqori/past). Sort qiymatlari qayta hisoblanadi. */
  async function shift(index: number, dir: -1 | 1) {
    const next = [...list]
    const target = index + dir
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    setList(next)
    try {
      await api.post('/services/reorder', {
        items: next.map((s, i) => ({ id: s.id, sort: (i + 1) * 100 })),
      })
      qc.invalidateQueries({ queryKey: ['services'] })
    } catch (e) {
      toast(errText(e, lang), 'error')
      setList(data)
    }
  }

  async function remove() {
    if (!del) return
    try {
      await api.delete(`/services/${del.id}`)
      toast(lang === 'ru' ? 'Архивирована' : 'Arxivlandi')
      qc.invalidateQueries({ queryKey: ['services'] })
    } catch (e) {
      toast(errText(e, lang), 'error')
    } finally {
      setDel(null)
    }
  }

  return (
    <div className="p-4">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <label className="flex cursor-pointer items-center gap-2 text-xs text-ink-soft">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          {lang === 'ru' ? 'Показать архив' : 'Arxivni ko‘rsatish'}
        </label>
        <div className="flex-1" />
        {can('service.manage') && (
          <button className="btn-primary" onClick={() => setCreating(true)}>
            + {t('add')}
          </button>
        )}
      </div>

      {isLoading ? (
        <Spinner />
      ) : list.length === 0 ? (
        <Empty />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-surface-border text-left text-xs text-ink-faint dark:border-[#2a3140]">
              <tr>
                <th className="w-14" />
                <th className="px-3 py-2 font-medium">Название (RU)</th>
                <th className="px-3 py-2 font-medium">Nomi (UZ)</th>
                <th className="w-20" />
              </tr>
            </thead>
            <tbody>
              {list.map((s, i) => (
                <tr
                  key={s.id}
                  className={clsx(
                    'border-b border-surface-border last:border-0 hover:bg-surface-muted dark:border-[#2a3140] dark:hover:bg-[#222836]',
                    !s.is_active && 'opacity-50',
                  )}
                >
                  <td className="px-3 py-1">
                    {can('service.manage') && (
                      <div className="flex flex-col">
                        <button
                          onClick={() => shift(i, -1)}
                          disabled={i === 0}
                          className="text-xs text-ink-faint hover:text-brand-600 disabled:opacity-20"
                        >
                          ▲
                        </button>
                        <button
                          onClick={() => shift(i, 1)}
                          disabled={i === list.length - 1}
                          className="text-xs text-ink-faint hover:text-brand-600 disabled:opacity-20"
                        >
                          ▼
                        </button>
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 font-medium">{s.name_ru}</td>
                  <td className="px-3 py-2 text-ink-soft">{s.name_uz}</td>
                  <td className="px-3 py-2 text-right">
                    {can('service.manage') && (
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => setEdit(s)}
                          className="rounded p-1 text-ink-faint hover:text-brand-600"
                        >
                          ✎
                        </button>
                        {s.is_active && (
                          <button
                            onClick={() => setDel(s)}
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

      {(creating || edit) && (
        <ServiceForm
          service={edit ?? undefined}
          onClose={() => {
            setCreating(false)
            setEdit(null)
          }}
          onDone={() => qc.invalidateQueries({ queryKey: ['services'] })}
        />
      )}

      <Confirm
        open={Boolean(del)}
        text={del?.name_ru ?? ''}
        onCancel={() => setDel(null)}
        onOk={remove}
      />
    </div>
  )
}

function ServiceForm({
  service,
  onClose,
  onDone,
}: {
  service?: ServiceItem
  onClose: () => void
  onDone: () => void
}) {
  const t = useT()
  const lang = useLang((s) => s.lang)
  const [form, setForm] = useState({
    name_ru: service?.name_ru ?? '',
    name_uz: service?.name_uz ?? '',
    note: service?.note ?? '',
    sort: service?.sort ?? 100,
    is_active: service?.is_active ?? true,
  })
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    const body = { ...form, note: form.note || null }
    try {
      if (service) await api.patch(`/services/${service.id}`, body)
      else await api.post('/services', body)
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
      title={service ? t('edit') : t('add')}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            {t('cancel')}
          </button>
          <button
            className="btn-primary"
            onClick={submit}
            disabled={busy || !form.name_ru.trim() || !form.name_uz.trim()}
          >
            {t('save')}
          </button>
        </>
      }
    >
      <p className="mb-3 text-xs text-ink-faint">
        {lang === 'ru'
          ? 'Цены в услугах не ведутся — только наименование.'
          : 'Xizmatlarda narx yuritilmaydi — faqat nomi.'}
      </p>

      <Field label="Название (RU)" required>
        <input
          className="input"
          value={form.name_ru}
          onChange={(e) => setForm({ ...form, name_ru: e.target.value })}
          autoFocus
        />
      </Field>
      <Field label="Nomi (UZ)" required>
        <input
          className="input"
          value={form.name_uz}
          onChange={(e) => setForm({ ...form, name_uz: e.target.value })}
        />
      </Field>
      <Field label="Сортировка">
        <input
          type="number"
          className="input"
          value={form.sort}
          onChange={(e) => setForm({ ...form, sort: Number(e.target.value) })}
        />
      </Field>
      {service && (
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
          />
          {t('active')}
        </label>
      )}
    </Modal>
  )
}
