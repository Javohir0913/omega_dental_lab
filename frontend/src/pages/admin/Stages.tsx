import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { api, errText } from '@/lib/api'
import { useLang, useNm, useT } from '@/i18n'
import { Badge, Confirm, Field, Modal, NumberInput, Spinner } from '@/components/ui'
import { toast } from '@/components/Toast'
import type { Stage } from '@/lib/types'

const PRESET_COLORS = [
  '#64748b', '#0ea5e9', '#6366f1', '#8b5cf6', '#d946ef',
  '#f59e0b', '#14b8a6', '#22c55e', '#ef4444', '#78716c',
]

export default function AdminStages() {
  const t = useT()
  const nm = useNm()
  const lang = useLang((s) => s.lang)
  const qc = useQueryClient()

  const [edit, setEdit] = useState<Stage | null>(null)
  const [creating, setCreating] = useState(false)
  const [del, setDel] = useState<Stage | null>(null)
  const [list, setList] = useState<Stage[]>([])

  const { data = [], isLoading } = useQuery({
    queryKey: ['stages-admin'],
    queryFn: async () => (await api.get<Stage[]>('/stages', { params: { include_inactive: true } })).data,
  })

  useEffect(() => setList(data), [data])

  /** Ustunlar tartibini almashtirish (yuqori/past). Tizim ustunlari ham suriladi. */
  async function shift(index: number, dir: -1 | 1) {
    const next = [...list]
    const target = index + dir
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    setList(next)
    try {
      await api.post('/stages/reorder', {
        items: next.map((s, i) => ({ id: s.id, sort: (i + 1) * 100 })),
      })
      qc.invalidateQueries({ queryKey: ['stages-admin'] })
      qc.invalidateQueries({ queryKey: ['stages'] })
      qc.invalidateQueries({ queryKey: ['kanban'] })
    } catch (e) {
      toast(errText(e, lang), 'error')
      setList(data)
    }
  }

  async function remove() {
    if (!del) return
    try {
      await api.delete(`/stages/${del.id}`)
      toast(t('saved'))
      qc.invalidateQueries({ queryKey: ['stages-admin'] })
      qc.invalidateQueries({ queryKey: ['stages'] })
    } catch (e) {
      const detail = (e as any)?.response?.data?.detail
      if (detail?.error === 'stage_has_orders') {
        toast(
          lang === 'ru'
            ? 'В этапе есть проекты — его можно только отключить, не удалить'
            : 'Bosqichda proyektlar bor — uni faqat o‘chirib qo‘yish mumkin',
          'error',
        )
      } else {
        toast(errText(e, lang), 'error')
      }
    } finally {
      setDel(null)
    }
  }

  if (isLoading) return <Spinner />

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-xs text-ink-faint">
          {lang === 'ru'
            ? 'Порядок колонок = маршрут работы. «Новый», «Успех» и «Провал» — системные: их нельзя удалить или отключить, но можно переименовать и перекрасить.'
            : 'Ustunlar tartibi = ish marshruti. «Yangi», «Muvaffaqiyat» va «Muvaffaqiyatsiz» — tizim ustunlari: o‘chirib bo‘lmaydi, lekin nomi va rangi o‘zgartiriladi.'}
        </p>
        <button className="btn-primary shrink-0" onClick={() => setCreating(true)}>
          + {t('add')}
        </button>
      </div>

      <div className="card divide-y divide-surface-border dark:divide-[#2a3140]">
        {list.map((s, i) => (
          <div key={s.id} className={clsx('flex items-center gap-3 p-3', !s.is_active && 'opacity-50')}>
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

            <span className="h-6 w-1.5 shrink-0 rounded-full" style={{ background: s.color }} />

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{nm(s, 'name')}</span>
                <span className="font-mono text-[10px] text-ink-faint">{s.code}</span>
                {s.kind !== 'work' && <Badge color="#7c3aed">{t('system_stage')}</Badge>}
                {!s.is_active && <Badge>off</Badge>}
              </div>
              <div className="mt-0.5 flex flex-wrap gap-2 text-[11px] text-ink-faint">
                {s.duration_hours ? <span>⏱ {s.duration_hours} ч</span> : null}
                {s.allow_claim && <span>✋ {t('allow_claim')}</span>}
                {s.require_next_assignee && <span>👤 {t('require_next_assignee')}</span>}
              </div>
            </div>

            <button
              onClick={() => setEdit(s)}
              className="rounded p-1 text-ink-faint hover:text-brand-600"
            >
              ✎
            </button>
            {s.kind === 'work' && (
              <button
                onClick={() => setDel(s)}
                className="rounded p-1 text-ink-faint hover:text-rose-600"
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>

      {(creating || edit) && (
        <StageForm
          stage={edit ?? undefined}
          allStages={list}
          onClose={() => {
            setCreating(false)
            setEdit(null)
          }}
          onDone={() => {
            qc.invalidateQueries({ queryKey: ['stages-admin'] })
            qc.invalidateQueries({ queryKey: ['stages'] })
            qc.invalidateQueries({ queryKey: ['kanban'] })
          }}
        />
      )}

      <Confirm open={Boolean(del)} text={del?.name_ru ?? ''} onCancel={() => setDel(null)} onOk={remove} />
    </div>
  )
}

function StageForm({
  stage,
  allStages,
  onClose,
  onDone,
}: {
  stage?: Stage
  allStages: Stage[]
  onClose: () => void
  onDone: () => void
}) {
  const t = useT()
  const nm = useNm()
  const lang = useLang((s) => s.lang)
  const edit = Boolean(stage)

  const [form, setForm] = useState({
    code: stage?.code ?? '',
    name_ru: stage?.name_ru ?? '',
    name_uz: stage?.name_uz ?? '',
    color: stage?.color ?? PRESET_COLORS[1],
    sort: stage?.sort ?? 100,
    duration_hours: stage?.duration_hours ?? ('' as number | ''),
    allow_claim: stage?.allow_claim ?? true,
    require_next_assignee: stage?.require_next_assignee ?? false,
    is_active: stage?.is_active ?? true,
  })
  const [nextStageIds, setNextStageIds] = useState<number[]>(stage?.next_stage_ids ?? [])
  const [incomingStageIds, setIncomingStageIds] = useState<number[]>(stage?.incoming_stage_ids ?? [])
  const [busy, setBusy] = useState(false)

  function toggleNextStage(id: number) {
    setNextStageIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  }

  function toggleIncomingStage(id: number) {
    setIncomingStageIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  }

  async function submit() {
    setBusy(true)
    const body: Record<string, unknown> = {
      name_ru: form.name_ru.trim(),
      name_uz: form.name_uz.trim(),
      color: form.color,
      sort: form.sort,
      duration_hours: form.duration_hours === '' ? null : Number(form.duration_hours),
      allow_claim: form.allow_claim,
      require_next_assignee: form.require_next_assignee,
      next_stage_ids: nextStageIds,
      incoming_stage_ids: incomingStageIds,
    }
    try {
      if (edit) {
        await api.patch(`/stages/${stage!.id}`, { ...body, is_active: form.is_active })
      } else {
        await api.post('/stages', { ...body, code: form.code.trim() })
      }
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
      title={edit ? `${stage!.name_ru} — ${t('edit')}` : t('add')}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            {t('cancel')}
          </button>
          <button
            className="btn-primary"
            onClick={submit}
            disabled={busy || !form.name_ru.trim() || !form.name_uz.trim() || (!edit && !form.code.trim())}
          >
            {t('save')}
          </button>
        </>
      }
    >
      {!edit && (
        <Field label="Код (латиница)" required hint="напр. polirovka">
          <input
            className="input"
            value={form.code}
            onChange={(e) =>
              setForm({ ...form, code: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })
            }
            autoFocus
          />
        </Field>
      )}

      <div className="grid gap-x-3 sm:grid-cols-2">
        <Field label="Название (RU)" required>
          <input
            className="input"
            value={form.name_ru}
            onChange={(e) => setForm({ ...form, name_ru: e.target.value })}
          />
        </Field>
        <Field label="Nomi (UZ)" required>
          <input
            className="input"
            value={form.name_uz}
            onChange={(e) => setForm({ ...form, name_uz: e.target.value })}
          />
        </Field>
      </div>

      <Field label={t('stage_color')}>
        <div className="flex flex-wrap items-center gap-1.5">
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setForm({ ...form, color: c })}
              className={clsx(
                'h-7 w-7 rounded-md border-2 transition-transform',
                form.color === c ? 'scale-110 border-ink' : 'border-transparent',
              )}
              style={{ background: c }}
            />
          ))}
          <input
            type="color"
            value={form.color}
            onChange={(e) => setForm({ ...form, color: e.target.value })}
            className="h-7 w-9 cursor-pointer rounded border border-surface-border"
          />
        </div>
      </Field>

      {stage?.kind !== 'success' && stage?.kind !== 'fail' && (
        <>
          <Field
            label={t('stage_duration')}
            hint={
              lang === 'ru'
                ? 'Через сколько часов на этом этапе проект считается просроченным. Пусто — без норматива.'
                : 'Necha soatdan keyin kechikkan hisoblanadi. Bo‘sh — normativsiz.'
            }
          >
            <NumberInput
              className="input"
              value={form.duration_hours === '' ? null : form.duration_hours}
              onChange={(v) => setForm({ ...form, duration_hours: v ?? '' })}
            />
          </Field>

          <label className="mb-2 flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.allow_claim}
              onChange={(e) => setForm({ ...form, allow_claim: e.target.checked })}
            />
            {t('allow_claim')}
          </label>

          <label className="mb-2 flex cursor-pointer items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={form.require_next_assignee}
              onChange={(e) => setForm({ ...form, require_next_assignee: e.target.checked })}
            />
            <span>
              {t('require_next_assignee')}
              <span className="block text-[11px] text-ink-faint">
                {lang === 'ru'
                  ? 'При переводе на этот этап нужно обязательно выбрать, кто его делает'
                  : 'Bu bosqichga o‘tkazishda kim qilishini tanlash majburiy'}
              </span>
            </span>
          </label>
        </>
      )}

      <Field
        label={lang === 'ru' ? 'Куда можно перевести' : 'Qayerga o‘tkazish mumkin'}
        hint={
          lang === 'ru'
            ? 'Если не выбрать ни одного этапа — переход отсюда открыт куда угодно (как сейчас). Если выбрать хотя бы один — только туда.'
            : 'Birorta ham bosqich tanlanmasa — bu yerdan istalgan bosqichga o‘tish mumkin (hozirgidek). Kamida bittasi tanlansa — faqat o‘sha(lar)ga.'
        }
      >
        <div className="flex flex-wrap gap-1.5">
          {allStages
            .filter((s) => s.id !== stage?.id)
            .map((s) => {
              const on = nextStageIds.includes(s.id)
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggleNextStage(s.id)}
                  className="chip border transition-all"
                  style={{
                    backgroundColor: on ? `${s.color}22` : 'transparent',
                    borderColor: on ? s.color : '#e4e7ec',
                    color: on ? s.color : '#8d96a3',
                  }}
                >
                  {nm(s, 'name')}
                </button>
              )
            })}
        </div>
      </Field>

      <Field
        label={lang === 'ru' ? 'Откуда можно перевести сюда' : 'Bu yerga qayerdan o‘tkazish mumkin'}
        hint={
          lang === 'ru'
            ? 'Если не выбрать ни одного этапа — сюда можно перейти откуда угодно (как сейчас). Если выбрать хотя бы один — только оттуда. Не трогает списки других этапов.'
            : 'Birorta ham bosqich tanlanmasa — bu yerga istalgan bosqichdan o‘tish mumkin (hozirgidek). Kamida bittasi tanlansa — faqat o‘sha(lar)dan. Boshqa bosqichlarning ro‘yxatiga tegmaydi.'
        }
      >
        <div className="flex flex-wrap gap-1.5">
          {allStages
            .filter((s) => s.id !== stage?.id)
            .map((s) => {
              const on = incomingStageIds.includes(s.id)
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggleIncomingStage(s.id)}
                  className="chip border transition-all"
                  style={{
                    backgroundColor: on ? `${s.color}22` : 'transparent',
                    borderColor: on ? s.color : '#e4e7ec',
                    color: on ? s.color : '#8d96a3',
                  }}
                >
                  {nm(s, 'name')}
                </button>
              )
            })}
        </div>
      </Field>

      {edit && stage?.kind === 'work' && (
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
