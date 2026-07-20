import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { api, errText } from '@/lib/api'
import { useLang, useNm, useT } from '@/i18n'
import { Badge, Field, Spinner } from '@/components/ui'
import { toast } from '@/components/Toast'
import type { NotifyMeta, NotifyTemplate, Stage } from '@/lib/types'

export default function AdminNotify() {
  const t = useT()
  const nm = useNm()
  const lang = useLang((s) => s.lang)
  const qc = useQueryClient()

  const [event, setEvent] = useState<string>('')
  const [stageId, setStageId] = useState<number | ''>('')
  const [form, setForm] = useState<Partial<NotifyTemplate>>({})
  const [busy, setBusy] = useState(false)

  const { data: meta, isLoading } = useQuery({
    queryKey: ['notify-meta'],
    queryFn: async () => (await api.get<NotifyMeta>('/admin/notify/meta')).data,
  })
  const { data: templates = [] } = useQuery({
    queryKey: ['notify-templates'],
    queryFn: async () => (await api.get<NotifyTemplate[]>('/admin/notify/templates')).data,
  })
  const { data: stages = [] } = useQuery({
    queryKey: ['stages'],
    queryFn: async () => (await api.get<Stage[]>('/stages')).data,
  })

  useEffect(() => {
    if (!event && meta?.events.length) setEvent(meta.events[0].code)
  }, [meta, event])

  // Tanlangan hodisa+bosqich uchun mavjud shablonni yuklaymiz (bo'lmasa — bo'sh forma)
  useEffect(() => {
    if (!event) return
    const found = templates.find(
      (x) => x.event === event && (x.stage_id ?? '') === (stageId === '' ? null : stageId),
    )
    setForm(
      found ?? {
        event,
        stage_id: stageId === '' ? null : stageId,
        is_active: true,
        recipients: [],
        notify_actor: false,
        title_ru: '',
        title_uz: '',
        body_ru: '',
        body_uz: '',
      },
    )
  }, [event, stageId, templates])

  async function save() {
    setBusy(true)
    try {
      await api.put('/admin/notify/templates', {
        event,
        stage_id: stageId === '' ? null : stageId,
        is_active: form.is_active ?? true,
        recipients: form.recipients ?? [],
        notify_actor: form.notify_actor ?? false,
        title_ru: form.title_ru ?? '',
        title_uz: form.title_uz ?? '',
        body_ru: form.body_ru ?? '',
        body_uz: form.body_uz ?? '',
      })
      toast(t('saved'))
      qc.invalidateQueries({ queryKey: ['notify-templates'] })
    } catch (e) {
      toast(errText(e, lang), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function reset() {
    if (!form.id) return
    try {
      await api.delete(`/admin/notify/templates/${form.id}`)
      toast(t('saved'))
      qc.invalidateQueries({ queryKey: ['notify-templates'] })
    } catch (e) {
      toast(errText(e, lang), 'error')
    }
  }

  function toggleRecipient(token: string) {
    const list = form.recipients ?? []
    setForm({
      ...form,
      recipients: list.includes(token) ? list.filter((x) => x !== token) : [...list, token],
    })
  }

  function insert(field: 'title_ru' | 'title_uz' | 'body_ru' | 'body_uz', key: string) {
    setForm({ ...form, [field]: `${form[field] ?? ''}${key}` })
  }

  if (isLoading) return <Spinner />

  const configured = new Set(templates.map((x) => x.event))

  return (
    <div className="flex gap-4">
      {/* Hodisalar */}
      <div className="w-60 shrink-0 space-y-1">
        {(meta?.events ?? []).map((e) => (
          <button
            key={e.code}
            onClick={() => setEvent(e.code)}
            className={clsx(
              'w-full rounded-lg px-2.5 py-2 text-left text-xs transition-colors',
              event === e.code
                ? 'bg-brand-50 font-medium text-brand-700 dark:bg-brand-900/30'
                : 'text-ink-soft hover:bg-surface-muted dark:hover:bg-[#222836]',
            )}
          >
            <div className="flex items-center gap-1.5">
              <span className="min-w-0 flex-1 truncate">{lang === 'ru' ? e.label_ru : e.label_uz}</span>
              {configured.has(e.code) && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
            </div>
            <div className="font-mono text-[10px] text-ink-faint">{e.code}</div>
          </button>
        ))}
      </div>

      {/* Shablon */}
      <div className="min-w-0 flex-1">
        <div className="card p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <select
              className="input max-w-[220px]"
              value={stageId}
              onChange={(e) => setStageId(e.target.value ? Number(e.target.value) : '')}
            >
              <option value="">
                {lang === 'ru' ? 'Для всех этапов' : 'Barcha bosqichlar uchun'}
              </option>
              {stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {lang === 'ru' ? 'Только этап: ' : 'Faqat bosqich: '}
                  {nm(s, 'name')}
                </option>
              ))}
            </select>

            {form.id ? <Badge color="#22c55e">saved</Badge> : <Badge>default</Badge>}

            <div className="flex-1" />

            {form.id && (
              <button className="btn-ghost text-xs text-rose-600" onClick={reset}>
                {lang === 'ru' ? 'Сбросить к умолчанию' : 'Default holatga qaytarish'}
              </button>
            )}
            <button className="btn-primary" onClick={save} disabled={busy}>
              {t('save')}
            </button>
          </div>

          <p className="mb-3 text-xs text-ink-faint">
            {lang === 'ru'
              ? 'Если шаблон не сохранён — используется встроенный текст и получатели по умолчанию. Текст можно оставить пустым: тогда возьмётся стандартный.'
              : 'Shablon saqlanmagan bo‘lsa — ichki matn va default oluvchilar ishlatiladi. Matnni bo‘sh qoldirsangiz — standart matn olinadi.'}
          </p>

          <Field label={t('recipients')}>
            <div className="flex flex-wrap gap-1.5">
              {(meta?.recipient_tokens ?? []).map((r) => {
                const on = (form.recipients ?? []).includes(r.token)
                return (
                  <button
                    key={r.token}
                    onClick={() => toggleRecipient(r.token)}
                    className={
                      on
                        ? 'chip border border-brand-300 bg-brand-100 text-brand-700'
                        : 'chip border border-surface-border text-ink-faint dark:border-[#2f3745]'
                    }
                  >
                    {lang === 'ru' ? r.label_ru : r.label_uz}
                  </button>
                )
              })}
            </div>
          </Field>

          <label className="mb-3 flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.notify_actor ?? false}
              onChange={(e) => setForm({ ...form, notify_actor: e.target.checked })}
            />
            {lang === 'ru'
              ? 'Отправлять и тому, кто сделал действие'
              : 'Harakatni qilgan odamga ham yuborilsin'}
          </label>

          <Field label={t('placeholders')}>
            <div className="flex flex-wrap gap-1">
              {(meta?.placeholders ?? []).map((p) => (
                <button
                  key={p.key}
                  onClick={() => insert('body_ru', p.key)}
                  className="chip border border-surface-border font-mono text-ink-soft hover:border-brand-300 hover:text-brand-600 dark:border-[#2f3745]"
                  title={lang === 'ru' ? p.label_ru : p.label_uz}
                >
                  {p.key}
                </button>
              ))}
            </div>
          </Field>

          <div className="grid gap-x-4 sm:grid-cols-2">
            <Field label={`${t('notify_title')} (RU)`}>
              <input
                className="input"
                value={form.title_ru ?? ''}
                onChange={(e) => setForm({ ...form, title_ru: e.target.value })}
              />
            </Field>
            <Field label={`${t('notify_title')} (UZ)`}>
              <input
                className="input"
                value={form.title_uz ?? ''}
                onChange={(e) => setForm({ ...form, title_uz: e.target.value })}
              />
            </Field>
            <Field label={`${t('notify_body')} (RU)`}>
              <textarea
                className="input min-h-[80px]"
                value={form.body_ru ?? ''}
                onChange={(e) => setForm({ ...form, body_ru: e.target.value })}
              />
            </Field>
            <Field label={`${t('notify_body')} (UZ)`}>
              <textarea
                className="input min-h-[80px]"
                value={form.body_uz ?? ''}
                onChange={(e) => setForm({ ...form, body_uz: e.target.value })}
              />
            </Field>
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.is_active ?? true}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
            />
            {t('active')}
          </label>
        </div>
      </div>
    </div>
  )
}
