import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useLang } from '@/i18n'
import type { CustomField, Page, User } from '@/lib/types'

/** Adminkada yaratilgan qo'shimcha maydon uchun universal input. */
export function CustomFieldInput({
  field,
  value,
  onChange,
}: {
  field: CustomField
  value: unknown
  onChange: (v: unknown) => void
}) {
  const lang = useLang((s) => s.lang)
  const opts = field.options ?? []

  switch (field.type) {
    case 'text':
      return (
        <textarea
          className="input min-h-[70px]"
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value || null)}
        />
      )

    case 'int':
    case 'decimal':
      return (
        <input
          type="number"
          step={field.type === 'decimal' ? '0.01' : '1'}
          className="input"
          value={(value as number) ?? ''}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        />
      )

    case 'date':
      return (
        <input
          type="date"
          className="input"
          value={((value as string) ?? '').slice(0, 10)}
          onChange={(e) => onChange(e.target.value || null)}
        />
      )

    case 'datetime':
      return (
        <input
          type="datetime-local"
          className="input"
          value={((value as string) ?? '').slice(0, 16)}
          onChange={(e) => onChange(e.target.value || null)}
        />
      )

    case 'bool':
      return (
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
          />
          <span className="text-ink-soft">
            {lang === 'ru' ? field.label_ru : field.label_uz}
          </span>
        </label>
      )

    case 'select':
      return (
        <select
          className="input"
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value || null)}
        >
          <option value="">—</option>
          {opts.map((o) => (
            <option key={o.value} value={o.value}>
              {lang === 'ru' ? o.label_ru : o.label_uz}
            </option>
          ))}
        </select>
      )

    case 'multiselect': {
      const arr = Array.isArray(value) ? (value as string[]) : []
      return (
        <div className="flex flex-wrap gap-1.5">
          {opts.map((o) => {
            const on = arr.includes(o.value)
            return (
              <button
                key={o.value}
                type="button"
                onClick={() =>
                  onChange(on ? arr.filter((v) => v !== o.value) : [...arr, o.value])
                }
                className={
                  on
                    ? 'chip border border-brand-300 bg-brand-100 text-brand-700'
                    : 'chip border border-surface-border bg-white text-ink-soft dark:border-[#2f3745] dark:bg-[#151a23]'
                }
              >
                {lang === 'ru' ? o.label_ru : o.label_uz}
              </button>
            )
          })}
        </div>
      )
    }

    case 'user':
      return <UserSelect value={value as number | null} onChange={onChange} />

    default:
      return (
        <input
          className="input"
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value || null)}
        />
      )
  }
}

export function UserSelect({
  value,
  onChange,
  stageId,
}: {
  value: number | null
  onChange: (v: number | null) => void
  stageId?: number
}) {
  const { data } = useQuery({
    queryKey: ['users-select', stageId],
    queryFn: async () =>
      (
        await api.get<Page<User>>('/users', {
          params: { size: 200, is_active: true, stage_id: stageId },
        })
      ).data,
  })

  return (
    <select
      className="input"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
    >
      <option value="">—</option>
      {(data?.items ?? []).map((u) => (
        <option key={u.id} value={u.id}>
          {u.full_name}
        </option>
      ))}
    </select>
  )
}
