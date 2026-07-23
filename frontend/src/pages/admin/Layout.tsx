import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { api, errText } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useLang, useT } from '@/i18n'
import { Confirm, Field, Modal, Spinner } from '@/components/ui'
import { toast } from '@/components/Toast'
import type { LayoutSection } from '@/lib/types'

const OTHER_CODE = '_other'

export default function AdminLayout() {
  const { me } = useAuth()
  const t = useT()
  const lang = useLang((s) => s.lang)
  const qc = useQueryClient()

  const [sections, setSections] = useState<LayoutSection[]>([])
  const [creating, setCreating] = useState(false)
  const [renaming, setRenaming] = useState<LayoutSection | null>(null)
  const [deleting, setDeleting] = useState<LayoutSection | null>(null)
  const [deleteError, setDeleteError] = useState(false)
  const [adding, setAdding] = useState<LayoutSection | null>(null)

  const { data = [], isLoading } = useQuery({
    queryKey: ['order-layout'],
    queryFn: async () => (await api.get<LayoutSection[]>('/order-layout')).data,
    enabled: !!me?.is_super,
  })

  useEffect(() => setSections(data), [data])

  if (!me?.is_super) return <Navigate to="/" replace />
  if (isLoading) return <Spinner />

  const realSections = sections.filter((s) => s.id !== null)
  const other = sections.find((s) => s.id === null) ?? null

  const dirty = JSON.stringify(sections) !== JSON.stringify(data)

  function moveField(fieldRef: string, fromCode: string, toCode: string) {
    setSections((prev) => {
      let field = null as LayoutSection['fields'][number] | null
      let next = prev.map((s) => {
        if (s.code !== fromCode) return s
        const f = s.fields.find((x) => x.field_ref === fieldRef)
        if (f) field = f
        return { ...s, fields: s.fields.filter((x) => x.field_ref !== fieldRef) }
      })
      if (!field) return prev
      const hasTarget = next.some((s) => s.code === toCode)
      if (!hasTarget) {
        next = [...next, { id: null, code: OTHER_CODE, name_ru: 'Другое', name_uz: 'Boshqa', sort: 10 ** 9, fields: [] }]
      }
      next = next.map((s) => (s.code === toCode ? { ...s, fields: [...s.fields, field!] } : s))
      return next.filter((s) => s.id !== null || s.fields.length > 0)
    })
  }

  function shiftField(sectionCode: string, index: number, dir: -1 | 1) {
    setSections((prev) =>
      prev.map((s) => {
        if (s.code !== sectionCode) return s
        const target = index + dir
        if (target < 0 || target >= s.fields.length) return s
        const fields = [...s.fields]
        ;[fields[index], fields[target]] = [fields[target], fields[index]]
        return { ...s, fields }
      }),
    )
  }

  async function saveAssignments() {
    const items = realSections.flatMap((s) =>
      s.fields.map((f, i) => ({ section_id: s.id!, field_ref: f.field_ref, sort: (i + 1) * 100 })),
    )
    try {
      await api.put('/order-layout/assignments', { items })
      toast(t('saved'))
      qc.invalidateQueries({ queryKey: ['order-layout'] })
    } catch (e) {
      toast(errText(e, lang), 'error')
    }
  }

  async function shiftSection(index: number, dir: -1 | 1) {
    const next = [...realSections]
    const target = index + dir
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    try {
      await api.post('/order-layout/sections/reorder', {
        items: next.map((s, i) => ({ id: s.id, sort: (i + 1) * 100 })),
      })
      qc.invalidateQueries({ queryKey: ['order-layout'] })
    } catch (e) {
      toast(errText(e, lang), 'error')
    }
  }

  async function removeSection(force: boolean) {
    if (!deleting) return
    try {
      await api.delete(`/order-layout/sections/${deleting.id}`, { params: force ? { force: true } : undefined })
      toast(t('saved'))
      qc.invalidateQueries({ queryKey: ['order-layout'] })
      setDeleting(null)
      setDeleteError(false)
    } catch (e) {
      const detail = (e as any)?.response?.data?.detail
      if (detail?.error === 'section_has_fields' && !force) {
        setDeleteError(true)
      } else {
        toast(errText(e, lang), 'error')
        setDeleting(null)
      }
    }
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-xs text-ink-faint">
          {lang === 'ru'
            ? 'Разделы и порядок полей на форме создания проекта и во вкладке «Инфо» проекта. Видно только вам (супер-админу).'
            : 'Loyiha yaratish formasi va loyihaning «Info» tabidagi bo‘limlar/maydonlar tartibi. Faqat sizga (super-admin) ko‘rinadi.'}
        </p>
        <button className="btn-primary shrink-0" onClick={() => setCreating(true)}>
          + {t('add')}
        </button>
      </div>

      <div className="space-y-3">
        {realSections.map((s, si) => (
          <div key={s.code} className="card p-3">
            <div className="mb-2 flex items-center gap-2">
              <div className="flex flex-col">
                <button
                  onClick={() => shiftSection(si, -1)}
                  disabled={si === 0}
                  className="text-xs text-ink-faint hover:text-brand-600 disabled:opacity-20"
                >
                  ▲
                </button>
                <button
                  onClick={() => shiftSection(si, 1)}
                  disabled={si === realSections.length - 1}
                  className="text-xs text-ink-faint hover:text-brand-600 disabled:opacity-20"
                >
                  ▼
                </button>
              </div>
              <span className="flex-1 text-sm font-semibold">{lang === 'ru' ? s.name_ru : s.name_uz}</span>
              <button className="text-xs text-ink-faint hover:text-ink" onClick={() => setRenaming(s)}>
                ✎
              </button>
              <button
                className="text-xs text-ink-faint hover:text-rose-600"
                onClick={() => {
                  setDeleting(s)
                  setDeleteError(false)
                }}
              >
                ✕
              </button>
            </div>

            <FieldList
              section={s}
              allSections={sections}
              onShift={(i, dir) => shiftField(s.code, i, dir)}
              onMoveTo={(ref, toCode) => moveField(ref, s.code, toCode)}
              onAdd={() => setAdding(s)}
            />
          </div>
        ))}

        {other && other.fields.length > 0 && (
          <div className="card border-dashed p-3 opacity-80">
            <div className="mb-2 text-sm font-semibold text-ink-faint">
              {lang === 'ru' ? 'Другое (ещё не распределено)' : 'Boshqa (hali taqsimlanmagan)'}
            </div>
            <FieldList
              section={other}
              allSections={sections}
              onShift={(i, dir) => shiftField(OTHER_CODE, i, dir)}
              onMoveTo={(ref, toCode) => moveField(ref, OTHER_CODE, toCode)}
              onAdd={null}
            />
          </div>
        )}
      </div>

      {dirty && (
        <div className="sticky bottom-0 z-20 mt-4 flex items-center justify-end gap-2 border-t border-surface-border bg-white/95 px-2 py-2.5 shadow-pop backdrop-blur dark:border-[#2a3140] dark:bg-[#151a23]/95">
          <button className="btn-ghost" onClick={() => setSections(data)}>
            {t('cancel')}
          </button>
          <button className="btn-primary" onClick={saveAssignments}>
            {lang === 'ru' ? 'Сохранить расположение' : 'Joylashuvni saqlash'}
          </button>
        </div>
      )}

      {creating && <SectionForm onClose={() => setCreating(false)} onDone={() => qc.invalidateQueries({ queryKey: ['order-layout'] })} />}
      {renaming && (
        <SectionForm section={renaming} onClose={() => setRenaming(null)} onDone={() => qc.invalidateQueries({ queryKey: ['order-layout'] })} />
      )}
      {adding && (
        <AddFieldModal
          section={adding}
          allSections={sections}
          onClose={() => setAdding(null)}
          onPick={(ref, fromCode) => {
            moveField(ref, fromCode, adding.code)
            setAdding(null)
          }}
        />
      )}

      <Confirm
        open={!!deleting && !deleteError}
        text={deleting ? `${lang === 'ru' ? deleting.name_ru : deleting.name_uz}` : ''}
        onCancel={() => setDeleting(null)}
        onOk={() => removeSection(false)}
      />
      {deleting && deleteError && (
        <Modal
          open
          onClose={() => setDeleting(null)}
          title={lang === 'ru' ? 'В разделе есть поля' : 'Bo‘limda maydonlar bor'}
          footer={
            <>
              <button className="btn-ghost" onClick={() => setDeleting(null)}>
                {t('cancel')}
              </button>
              <button className="btn-danger" onClick={() => removeSection(true)}>
                {lang === 'ru' ? 'Всё равно удалить' : 'Baribir o‘chirish'}
              </button>
            </>
          }
        >
          <p className="text-sm text-ink-soft">
            {lang === 'ru'
              ? 'Сначала переместите поля в другой раздел, или удалите раздел вместе с полями — они попадут в «Другое».'
              : 'Avval maydonlarni boshqa bo‘limga ko‘chiring, yoki bo‘limni maydonlari bilan o‘chiring — ular «Boshqa»ga tushadi.'}
          </p>
        </Modal>
      )}
    </div>
  )
}

