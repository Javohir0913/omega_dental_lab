import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, errText } from '@/lib/api'
import { useLang, useNm, useT } from '@/i18n'
import { Field, Modal, Avatar } from '@/components/ui'
import { CustomFieldInput } from '@/components/FieldInput'
import type { CustomField, OrderCard, OrderDetail, RequirementError, Stage } from '@/lib/types'

interface Assignee {
  id: number
  full_name: string
  avatar: string | null
  active_orders: number
}

/**
 * Bosqichga o'tkazish oynasi.
 *
 * Ikki holatda ochiladi:
 *  1) Foydalanuvchi kartani sudrab boshqa ustunga tashladi va backend 422
 *     («majburiy maydonlar» yoki «keyingi bajaruvchini tanlang») qaytardi;
 *  2) Kartadan qo'lda «Перевести на этап» bosildi.
 *
 * Modal yetishmayotgan maydonlarni to'ldirtiradi va so'rovni qayta yuboradi.
 */
export default function MoveModal({
  order,
  toStage,
  requirement,
  needAssignee,
  onClose,
  onDone,
}: {
  order: OrderCard | OrderDetail
  toStage: Stage
  requirement?: RequirementError | null
  needAssignee?: boolean
  onClose: () => void
  onDone: (updated: OrderDetail) => void
}) {
  const t = useT()
  const nm = useNm()
  const lang = useLang((s) => s.lang)

  const [fields, setFields] = useState<Record<string, unknown>>({})
  const [customFields, setCustomFields] = useState<Record<string, unknown>>({})
  const [assignee, setAssignee] = useState<number | null>(null)
  const [comment, setComment] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [req, setReq] = useState<RequirementError | null>(requirement ?? null)
  const [askAssignee, setAskAssignee] = useState(Boolean(needAssignee))

  const { data: allFields } = useQuery({
    queryKey: ['fields', 'order'],
    queryFn: async () =>
      (await api.get<CustomField[]>('/admin/fields', { params: { entity: 'order' } })).data,
  })

  // Kim shu bosqichni bajara oladi + hozirgi yuki
  const { data: assignees } = useQuery({
    queryKey: ['assignees', order.id, toStage.id],
    queryFn: async () =>
      (
        await api.get<Assignee[]>(`/orders/${order.id}/available-assignees`, {
          params: { stage_id: toStage.id },
        })
      ).data,
    enabled: askAssignee || toStage.kind === 'work',
  })

  useEffect(() => setReq(requirement ?? null), [requirement])
  useEffect(() => setAskAssignee(Boolean(needAssignee)), [needAssignee])

  const missing = req?.fields ?? []

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      const { data } = await api.post<OrderDetail>(`/orders/${order.id}/move`, {
        stage_id: toStage.id,
        next_responsible_id: assignee,
        comment: comment.trim() || null,
        fields,
        custom_fields: customFields,
      })
      onDone(data)
      onClose()
    } catch (e) {
      // Backend yana yetishmayotgan maydon topsa — modalni to'ldirib qayta ko'rsatamiz
      const detail = (e as any)?.response?.data?.detail
      if (detail?.error === 'required_fields') {
        setReq(detail as RequirementError)
        setError(t('fill_required'))
      } else if (detail?.error === 'next_assignee_required') {
        setAskAssignee(true)
        setError(lang === 'ru' ? detail.message_ru : detail.message_uz)
      } else {
        setError(errText(e, lang))
      }
    } finally {
      setBusy(false)
    }
  }

  function renderMissing(ref: string, label: string) {
    // sys:<name> — tizim maydoni
    if (ref.startsWith('sys:')) {
      const name = ref.slice(4)
      const set = (v: unknown) => setFields((p) => ({ ...p, [name]: v }))

      if (name === 'deadline')
        return (
          <input
            type="datetime-local"
            className="input"
            value={(fields.deadline as string) ?? ''}
            onChange={(e) => set(e.target.value || null)}
          />
        )
      if (name === 'description')
        return (
          <textarea
            className="input min-h-[70px]"
            value={(fields.description as string) ?? ''}
            onChange={(e) => set(e.target.value || null)}
          />
        )
      if (name === 'responsible_id')
        return (
          <select
            className="input"
            value={assignee ?? ''}
            onChange={(e) => setAssignee(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">—</option>
            {(assignees ?? []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.full_name}
              </option>
            ))}
          </select>
        )
      return (
        <input
          className="input"
          placeholder={label}
          value={(fields[name] as string) ?? ''}
          onChange={(e) => set(e.target.value || null)}
        />
      )
    }

    // cf:<id> — adminkada yaratilgan maydon
    const id = Number(ref.slice(3))
    const f = allFields?.find((x) => x.id === id)
    if (!f) return <input className="input" disabled placeholder={label} />
    return (
      <CustomFieldInput
        field={f}
        value={customFields[f.code]}
        onChange={(v) => setCustomFields((p) => ({ ...p, [f.code]: v }))}
      />
    )
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          {t('move_to')}
          <span
            className="chip"
            style={{
              backgroundColor: `${toStage.color}1a`,
              color: toStage.color,
              border: `1px solid ${toStage.color}33`,
            }}
          >
            {nm(toStage, 'name')}
          </span>
        </span>
      }
      footer={
        <>
          <button className="btn-ghost" onClick={onClose} disabled={busy}>
            {t('cancel')}
          </button>
          <button className="btn-primary" onClick={submit} disabled={busy}>
            {busy ? t('loading') : t('save')}
          </button>
        </>
      }
    >
      <div className="mb-3 text-xs text-ink-faint">
        {order.number} · {order.title}
      </div>

      {missing.length > 0 && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/40 dark:bg-amber-900/10">
          <div className="mb-2 text-xs font-medium text-amber-800 dark:text-amber-200">
            {t('fill_required')}
          </div>
          {missing.map((m) => {
            const label = lang === 'ru' ? m.label_ru : m.label_uz
            return (
              <Field key={m.field_ref} label={label} required>
                {renderMissing(m.field_ref, label)}
              </Field>
            )
          })}
        </div>
      )}

      {(askAssignee || toStage.kind === 'work') && (
        <Field
          label={t('next_assignee')}
          required={askAssignee}
          hint={
            !askAssignee
              ? lang === 'ru'
                ? 'Можно оставить пустым — техник возьмёт сам'
                : "Bo'sh qoldirsa bo'ladi — texnik o'zi oladi"
              : null
          }
        >
          <div className="space-y-1">
            {(assignees ?? []).length === 0 && (
              <div className="rounded-lg border border-surface-border px-3 py-2 text-xs text-ink-faint dark:border-[#2f3745]">
                {lang === 'ru'
                  ? 'Нет техников, назначенных на этот этап'
                  : 'Bu bosqichga biriktirilgan texnik yo‘q'}
              </div>
            )}
            {(assignees ?? []).map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setAssignee(assignee === a.id ? null : a.id)}
                className={
                  'flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-sm transition-colors ' +
                  (assignee === a.id
                    ? 'border-brand-400 bg-brand-50 dark:bg-brand-900/20'
                    : 'border-surface-border hover:bg-surface-muted dark:border-[#2f3745] dark:hover:bg-[#222836]')
                }
              >
                <Avatar name={a.full_name} size={22} />
                <span className="flex-1 truncate">{a.full_name}</span>
                <span className="text-[10px] text-ink-faint">
                  {a.active_orders} {t('active_orders')}
                </span>
              </button>
            ))}
          </div>
        </Field>
      )}

      <Field label={t('comment')}>
        <textarea
          className="input min-h-[60px]"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
      </Field>

      {error && (
        <div className="whitespace-pre-line rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {error}
        </div>
      )}
    </Modal>
  )
}
