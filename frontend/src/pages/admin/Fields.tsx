import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { api, errText } from '@/lib/api'
import { useLang, useT } from '@/i18n'
import { Badge, Empty, Field, Modal, Spinner, Tabs } from '@/components/ui'
import { toast } from '@/components/Toast'
import type { CustomField } from '@/lib/types'

const ENTITY_LABEL: Record<string, { ru: string; uz: string }> = {
  order: { ru: 'Проект', uz: 'Proyekt' },
  patient: { ru: 'Пациент', uz: 'Patsent' },
  doctor: { ru: 'Врач', uz: 'Vrach' },
  user: { ru: 'Сотрудник', uz: 'Xodim' },
}

const TYPE_LABEL: Record<string, { ru: string; uz: string }> = {
  string: { ru: 'Строка', uz: 'Satr' },
  text: { ru: 'Текст', uz: 'Matn' },
  int: { ru: 'Целое число', uz: 'Butun son' },
  decimal: { ru: 'Дробное число', uz: 'Kasrli son' },
  date: { ru: 'Дата', uz: 'Sana' },
  datetime: { ru: 'Дата и время', uz: 'Sana va vaqt' },
  bool: { ru: 'Да/Нет', uz: 'Ha/Yo‘q' },
  select: { ru: 'Список (один)', uz: 'Ro‘yxat (bitta)' },
  multiselect: { ru: 'Список (несколько)', uz: 'Ro‘yxat (bir nechta)' },
  user: { ru: 'Сотрудник', uz: 'Xodim' },
}