function FieldList({
  section,
  allSections,
  onShift,
  onMoveTo,
  onAdd,
}: {
  section: LayoutSection
  allSections: LayoutSection[]
  onShift: (index: number, dir: -1 | 1) => void
  onMoveTo: (fieldRef: string, toCode: string) => void
  onAdd: (() => void) | null
}) {
  const lang = useLang((s) => s.lang)
  const t = useT()
  const otherSections = allSections.filter((s) => s.code !== section.code)

  return (
    <div className="space-y-1">
      {section.fields.length === 0 ? (
        <div className="py-1 text-[11px] text-ink-faint">—</div>
      ) : (
        section.fields.map((f, i) => (
          <div
            key={f.field_ref}
            className="flex items-center gap-2 rounded-md bg-surface-muted px-2 py-1.5 text-xs dark:bg-[#242b38]"
          >
            <div className="flex flex-col">
              <button
                onClick={() => onShift(i, -1)}
                disabled={i === 0}
                className="text-[10px] leading-none text-ink-faint hover:text-brand-600 disabled:opacity-20"
              >
                ▲
              </button>
              <button
                onClick={() => onShift(i, 1)}
                disabled={i === section.fields.length - 1}
                className="text-[10px] leading-none text-ink-faint hover:text-brand-600 disabled:opacity-20"
              >
                ▼
              </button>
            </div>
            <span
              className={clsx(
                'chip shrink-0',
                f.kind === 'system' ? 'bg-slate-100 text-slate-600 dark:bg-slate-800' : 'bg-brand-50 text-brand-700 dark:bg-brand-900/25',
              )}
            >
              {f.kind === 'system' ? (lang === 'ru' ? 'сист' : 'tizim') : 'cf'}
            </span>
            <span className="min-w-0 flex-1 truncate">{lang === 'ru' ? f.label_ru : f.label_uz}</span>
            <select
              className="input h-7 w-32 shrink-0 py-0 text-[11px]"
              value=""
              onChange={(e) => {
                if (e.target.value) onMoveTo(f.field_ref, e.target.value)
              }}
            >
              <option value="">{lang === 'ru' ? 'Переместить…' : "Ko'chirish…"}</option>
              {otherSections.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.code === '_other' ? (lang === 'ru' ? 'Другое' : 'Boshqa') : lang === 'ru' ? s.name_ru : s.name_uz}
                </option>
              ))}
            </select>
          </div>
        ))
      )}
      {onAdd && (
        <button onClick={onAdd} className="mt-1 text-[11px] text-brand-600 hover:underline">
          + {t('add')}
        </button>
      )}
    </div>
  )
}

