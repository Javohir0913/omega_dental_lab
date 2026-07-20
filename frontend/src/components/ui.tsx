import { type ReactNode, useEffect } from 'react'
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
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-[6vh]">
      <div
        className="absolute inset-0"
        onClick={onClose}
        aria-hidden
      />
      <div
        className={clsx(
          'card relative w-full shadow-pop',
          wide ? 'max-w-4xl' : 'max-w-lg',
        )}
      >
        <div className="flex items-center justify-between border-b border-surface-border px-4 py-3 dark:border-[#2a3140]">
          <div className="text-sm font-semibold">{title}</div>
          <button onClick={onClose} className="rounded p-1 text-ink-faint hover:bg-surface-muted dark:hover:bg-[#222836]">
            ✕
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-4 py-4">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 border-t border-surface-border px-4 py-3 dark:border-[#2a3140]">
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
    <div className="flex gap-1 overflow-x-auto border-b border-surface-border dark:border-[#2a3140]">
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
            <span className="ml-1.5 rounded-full bg-brand-100 px-1.5 py-px text-[10px] text-brand-700">
              {i.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}
