import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { useLang, useT } from '@/i18n'
import { api } from '@/lib/api'
import { duration, shortDt } from '@/lib/format'
import type { WorkCalendarStatus } from '@/lib/types'

/** Ish kalendarining joriy holati (dam kuni/bayram bo'lsa bosqich vaqti to'xtaydi). */
export function useWorkCalendar() {
  return useQuery({
    queryKey: ['work-calendar'],
    queryFn: async () => (await api.get<WorkCalendarStatus>('/orders/work-calendar')).data,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  })
}

/**
 * «Hozir vaqt to'xtagan» belgisi. Ish kalendari o'chiq bo'lsa yoki hozir ish
 * vaqti bo'lsa — hech nima ko'rsatmaydi.
 *
 * `variant='chip'` — panel uchun kichik yorliq, `variant='bar'` — proyekt
 * sahifasidagi keng qator (qolgan ish vaqtini ham ko'rsatadi).
 */
export default function WorkCalendarNotice({
  variant = 'chip',
  remainingSec,
  className,
}: {
  variant?: 'chip' | 'bar'
  remainingSec?: number | null
  className?: string
}) {
  const t = useT()
  const lang = useLang((s) => s.lang)
  const { data } = useWorkCalendar()

  if (!data?.enabled || data.working_now) return null

  const holidayName = lang === 'ru' ? data.holiday_name_ru : data.holiday_name_uz
  const why =
    data.reason === 'holiday'
      ? holidayName || t('wc_holiday')
      : data.reason === 'weekend'
        ? t('wc_weekend')
        : t('wc_offhours')
  const resumes = data.resumes_at ? `${t('wc_resumes')}: ${shortDt(data.resumes_at)}` : null

  if (variant === 'chip') {
    return (
      <span
        title={[t('wc_time_stopped'), why, resumes].filter(Boolean).join(' · ')}
        className={clsx(
          'inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-300 bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300',
          className,
        )}
      >
        ⏸ {t('wc_time_stopped')} · {why}
      </span>
    )
  }

  return (
    <div
      className={clsx(
        'rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-300',
        className,
      )}
    >
      <div className="font-medium">
        ⏸ {t('wc_time_stopped')} — {why}
      </div>
      <div className="mt-0.5">
        {remainingSec != null && remainingSec >= 0 && (
          <span>
            {t('wc_work_time_left')}: {duration(remainingSec)}
            {resumes ? ' · ' : ''}
          </span>
        )}
        {resumes}
      </div>
    </div>
  )
}