function AddFieldModal({
  section,
  allSections,
  onClose,
  onPick,
}: {
  section: LayoutSection
  allSections: LayoutSection[]
  onClose: () => void
  onPick: (fieldRef: string, fromCode: string) => void
}) {
  const lang = useLang((s) => s.lang)
  const t = useT()
  const [value, setValue] = useState('')

  const candidates = allSections
    .filter((s) => s.code !== section.code)
    .flatMap((s) => s.fields.map((f) => ({ ...f, fromCode: s.code })))

  const system = candidates.filter((f) => f.kind === 'system')
  const custom = candidates.filter((f) => f.kind === 'custom')

  return (
    <Modal
      open
      onClose={onClose}
      title={lang === 'ru' ? 'Добавить поле' : 'Maydon qo‘shish'}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            {t('cancel')}
          </button>
          <button
            className="btn-primary"
            disabled={!value}
            onClick={() => {
              const found = candidates.find((f) => f.field_ref === value)
              if (found) onPick(found.field_ref, found.fromCode)
            }}
          >
            {t('add')}
          </button>
        </>
      }
    >
      <Field label={lang === 'ru' ? 'Поле' : 'Maydon'}>
        <select className="input" value={value} onChange={(e) => setValue(e.target.value)} autoFocus>
          <option value="">—</option>
          <optgroup label={lang === 'ru' ? 'Системные' : 'Tizim maydonlari'}>
            {system.map((f) => (
              <option key={f.field_ref} value={f.field_ref}>
                {lang === 'ru' ? f.label_ru : f.label_uz}
              </option>
            ))}
          </optgroup>
          <optgroup label={lang === 'ru' ? 'Дополнительные' : "Qo'shimcha maydonlar"}>
            {custom.map((f) => (
              <option key={f.field_ref} value={f.field_ref}>
                {lang === 'ru' ? f.label_ru : f.label_uz}
              </option>
            ))}
          </optgroup>
        </select>
      </Field>
    </Modal>
  )
}