export default function AdminFields() {
  const t = useT()
  const lang = useLang((s) => s.lang)
  const qc = useQueryClient()

  const [entity, setEntity] = useState('order')
  const [edit, setEdit] = useState<CustomField | null>(null)
  const [creating, setCreating] = useState(false)
  const [del, setDel] = useState<CustomField | null>(null)

  const { data = [], isLoading } = useQuery({
    queryKey: ['admin-fields', entity],
    queryFn: async () =>
      (await api.get<CustomField[]>('/admin/fields', { params: { entity } })).data,
  })

  async function remove(hard: boolean) {
    if (!del) return
    try {
      await api.delete(`/admin/fields/${del.id}`, { params: { hard } })
      toast(t('saved'))
      qc.invalidateQueries({ queryKey: ['admin-fields'] })
      qc.invalidateQueries({ queryKey: ['fields'] })
    } catch (e) {
      toast(errText(e, lang), 'error')
    } finally {
      setDel(null)
    }
  }

  return (
    <div>
      <p className="mb-3 text-xs text-ink-faint">
        {lang === 'ru'
          ? 'Дополнительные поля появляются в формах и карточках. Их можно сделать обязательными на конкретном этапе — во вкладке «Обязательные поля».'
          : 'Qo‘shimcha maydonlar formalar va kartalarda chiqadi. Ularni «Majburiy maydonlar» bo‘limida aniq bosqichda majburiy qilish mumkin.'}
      </p>

      <Tabs
        value={entity}
        onChange={setEntity}
        items={Object.keys(ENTITY_LABEL).map((k) => ({
          value: k,
          label: ENTITY_LABEL[k][lang],
        }))}
      />

      <div className="my-3 flex justify-end">
        <button className="btn-primary" onClick={() => setCreating(true)}>
          + {t('add')}
        </button>
      </div>

      {isLoading ? (
        <Spinner />
      ) : data.length === 0 ? (
        <Empty />
      ) : (
        <div className="card divide-y divide-surface-border dark:divide-[#2a3140]">
          {data.map((f) => (
            <div key={f.id} className={clsx('flex items-center gap-3 p-3', !f.is_active && 'opacity-50')}>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{lang === 'ru' ? f.label_ru : f.label_uz}</span>
                  <span className="font-mono text-[10px] text-ink-faint">{f.code}</span>
                  <Badge>{TYPE_LABEL[f.type]?.[lang] ?? f.type}</Badge>
                  {f.required_on_create && <Badge color="#e11d48">{t('required')}</Badge>}
                  {!f.is_active && <Badge>off</Badge>}
                </div>
                <div className="mt-0.5 flex gap-2 text-[11px] text-ink-faint">
                  {f.show_in_card && <span>▦ карточка</span>}
                  {f.show_in_list && <span>☰ список</span>}
                  {f.options && <span>{f.options.length} вариантов</span>}
                </div>
              </div>

              <button onClick={() => setEdit(f)} className="rounded p-1 text-ink-faint hover:text-brand-600">
                ✎
              </button>
              <button onClick={() => setDel(f)} className="rounded p-1 text-ink-faint hover:text-rose-600">
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {(creating || edit) && (
        <FieldForm
          entity={entity}
          field={edit ?? undefined}
          onClose={() => {
            setCreating(false)
            setEdit(null)
          }}
          onDone={() => {
            qc.invalidateQueries({ queryKey: ['admin-fields'] })
            qc.invalidateQueries({ queryKey: ['fields'] })
          }}
        />
      )}

      {del && (
        <Modal
          open
          onClose={() => setDel(null)}
          title={t('confirm_delete')}
          footer={
            <>
              <button className="btn-ghost" onClick={() => setDel(null)}>
                {t('cancel')}
              </button>
              <button className="btn-ghost" onClick={() => remove(false)}>
                {lang === 'ru' ? 'Только отключить' : 'Faqat o‘chirib qo‘yish'}
              </button>
              <button className="btn-danger" onClick={() => remove(true)}>
                {lang === 'ru' ? 'Удалить со значениями' : 'Qiymatlari bilan o‘chirish'}
              </button>
            </>
          }
        >
          <p className="text-sm">{lang === 'ru' ? del.label_ru : del.label_uz}</p>
          <p className="mt-2 text-xs text-rose-600">
            {lang === 'ru'
              ? 'Полное удаление сотрёт все заполненные значения этого поля во всех записях. Отключение — сохранит данные, но уберёт поле из форм.'
              : 'To‘liq o‘chirish barcha yozuvlardagi qiymatlarni ham o‘chiradi. O‘chirib qo‘yish — ma’lumot saqlanadi, faqat formadan yo‘qoladi.'}
          </p>
        </Modal>
      )}
    </div>
  )
}

function FieldForm({
  entity,
  field,
  onClose,
  onDone,
}: {
  entity: string
  field?: CustomField
  onClose: () => void
  onDone: () => void
}) {
  const t = useT()
  const lang = useLang((s) => s.lang)
  const edit = Boolean(field)

  const [form, setForm] = useState({
    code: field?.code ?? '',
    label_ru: field?.label_ru ?? '',
    label_uz: field?.label_uz ?? '',
    type: field?.type ?? 'string',
    hint_ru: field?.hint_ru ?? '',
    hint_uz: field?.hint_uz ?? '',
    required_on_create: field?.required_on_create ?? false,
    show_in_card: field?.show_in_card ?? true,
    show_in_list: field?.show_in_list ?? false,
    sort: field?.sort ?? 100,
    is_active: field?.is_active ?? true,
  })
  const [options, setOptions] = useState(field?.options ?? [])
  const [busy, setBusy] = useState(false)

  const needOptions = form.type === 'select' || form.type === 'multiselect'

  async function submit() {
    setBusy(true)
    const body: Record<string, unknown> = {
      label_ru: form.label_ru.trim(),
      label_uz: form.label_uz.trim(),
      hint_ru: form.hint_ru || null,
      hint_uz: form.hint_uz || null,
      options: needOptions ? options : null,
      required_on_create: form.required_on_create,
      show_in_card: form.show_in_card,
      show_in_list: form.show_in_list,
      sort: form.sort,
    }
    try {
      if (edit) {
        await api.patch(`/admin/fields/${field!.id}`, { ...body, is_active: form.is_active })
      } else {
        await api.post('/admin/fields', {
          ...body,
          entity,
          code: form.code.trim(),
          type: form.type,
        })
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
      wide
      title={edit ? t('edit') : t('add')}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            {t('cancel')}
          </button>
          <button
            className="btn-primary"
            onClick={submit}
            disabled={
              busy ||
              !form.label_ru.trim() ||
              !form.label_uz.trim() ||
              (!edit && !form.code.trim()) ||
              (needOptions && options.length === 0)
            }
          >
            {t('save')}
          </button>
        </>
      }
    >
      <div className="grid gap-x-3 sm:grid-cols-2">
        {!edit && (
          <>
            <Field label="Код (латиница)" required hint="напр. tooth_color">
              <input
                className="input"
                value={form.code}
                onChange={(e) =>
                  setForm({ ...form, code: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })
                }
                autoFocus
              />
            </Field>

            <Field label="Тип / Turi" required>
              <select
                className="input"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
              >
                {Object.keys(TYPE_LABEL).map((k) => (
                  <option key={k} value={k}>
                    {TYPE_LABEL[k][lang]}
                  </option>
                ))}
              </select>
            </Field>
          </>
        )}

        <Field label="Название (RU)" required>
          <input
            className="input"
            value={form.label_ru}
            onChange={(e) => setForm({ ...form, label_ru: e.target.value })}
          />
        </Field>
        <Field label="Nomi (UZ)" required>
          <input
            className="input"
            value={form.label_uz}
            onChange={(e) => setForm({ ...form, label_uz: e.target.value })}
          />
        </Field>

        <Field label="Подсказка (RU)">
          <input
            className="input"
            value={form.hint_ru}
            onChange={(e) => setForm({ ...form, hint_ru: e.target.value })}
          />
        </Field>
        <Field label="Izoh (UZ)">
          <input
            className="input"
            value={form.hint_uz}
            onChange={(e) => setForm({ ...form, hint_uz: e.target.value })}
          />
        </Field>
      </div>

      {needOptions && (
        <Field label="Варианты / Variantlar" required>
          <div className="space-y-1.5">
            {options.map((o, i) => (
              <div key={i} className="flex gap-1.5">
                <input
                  className="input w-28 font-mono text-xs"
                  placeholder="код"
                  value={o.value}
                  onChange={(e) => {
                    const next = [...options]
                    next[i] = { ...o, value: e.target.value }
                    setOptions(next)
                  }}
                />
                <input
                  className="input flex-1"
                  placeholder="RU"
                  value={o.label_ru}
                  onChange={(e) => {
                    const next = [...options]
                    next[i] = { ...o, label_ru: e.target.value }
                    setOptions(next)
                  }}
                />
                <input
                  className="input flex-1"
                  placeholder="UZ"
                  value={o.label_uz}
                  onChange={(e) => {
                    const next = [...options]
                    next[i] = { ...o, label_uz: e.target.value }
                    setOptions(next)
                  }}
                />
                <button
                  onClick={() => setOptions(options.filter((_, x) => x !== i))}
                  className="btn-ghost px-2 text-rose-600"
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              onClick={() =>
                setOptions([...options, { value: `opt${options.length + 1}`, label_ru: '', label_uz: '' }])
              }
              className="btn-ghost text-xs"
            >
              + {t('add')}
            </button>
          </div>
        </Field>
      )}

      <div className="space-y-1.5">
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.required_on_create}
            onChange={(e) => setForm({ ...form, required_on_create: e.target.checked })}
          />
          {lang === 'ru' ? 'Обязательно при создании' : 'Yaratishda majburiy'}
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.show_in_card}
            onChange={(e) => setForm({ ...form, show_in_card: e.target.checked })}
          />
          {lang === 'ru' ? 'Показывать в карточке' : 'Kartada ko‘rsatish'}
        </label>
        {edit && (
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
            />
            {t('active')}
          </label>
        )}
      </div>
    </Modal>
  )
}
