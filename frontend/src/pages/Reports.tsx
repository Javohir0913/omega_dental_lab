import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useLang, useNm, useT } from '@/i18n'
import { Empty, Spinner } from '@/components/ui'
import { duration } from '@/lib/format'
import type { StageWorkRow } from '@/lib/types'

function toDateInput(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export default function ReportsPage() {
  const t = useT()
  const nm = useNm()
  const lang = useLang((s) => s.lang)

  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  function setPreset(preset: 'today' | 'week' | 'month' | 'all') {
    const now = new Date()
    if (preset === 'all') {
      setDateFrom('')
      setDateTo('')
      return
    }
    if (preset === 'today') {
      setDateFrom(toDateInput(now))
      setDateTo(toDateInput(now))
      return
    }
    if (preset === 'week') {
      const day = now.getDay() || 7
      const monday = new Date(now)
      monday.setDate(now.getDate() - day + 1)
      setDateFrom(toDateInput(monday))
      setDateTo(toDateInput(now))
      return
    }
    const first = new Date(now.getFullYear(), now.getMonth(), 1)
    setDateFrom(toDateInput(first))
    setDateTo(toDateInput(now))
  }

  const { data = [], isLoading } = useQuery({
    queryKey: ['reports-stage-work', dateFrom, dateTo],
    queryFn: async () =>
      (
        await api.get<StageWorkRow[]>('/reports/stage-work', {
          params: {
            date_from: dateFrom ? `${dateFrom}T00:00:00` : undefined,
            date_to: dateTo ? `${dateTo}T23:59:59` : undefined,
          },
        })
      ).data,
  })

  const employees = useMemo(() => {
    const map = new Map<
      number,
      { user_id: number; user_name: string; totalSeconds: number; totalCount: number; rows: StageWorkRow[] }
    >()
    for (const r of data) {
      if (!map.has(r.user_id)) {
        map.set(r.user_id, { user_id: r.user_id, user_name: r.user_name, totalSeconds: 0, totalCount: 0, rows: [] })
      }
      const e = map.get(r.user_id)!
      e.totalSeconds += r.total_seconds
      e.totalCount += r.count
      e.rows.push(r)
    }
    for (const e of map.values()) e.rows.sort((a, b) => b.total_seconds - a.total_seconds)
    return [...map.values()].sort((a, b) => b.totalSeconds - a.totalSeconds)
  }, [data])

  const grandTotalSeconds = employees.reduce((s, e) => s + e.totalSeconds, 0)
  const grandTotalCount = employees.reduce((s, e) => s + e.totalCount, 0)

  return (
    <div className="p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h1 className="text-base font-semibold">{t('nav_reports')}</h1>
        <div className="flex-1" />
        {(
          [
            ['today', lang === 'ru' ? 'Сегодня' : 'Bugun'],
            ['week', lang === 'ru' ? 'Эта неделя' : 'Shu hafta'],
            ['month', lang === 'ru' ? 'Этот месяц' : 'Shu oy'],
            ['all', t('all')],
          ] as const
        ).map(([p, label]) => (
          <button
            key={p}
            onClick={() => setPreset(p)}
            className="rounded-lg border border-surface-border px-2.5 py-1.5 text-xs text-ink-soft hover:bg-surface-muted dark:border-[#2f3745] dark:hover:bg-[#222836]"
          >
            {label}
          </button>
        ))}
        <input
          type="date"
          className="input max-w-[145px]"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
        />
        <span className="text-xs text-ink-faint">—</span>
        <input
          type="date"
          className="input max-w-[145px]"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
        />
      </div>

      <p className="mb-3 text-xs text-ink-faint">
        {lang === 'ru'
          ? 'Кто сколько времени провёл на каком этапе. Учитываются только завершённые визиты на этап.'
          : 'Kim qaysi bosqichda qancha vaqt o‘tkazgani. Faqat yakunlangan bosqich vizitlari hisobga olinadi.'}
      </p>

      {isLoading ? (
        <Spinner />
      ) : employees.length === 0 ? (
        <Empty />
      ) : (
        <>
          <div className="card mb-3 flex flex-wrap items-center gap-4 p-3 text-sm">
            <div>
              <span className="text-ink-faint">{lang === 'ru' ? 'Сотрудников' : 'Xodimlar'}: </span>
              <span className="font-medium">{employees.length}</span>
            </div>
            <div>
              <span className="text-ink-faint">{lang === 'ru' ? 'Этапов пройдено' : 'Bosqichlar bajarildi'}: </span>
              <span className="font-medium">{grandTotalCount}</span>
            </div>
            <div>
              <span className="text-ink-faint">{lang === 'ru' ? 'Суммарное время' : 'Jami vaqt'}: </span>
              <span className="font-medium">{duration(grandTotalSeconds)}</span>
            </div>
          </div>

          <div className="space-y-3">
            {employees.map((e) => (
              <div key={e.user_id} className="card overflow-x-auto">
                <div className="flex flex-wrap items-center gap-3 border-b border-surface-border px-3 py-2.5 dark:border-[#2a3140]">
                  <span className="text-sm font-medium">{e.user_name}</span>
                  <span className="text-xs text-ink-faint">
                    {e.totalCount} {lang === 'ru' ? 'этапов' : 'bosqich'} · {duration(e.totalSeconds)}
                  </span>
                </div>
                <table className="table-wide w-full text-sm">
                  <thead className="text-left text-xs text-ink-faint">
                    <tr>
                      <th className="px-3 py-1.5 font-medium">{lang === 'ru' ? 'Этап' : 'Bosqich'}</th>
                      <th className="px-3 py-1.5 font-medium">{lang === 'ru' ? 'Кол-во' : 'Soni'}</th>
                      <th className="px-3 py-1.5 font-medium">{lang === 'ru' ? 'Всего' : 'Jami'}</th>
                      <th className="px-3 py-1.5 font-medium">{lang === 'ru' ? 'В среднем' : "O'rtacha"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {e.rows.map((r) => (
                      <tr
                        key={r.stage_id}
                        className="border-t border-surface-border last:border-0 dark:border-[#2a3140]"
                      >
                        <td className="px-3 py-1.5">{nm({ name_ru: r.stage_name_ru, name_uz: r.stage_name_uz }, 'name')}</td>
                        <td className="px-3 py-1.5">{r.count}</td>
                        <td className="px-3 py-1.5">{duration(r.total_seconds)}</td>
                        <td className="px-3 py-1.5 text-ink-soft">{duration(r.avg_seconds)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
