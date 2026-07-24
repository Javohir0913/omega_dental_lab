import { type ReactNode, useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { useT } from '@/i18n'

/* ---------------- Modal ---------------- */

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex animate-fade-in items-end justify-center overflow-y-auto bg-black/50 p-0 backdrop-blur-sm sm:items-start sm:p-4 sm:pt-[6vh]">
      <div
        className="absolute inset-0"
        onClick={onClose}
        aria-hidden
      />
      <div
        className={clsx(
          'card relative w-full max-h-[92dvh] animate-scale-in rounded-b-none shadow-pop sm:max-h-none sm:rounded-2xl',
          wide ? 'max-w-4xl' : 'max-w-lg',
        )}
      >
        <div className="flex items-center justify-between gap-2 border-b border-surface-border px-4 py-3 dark:border-[#2a3140]">
          <div className="min-w-0 truncate text-sm font-semibold">{title}</div>
          <button onClick={onClose} className="shrink-0 rounded p-1 text-ink-faint hover:bg-surface-muted dark:hover:bg-[#222836]">
            ✕
          </button>
        </div>
        <div className="max-h-[72dvh] overflow-y-auto px-4 py-4 sm:max-h-[70vh]">{children}</div>
        {footer && (
          <div className="flex flex-col-reverse gap-2 border-t border-surface-border px-4 py-3 dark:border-[#2a3140] sm:flex-row sm:justify-end">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

/* ---------------- Confirm ---------------- */

export function Confirm({
  open,
  text,
  onCancel,
  onOk,
}: {
  open: boolean
  text: string
  onCancel: () => void
  onOk: () => void
}) {
  const t = useT()
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={t('confirm_delete')}
      footer={
        <>
          <button className="btn-ghost" onClick={onCancel}>
            {t('cancel')}
          </button>
          <button className="btn-danger" onClick={onOk}>
            {t('delete')}
          </button>
        </>
      }
    >
      <p className="text-sm text-ink-soft">{text}</p>
    </Modal>
  )
}

/* ---------------- Field ---------------- */

export function Field({
  label,
  required,
  hint,
  error,
  children,
}: {
  label: string
  required?: boolean
  hint?: string | null
  error?: string | null
  children: ReactNode
}) {
  return (
    <div className="mb-3">
      <label className="label">
        {label}
        {required && <span className="ml-0.5 text-rose-500">*</span>}
      </label>
      {children}
      {hint && !error && <div className="mt-1 text-[11px] text-ink-faint">{hint}</div>}
      {error && <div className="mt-1 text-[11px] text-rose-600">{error}</div>}
    </div>
  )
}

/* ---------------- SearchSelect ---------------- */

export function SearchSelect<T extends { id: number; label: string; sub?: string }>({
  items,
  value,
  onChange,
  search,
  onSearchChange,
  placeholder,
  clearLabel,
}: {
  items: T[]
  value: number | null
  onChange: (id: number | null) => void
  search: string
  onSearchChange: (v: string) => void
  placeholder: string
  clearLabel?: string
}) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const selected = items.find((i) => i.id === value)

  return (
    <div className="relative" ref={ref}>
      <input
        className="input w-full"
        value={open ? search : (selected?.label ?? '')}
        placeholder={placeholder}
        onFocus={() => { setOpen(true); onSearchChange('') }}
        onChange={(e) => onSearchChange(e.target.value)}
      />
      {open && (
        <div className="absolute left-0 right-0 z-20 mt-1 max-h-48 overflow-y-auto rounded-lg border border-surface-border bg-white shadow-pop dark:border-[#2f3745] dark:bg-[#1e2533]">
          <button
            type="button"
            className="w-full px-3 py-1.5 text-left text-xs text-ink-faint hover:bg-surface-muted dark:hover:bg-[#222836]"
            onClick={() => { onChange(null); setOpen(false) }}
          >
            — {clearLabel ?? t('free')}
          </button>
          {items.map((item) => (
            <button
              type="button"
              key={item.id}
              className={`w-full px-3 py-1.5 text-left text-sm hover:bg-surface-muted dark:hover:bg-[#222836] ${value === item.id ? 'bg-brand-50 font-medium dark:bg-brand-900/20' : ''}`}
              onClick={() => { onChange(item.id); setOpen(false); onSearchChange('') }}
            >
              <div>{item.label}</div>
              {item.sub && <div className="text-[10px] text-ink-faint">{item.sub}</div>}
            </button>
          ))}
          {items.length === 0 && <div className="px-3 py-2 text-xs text-ink-faint">{t('empty')}</div>}
        </div>
      )}
    </div>
  )
}

/* ---------------- Badge ---------------- */

export function Badge({
  color,
  children,
}: {
  color?: string
  children: ReactNode
}) {
  if (color) {
    return (
      <span
        className="chip"
        style={{ backgroundColor: `${color}1a`, color, border: `1px solid ${color}33` }}
      >
        {children}
      </span>
    )
  }
  return <span className="chip bg-surface-muted text-ink-soft dark:bg-[#242b38]">{children}</span>
}

/* ---------------- Avatar ---------------- */

const AVATAR_HUES = [210, 160, 280, 20, 340, 100, 250, 40]

export function Avatar({ name, size = 26 }: { name?: string | null; size?: number }) {
  const label = (name || '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
  let hash = 0
  for (const ch of name || '?') hash = (hash + ch.charCodeAt(0)) % 997
  const hue = AVATAR_HUES[hash % AVATAR_HUES.length]

  return (
    <span
      className="inline-grid shrink-0 place-items-center rounded-full font-medium"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.4,
        background: `hsl(${hue} 45% 92%)`,
        color: `hsl(${hue} 45% 32%)`,
      }}
      title={name || ''}
    >
      {label}
    </span>
  )
}

/* ---------------- Empty ---------------- */

export function Empty({ text }: { text?: string }) {
  const t = useT()
  return <div className="py-10 text-center text-sm text-ink-faint">{text ?? t('empty')}</div>
}

export function Spinner() {
  return (
    <div className="flex justify-center py-10">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-200 border-t-brand-500" />
    </div>
  )
}

/* ---------------- Tabs ---------------- */

export function Tabs({
  value,
  onChange,
  items,
}: {
  value: string
  onChange: (v: string) => void
  items: { value: string; label: string; badge?: number }[]
}) {
  return (
    <div className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-surface-border dark:border-[#2a3140]">
      {items.map((i) => (
        <button
          key={i.value}
          onClick={() => onChange(i.value)}
          className={clsx(
            '-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors',
            value === i.value
              ? 'border-brand-500 font-medium text-brand-600'
              : 'border-transparent text-ink-soft hover:text-ink',
          )}
        >
          {i.label}
          {i.badge != null && i.badge > 0 && (
            <span className="ml-1.5 rounded-full bg-brand-100 px-1.5 py-px text-[10px] text-brand-700 dark:bg-brand-900/30 dark:text-brand-300">
              {i.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}
