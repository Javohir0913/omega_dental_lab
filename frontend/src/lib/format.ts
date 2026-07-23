import { format, formatDistanceToNowStrict, isValid, parseISO } from 'date-fns'
import { ru, uz } from 'date-fns/locale'
import { useLang } from '@/i18n'

function loc() {
  return useLang.getState().lang === 'uz' ? uz : ru
}

function parse(v: string | Date | null | undefined): Date | null {
  if (!v) return null
  const d = typeof v === 'string' ? parseISO(v) : v
  return isValid(d) ? d : null
}

export function dt(v: string | Date | null | undefined): string {
  const d = parse(v)
  return d ? format(d, 'dd.MM.yyyy HH:mm') : '—'
}

export function dateOnly(v: string | Date | null | undefined): string {
  const d = parse(v)
  return d ? format(d, 'dd.MM.yyyy') : '—'
}

export function timeOnly(v: string | Date | null | undefined): string {
  const d = parse(v)
  return d ? format(d, 'HH:mm') : '—'
}

export function fromNow(v: string | Date | null | undefined): string {
  const d = parse(v)
  if (!d) return '—'
  try {
    return formatDistanceToNowStrict(d, { addSuffix: true, locale: loc() })
  } catch {
    return dt(d)
  }
}

/** Sekundni "2 д 4 ч" / "3 ч 15 мин" ko'rinishiga keltiradi. */
export function duration(sec: number | null | undefined): string {
  if (sec == null) return '—'
  const uzb = useLang.getState().lang === 'uz'
  const d = Math.floor(sec / 86400)
  const h = Math.floor((sec % 86400) / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const L = uzb ? { d: 'k', h: 's', m: 'd' } : { d: 'д', h: 'ч', m: 'мин' }
  if (d > 0) return `${d} ${L.d} ${h} ${L.h}`
  if (h > 0) return `${h} ${L.h} ${m} ${L.m}`
  return `${m} ${L.m}`
}

/** Dedlaynga qolgan vaqt; manfiy bo'lsa kechikkan. */
export function deadlineInfo(v: string | null | undefined): {
  text: string
  overdue: boolean
  soon: boolean
} | null {
  const d = parse(v)
  if (!d) return null
  const diff = d.getTime() - Date.now()
  return {
    text: fromNow(d),
    overdue: diff < 0,
    soon: diff >= 0 && diff < 4 * 3600 * 1000,
  }
}

/**
 * UTC ISO satrini <input type="datetime-local"> uchun mahalliy (brauzer) vaqt
 * qiymatiga o'giradi. Xom `.slice(0,16)` ishlatish XATO — u UTC satrni
 * o'girmasdan qirqib, mahalliy vaqt sifatida ko'rsatib qo'yardi (~5 soatga siljib ketardi).
 */
export function toLocalInput(v: string | null | undefined): string {
  const d = parse(v)
  if (!d) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** <input type="datetime-local"> qiymatini (mahalliy vaqt) UTC ISO satriga o'giradi. */
export function fromLocalInput(v: string): string | null {
  if (!v) return null
  const [datePart, timePart] = v.split('T')
  const [y, m, d] = datePart.split('-').map(Number)
  const [h, min] = (timePart ?? '00:00').split(':').map(Number)
  const parsed = new Date(y, m - 1, d, h, min)
  return isValid(parsed) ? parsed.toISOString() : null
}

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