function SectionForm({
  section,
  onClose,
  onDone,
}: {
  section?: LayoutSection
  onClose: () => void
  onDone: () => void
}) {
  const t = useT()
  const lang = useLang((s) => s.lang)
  const [code, setCode] = useState(section?.code ?? '')
  const [nameRu, setNameRu] = useState(section?.name_ru ?? '')
  const [nameUz, setNameUz] = useState(section?.name_uz ?? '')
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    try {
      if (section) {
        await api.patch(`/order-layout/sections/${section.id}`, { name_ru: nameRu, name_uz: nameUz })
      } else {
        await api.post('/order-layout/sections', { code, name_ru: nameRu, name_uz: nameUz, sort: 100 })
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
      title={section ? t('edit') : (lang === 'ru' ? 'Новый раздел' : 'Yangi bo‘lim')}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            {t('cancel')}
          </button>
          <button className="btn-primary" disabled={busy || !nameRu || !nameUz || (!section && !code)} onClick={submit}>
            {t('save')}
          </button>
        </>
      }
    >
      {!section && (
        <Field label="Code" hint={lang === 'ru' ? 'латиницей, для системы' : 'lotinchada, tizim uchun'} required>
          <input className="input" value={code} onChange={(e) => setCode(e.target.value.toLowerCase())} autoFocus />
        </Field>
      )}
      <Field label={lang === 'ru' ? 'Название (RU)' : 'Nomi (RU)'} required>
        <input className="input" value={nameRu} onChange={(e) => setNameRu(e.target.value)} />
      </Field>
      <Field label={lang === 'ru' ? 'Название (UZ)' : 'Nomi (UZ)'} required>
        <input className="input" value={nameUz} onChange={(e) => setNameUz(e.target.value)} />
      </Field>
    </Modal>
  )
}
