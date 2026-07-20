import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { api, errText } from '@/lib/api'
import { useLang, useNm, useT } from '@/i18n'
import { Badge, Field, Modal, Spinner } from '@/components/ui'
import { toast } from '@/components/Toast'
import type { FieldRef, Stage, StageRequirement } from '@/lib/types'

const MOMENTS = ['create', 'move_in', 'move_out'] as const

export default function AdminRequirements() {
  const t = useT()
  const nm = useNm()
  const lang = useLang((s) => s.lang)
  const qc = useQueryClient()

  const [adding, setAdding] = useState<{ stage: Stage; moment: string } | null>(null)

  const { data: stages = [] } = useQuery({
    queryKey: ['stages'],
    queryFn: async () => (await api.get<Stage[]>('/stages')).data,
  })
  const { data: reqs = [], isLoading } = useQuery({
    queryKey: ['requirements'],
    queryFn: async () => (await api.get<StageRequirement[]>('/admin/requirements')).data,
  })

  async function remove(id: number) {
    try {
      await api.delete(`/admin/requirements/${id}`)
      qc.invalidateQueries({ queryKey: ['requirements'] })
      toast(t('saved'))
    } catch (e) {
      toast(errText(e, lang), 'error')
    }
  }

  const momentLabel = (m: string) =>
    m === 'create' ? t('moment_create') : m === 'move_in' ? t('moment_move_in') : t('moment_move_out')

  if (isLoading) return <Spinner />

  return (
    <div>
      <p className="mb-4 text-xs text-ink-faint">
        {lang === 'ru'
          ? 'Здесь настраивается, какие поля обязательно заполнить: при создании проекта, при переводе НА этап или при уходе С этапа. Если поле пустое — система не даст перевести карточку и покажет форму для заполнения.'
          : 'Bu yerda qaysi maydon majburiy ekani sozlanadi: proyekt yaratishda, bosqichga KIRISHda yoki bosqichdan CHIQISHda. Maydon bo‘sh bo‘lsa — tizim kartani surishga ruxsat bermaydi va to‘ldirish formasini ko‘rsatadi.'}
      </p>

      <div className="space-y-3">
        {stages.map((stage) => {
          const stageReqs = reqs.filter((r) => r.stage_id === stage.id)
          return (
            <div key={stage.id} className="card p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ background: stage.color }} />
                <span className="text-sm font-semibold">{nm(stage, 'name')}</span>
                {stageReqs.length > 0 && <Badge>{stageReqs.length}</Badge>}
              </div>

              <div className="grid gap-2 md:grid-cols-3">
                {MOMENTS.filter(
                  // «Создание» faqat «Новый» ustunida ma'noga ega
                  (m) => m !== 'create' || stage.kind === 'new',
                ).map((moment) => {
                  const list = stageReqs.filter((r) => r.moment === moment)
                  return (
                    <div
                      key={moment}
                      className="rounded-lg border border-surface-border p-2 dark:border-[#2f3745]"
                    >
                      <div className="mb-1.5 flex items-center justify-between">
                        <span className="text-[11px] font-medium text-ink-soft">
                          {momentLabel(moment)}
                        </span>
                        <button
                          onClick={() => setAdding({ stage, moment })}
                          className="text-xs text-brand-600 hover:underline"
                        >
                          +
                        </button>
                      </div>

                      {list.length === 0 ? (
                        <div className="py-1 text-[11px] text-ink-faint">—</div>
                      ) : (
                        <div className="space-y-1">
                          {list.map((r) => (
                            <div
                              key={r.id}
                              className={clsx(
                                'flex items-center gap-1.5 rounded-md bg-surface-muted px-1.5 py-1 text-[11px] dark:bg-[#242b38]',
                                !r.is_active && 'opacity-50',
                              )}
                            >
                              <span className="min-w-0 flex-1 truncate">
                                {lang === 'ru' ? r.label_ru : r.label_uz}
                              </span>
                              <button
                                onClick={() => remove(r.id)}
                                className="text-ink-faint hover:text-rose-600"
                              >
                                ✕
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {adding && (
        <AddRequirement
          stage={adding.stage}
          moment={adding.moment}
          existing={reqs}
          onClose={() => setAdding(null)}
          onDone={() => qc.invalidateQueries({ queryKey: ['requirements'] })}
        />
      )}
    </div>
  )
}

function AddRequirement({
  stage,
  moment,
  existing,
  onClose,
  onDone,
}: {
  stage: Stage
  moment: string
  existing: StageRequirement[]
  onClose: () => void
  onDone: () => void
}) {
  const t = useT()
  const nm = useNm()
  const lang = useLang((s) => s.lang)

  const [fieldRef, setFieldRef] = useState('')
  const [msgRu, setMsgRu] = useState('')
  const [msgUz, setMsgUz] = useState('')
  const [busy, setBusy] = useState(false)

  const { data: refs = [] } = useQuery({
    queryKey: ['field-refs'],
    queryFn: async () => (await api.get<FieldRef[]>('/admin/field-refs')).data,
  })

  const used = new Set(
    existing.filter((r) => r.stage_id === stage.id && r.moment === moment).map((r) => r.field_ref),
  )
  const available = refs.filter((r) => !used.has(r.field_ref))

  async function submit() {
    setBusy(true)
    try {
      await api.post('/admin/requirements', {
        stage_id: stage.id,
        field_ref: fieldRef,
        moment,
        message_ru: msgRu || null,
        message_uz: msgUz || null,
      })
      toast(t('saved'))
      onDone()
      onClose()
    } catch (e) {
      toast(errText(e, lang), 'error')
    } finally {
      setBusy(false)
    }
  }

  const momentLabel =
    moment === 'create' ? t('moment_create') : moment === 'move_in' ? t('moment_move_in') : t('moment_move_out')

  return (
    <Modal
      open
      onClose={onClose}
      title={`${nm(stage, 'name')} — ${momentLabel}`}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            {t('cancel')}
          </button>
          <button className="btn-primary" onClick={submit} disabled={busy || !fieldRef}>
            {t('save')}
          </button>
        </>
      }
    >
      <Field label={lang === 'ru' ? 'Поле' : 'Maydon'} required>
        <select className="input" value={fieldRef} onChange={(e) => setFieldRef(e.target.value)} autoFocus>
          <option value="">—</option>
          <optgroup label={lang === 'ru' ? 'Системные' : 'Tizim maydonlari'}>
            {available
              .filter((r) => r.kind === 'system')
              .map((r) => (
                <option key={r.field_ref} value={r.field_ref}>
                  {lang === 'ru' ? r.label_ru : r.label_uz}
                </option>
              ))}
          </optgroup>
          <optgroup label={lang === 'ru' ? 'Дополнительные' : 'Qo‘shimcha maydonlar'}>
            {available
              .filter((r) => r.kind === 'custom')
              .map((r) => (
                <option key={r.field_ref} value={r.field_ref}>
                  {lang === 'ru' ? r.label_ru : r.label_uz}
                </option>
              ))}
          </optgroup>
        </select>
      </Field>

      <Field
        label={lang === 'ru' ? 'Своё сообщение (RU)' : 'O‘z xabaringiz (RU)'}
        hint={lang === 'ru' ? 'Пусто — текст сгенерируется сам' : 'Bo‘sh — matn avtomatik yaratiladi'}
      >
        <input className="input" value={msgRu} onChange={(e) => setMsgRu(e.target.value)} />
      </Field>
      <Field label={lang === 'ru' ? 'Своё сообщение (UZ)' : 'O‘z xabaringiz (UZ)'}>
        <input className="input" value={msgUz} onChange={(e) => setMsgUz(e.target.value)} />
      </Field>
    </Modal>
  )
}
