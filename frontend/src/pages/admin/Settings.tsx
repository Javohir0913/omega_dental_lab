import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { api, errText } from '@/lib/api'
import { useLang, useT } from '@/i18n'
import { Confirm, Field, Spinner } from '@/components/ui'
import { toast } from '@/components/Toast'
import { UPPER_LEFT, UPPER_RIGHT, LOWER_LEFT, LOWER_RIGHT } from '@/components/ToothChart'
import type { Holiday, Lang } from '@/lib/types'

type SettingsValues = {
  order_number_prefix?: string
  order_number_padding?: number
  company_name?: string
  frontend_url?: string
  default_lang?: Lang
  kick_oldest_session?: boolean
  claim_enabled?: boolean
  log_retention_days?: number
  max_upload_mb?: number
  deadline_calendar_enabled?: boolean
  work_days?: number[]
  work_hour_start?: string
  work_hour_end?: string
  overdue_reminder_hours?: number
  order_deadline_reminder_hours?: number
  telegram_bot_token?: string
  telegram_enabled?: boolean
  telegram_digest_enabled?: boolean
  telegram_digest_daily?: boolean
  telegram_digest_daily_time?: string
  telegram_digest_weekly?: boolean
  telegram_digest_weekly_day?: number
  telegram_digest_weekly_time?: string
  tooth_labels?: Record<string, string>
  tooth_chart_scale?: number
}

const WEEKDAYS: { value: number; key: string }[] = [
  { value: 0, key: 'weekday_mon' },
  { value: 1, key: 'weekday_tue' },
  { value: 2, key: 'weekday_wed' },
  { value: 3, key: 'weekday_thu' },
  { value: 4, key: 'weekday_fri' },
  { value: 5, key: 'weekday_sat' },
  { value: 6, key: 'weekday_sun' },
]

export default function AdminSettings() {
  const t = useT()
  const lang = useLang((s) => s.lang)
  const qc = useQueryClient()

  const [form, setForm] = useState<SettingsValues>({})
  const [busy, setBusy] = useState(false)
  const [cleanupBusy, setCleanupBusy] = useState(false)
  const [tgTestBusy, setTgTestBusy] = useState(false)
  const [tgTestResult, setTgTestResult] = useState<{ ok: boolean; username?: string } | null>(null)

  const [holidayForm, setHolidayForm] = useState({
    day: 1, month: 1, year: '', name_ru: '', name_uz: '',
  })
  const [holidayBusy, setHolidayBusy] = useState(false)
  const [delHoliday, setDelHoliday] = useState<Holiday | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['admin-settings'],
    queryFn: async () => (await api.get<{ values: SettingsValues }>('/admin/settings')).data.values,
  })

  const { data: holidays = [] } = useQuery({
    queryKey: ['admin-holidays'],
    queryFn: async () => (await api.get<Holiday[]>('/admin/holidays')).data,
  })

  useEffect(() => {
    if (data) setForm(data)
  }, [data])

  function set<K extends keyof SettingsValues>(key: K, value: SettingsValues[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function toggleWorkDay(day: number) {
    const cur = form.work_days ?? [0, 1, 2, 3, 4, 5]
    set('work_days', cur.includes(day) ? cur.filter((d) => d !== day) : [...cur, day].sort())
  }

  function setToothLabel(code: number, value: string) {
    set('tooth_labels', { ...form.tooth_labels, [String(code)]: value })
  }

  async function save() {
    setBusy(true)
    try {
      await api.patch('/admin/settings', { values: form })
      toast(t('saved'))
      qc.invalidateQueries({ queryKey: ['admin-settings'] })
    } catch (e) {
      toast(errText(e, lang), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function addHoliday() {
    setHolidayBusy(true)
    try {
      await api.post('/admin/holidays', {
        day: holidayForm.day,
        month: holidayForm.month,
        year: holidayForm.year ? Number(holidayForm.year) : null,
        name_ru: holidayForm.name_ru,
        name_uz: holidayForm.name_uz,
      })
      toast(t('saved'))
      setHolidayForm({ day: 1, month: 1, year: '', name_ru: '', name_uz: '' })
      qc.invalidateQueries({ queryKey: ['admin-holidays'] })
    } catch (e) {
      toast(errText(e, lang), 'error')
    } finally {
      setHolidayBusy(false)
    }
  }

  async function removeHoliday() {
    if (!delHoliday) return
    try {
      await api.delete(`/admin/holidays/${delHoliday.id}`)
      toast(t('saved'))
      qc.invalidateQueries({ queryKey: ['admin-holidays'] })
    } catch (e) {
      toast(errText(e, lang), 'error')
    } finally {
      setDelHoliday(null)
    }
  }

  async function cleanupLogs() {
    setCleanupBusy(true)
    try {
      const res = await api.post<{ detail: string }>('/admin/logs/cleanup')
      toast(res.data.detail)
      qc.invalidateQueries({ queryKey: ['log-stats'] })
    } catch (e) {
      toast(errText(e, lang), 'error')
    } finally {
      setCleanupBusy(false)
    }
  }

  async function testTelegram() {
    setTgTestBusy(true)
    setTgTestResult(null)
    try {
      const res = await api.post<{ ok: boolean; bot_username?: string }>('/admin/telegram/test')
      setTgTestResult({ ok: res.data.ok, username: res.data.bot_username ?? undefined })
    } catch (e) {
      setTgTestResult({ ok: false })
      toast(errText(e, lang), 'error')
    } finally {
      setTgTestBusy(false)
    }
  }

  if (isLoading) return <Spinner />

  return (
    <div className="max-w-xl space-y-4 lg:max-w-3xl xl:max-w-4xl">
      <Field label={t('setting_company_name')}>
        <input
          className="input"
          value={form.company_name ?? ''}
          onChange={(e) => set('company_name', e.target.value)}
        />
      </Field>

      <Field label={t('setting_frontend_url')} hint={t('setting_frontend_url_hint')}>
        <input
          className="input"
          placeholder="https://lab.example.uz"
          value={form.frontend_url ?? ''}
          onChange={(e) => set('frontend_url', e.target.value)}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('setting_order_number_prefix')}>
          <input
            className="input"
            value={form.order_number_prefix ?? ''}
            onChange={(e) => set('order_number_prefix', e.target.value)}
          />
        </Field>

        <Field label={t('setting_order_number_padding')}>
          <input
            className="input"
            type="number"
            min={1}
            max={12}
            value={form.order_number_padding ?? 6}
            onChange={(e) => set('order_number_padding', Number(e.target.value))}
          />
        </Field>
      </div>

      <Field label={t('setting_default_lang')}>
        <div className="flex gap-2">
          {(['ru', 'uz'] as Lang[]).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => set('default_lang', l)}
              className={clsx(
                'rounded-lg border px-3 py-1.5 text-xs uppercase transition-colors',
                form.default_lang === l
                  ? 'border-brand-500 bg-brand-50 font-medium text-brand-700 dark:bg-brand-900/30 dark:text-brand-200'
                  : 'border-surface-border text-ink-soft hover:bg-surface-muted dark:border-[#2f3745] dark:hover:bg-[#222836]',
              )}
            >
              {l}
            </button>
          ))}
        </div>
      </Field>

      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-surface-border p-3 dark:border-[#2f3745]">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={form.kick_oldest_session ?? true}
          onChange={(e) => set('kick_oldest_session', e.target.checked)}
        />
        <div>
          <div className="text-sm font-medium">{t('setting_kick_oldest_session')}</div>
          <div className="text-xs text-ink-faint">{t('setting_kick_oldest_session_hint')}</div>
        </div>
      </label>

      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-surface-border p-3 dark:border-[#2f3745]">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={form.claim_enabled ?? true}
          onChange={(e) => set('claim_enabled', e.target.checked)}
        />
        <div>
          <div className="text-sm font-medium">{t('setting_claim_enabled')}</div>
          <div className="text-xs text-ink-faint">{t('setting_claim_enabled_hint')}</div>
        </div>
      </label>

      <Field label={t('setting_log_retention')}>
        <div className="flex flex-wrap items-center gap-3">
          <input
            className="input w-24"
            type="number"
            min={1}
            max={3650}
            value={form.log_retention_days ?? 90}
            onChange={(e) => set('log_retention_days', Number(e.target.value))}
          />
          <span className="text-xs text-ink-faint">{t('days')}</span>
          <button className="btn-ghost text-xs text-rose-600" onClick={cleanupLogs} disabled={cleanupBusy}>
            {cleanupBusy ? t('loading') : t('log_cleanup_btn')}
          </button>
        </div>
        <div className="mt-1 text-xs text-ink-faint">{t('setting_log_retention_hint')}</div>
      </Field>

      <Field label={t('setting_max_upload')}>
        <div className="flex flex-wrap items-center gap-3">
          <input
            className="input w-24"
            type="number"
            min={1}
            max={2048}
            disabled={!form.max_upload_mb}
            value={form.max_upload_mb || 25}
            onChange={(e) => set('max_upload_mb', Number(e.target.value))}
          />
          <span className="text-xs text-ink-faint">MB</span>
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-ink-soft">
            <input
              type="checkbox"
              checked={!form.max_upload_mb}
              onChange={(e) => set('max_upload_mb', e.target.checked ? 0 : 25)}
            />
            {t('setting_max_upload_unlimited')}
          </label>
        </div>
        <div className="mt-1 text-xs text-ink-faint">{t('setting_max_upload_hint')}</div>
      </Field>

      <div className="rounded-lg border border-surface-border p-3 dark:border-[#2f3745]">
        <div className="mb-2 text-sm font-semibold">{t('setting_workcalendar_title')}</div>

        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={form.deadline_calendar_enabled ?? false}
            onChange={(e) => set('deadline_calendar_enabled', e.target.checked)}
          />
          <div>
            <div className="text-sm font-medium">{t('setting_deadline_calendar_enabled')}</div>
            <div className="text-xs text-ink-faint">{t('setting_deadline_calendar_enabled_hint')}</div>
          </div>
        </label>

        <div className="mt-3">
          <Field label={t('setting_work_days')}>
            <div className="flex flex-wrap gap-2">
              {WEEKDAYS.map((wd) => {
                const active = (form.work_days ?? [0, 1, 2, 3, 4, 5]).includes(wd.value)
                return (
                  <button
                    key={wd.value}
                    type="button"
                    onClick={() => toggleWorkDay(wd.value)}
                    className={clsx(
                      'rounded-lg border px-3 py-1.5 text-xs transition-colors',
                      active
                        ? 'border-brand-500 bg-brand-50 font-medium text-brand-700 dark:bg-brand-900/30 dark:text-brand-200'
                        : 'border-surface-border text-ink-soft hover:bg-surface-muted dark:border-[#2f3745] dark:hover:bg-[#222836]',
                    )}
                  >
                    {t(wd.key)}
                  </button>
                )
              })}
            </div>
          </Field>
        </div>

        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Field label={t('setting_work_hours')}>
            <div className="flex flex-wrap items-center gap-2">
              <input
                className="input w-auto"
                type="time"
                value={form.work_hour_start ?? '09:00'}
                onChange={(e) => set('work_hour_start', e.target.value)}
              />
              <span className="text-xs text-ink-faint">—</span>
              <input
                className="input w-auto"
                type="time"
                value={form.work_hour_end ?? '18:00'}
                onChange={(e) => set('work_hour_end', e.target.value)}
              />
            </div>
          </Field>

          <Field label={t('setting_overdue_reminder_hours')}>
            <input
              className="input w-24"
              type="number"
              min={1}
              max={720}
              value={form.overdue_reminder_hours ?? 24}
              onChange={(e) => set('overdue_reminder_hours', Number(e.target.value))}
            />
            <div className="mt-1 text-xs text-ink-faint">{t('setting_overdue_reminder_hours_hint')}</div>
          </Field>

          <Field label={t('setting_order_deadline_reminder_hours')}>
            <input
              className="input w-24"
              type="number"
              min={1}
              max={720}
              value={form.order_deadline_reminder_hours ?? 24}
              onChange={(e) => set('order_deadline_reminder_hours', Number(e.target.value))}
            />
            <div className="mt-1 text-xs text-ink-faint">{t('setting_order_deadline_reminder_hours_hint')}</div>
          </Field>
        </div>
      </div>

      <button className="btn-primary" onClick={save} disabled={busy}>
        {busy ? t('loading') : t('save')}
      </button>

      <div className="rounded-lg border border-surface-border p-3 dark:border-[#2f3745]">
        <div className="mb-1 text-sm font-semibold">{t('holidays_title')}</div>
        <div className="mb-3 text-xs text-ink-faint">{t('holidays_hint')}</div>

        {holidays.length === 0 ? (
          <div className="mb-3 text-xs text-ink-faint">{t('holiday_empty')}</div>
        ) : (
          <ul className="mb-3 divide-y divide-surface-border dark:divide-[#2f3745]">
            {holidays.map((h) => (
              <li key={h.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div>
                  <span className="font-medium">
                    {String(h.day).padStart(2, '0')}.{String(h.month).padStart(2, '0')}
                    {h.year ? `.${h.year}` : ''}
                  </span>
                  {!h.year && (
                    <span className="ml-2 text-xs text-ink-faint">({t('holiday_year_recurring')})</span>
                  )}
                  <span className="ml-2 text-ink-soft">{lang === 'ru' ? h.name_ru : h.name_uz}</span>
                </div>
                <button className="btn-ghost text-xs text-rose-600" onClick={() => setDelHoliday(h)}>
                  {t('delete')}
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="grid grid-cols-3 gap-2">
          <input
            className="input"
            type="number"
            min={1}
            max={31}
            placeholder={t('holiday_day')}
            value={holidayForm.day}
            onChange={(e) => setHolidayForm((p) => ({ ...p, day: Number(e.target.value) }))}
          />
          <input
            className="input"
            type="number"
            min={1}
            max={12}
            placeholder={t('holiday_month')}
            value={holidayForm.month}
            onChange={(e) => setHolidayForm((p) => ({ ...p, month: Number(e.target.value) }))}
          />
          <input
            className="input"
            type="number"
            placeholder={t('holiday_year')}
            value={holidayForm.year}
            onChange={(e) => setHolidayForm((p) => ({ ...p, year: e.target.value }))}
          />
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <input
            className="input"
            placeholder={t('holiday_name_ru')}
            value={holidayForm.name_ru}
            onChange={(e) => setHolidayForm((p) => ({ ...p, name_ru: e.target.value }))}
          />
          <input
            className="input"
            placeholder={t('holiday_name_uz')}
            value={holidayForm.name_uz}
            onChange={(e) => setHolidayForm((p) => ({ ...p, name_uz: e.target.value }))}
          />
        </div>
        <button
          className="btn-ghost mt-2 text-xs"
          onClick={addHoliday}
          disabled={holidayBusy || !holidayForm.name_ru || !holidayForm.name_uz}
        >
          {holidayBusy ? t('loading') : t('holiday_add')}
        </button>
      </div>

      <Confirm
        open={!!delHoliday}
        text={delHoliday ? `${String(delHoliday.day).padStart(2, '0')}.${String(delHoliday.month).padStart(2, '0')}` : ''}
        onCancel={() => setDelHoliday(null)}
        onOk={removeHoliday}
      />

      <div className="rounded-lg border border-surface-border p-3 dark:border-[#2f3745]">
        <div className="mb-2 text-sm font-semibold">{t('setting_telegram_title')}</div>

        <Field label={t('setting_telegram_token')} hint={t('setting_telegram_token_hint')}>
          <div className="flex gap-2">
            <input
              className="input"
              type="text"
              autoComplete="off"
              value={form.telegram_bot_token ?? ''}
              onChange={(e) => { set('telegram_bot_token', e.target.value); setTgTestResult(null) }}
            />
            <button className="btn-ghost shrink-0 text-xs" onClick={testTelegram} disabled={tgTestBusy || !form.telegram_bot_token}>
              {tgTestBusy ? t('loading') : t('setting_telegram_test')}
            </button>
          </div>
          {tgTestResult && (
            <div className={clsx('mt-1 text-xs', tgTestResult.ok ? 'text-emerald-600' : 'text-rose-600')}>
              {tgTestResult.ok ? `${t('setting_telegram_test_ok')}${tgTestResult.username ?? ''}` : t('setting_telegram_test_fail')}
            </div>
          )}
        </Field>

        <label className="mb-3 flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={form.telegram_enabled ?? false}
            onChange={(e) => set('telegram_enabled', e.target.checked)}
          />
          <div className="text-sm font-medium">{t('setting_telegram_enabled')}</div>
        </label>

        <label className="mb-3 flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={form.telegram_digest_enabled ?? false}
            onChange={(e) => set('telegram_digest_enabled', e.target.checked)}
          />
          <div className="text-sm font-medium">{t('setting_telegram_digest_enabled')}</div>
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-surface-border p-2.5 dark:border-[#2f3745]">
            <label className="mb-2 flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.telegram_digest_daily ?? true}
                onChange={(e) => set('telegram_digest_daily', e.target.checked)}
              />
              {t('setting_telegram_digest_daily')}
            </label>
            <Field label={t('setting_telegram_digest_time')}>
              <input
                className="input w-auto"
                type="time"
                value={form.telegram_digest_daily_time ?? '08:00'}
                onChange={(e) => set('telegram_digest_daily_time', e.target.value)}
              />
            </Field>
          </div>

          <div className="rounded-lg border border-surface-border p-2.5 dark:border-[#2f3745]">
            <label className="mb-2 flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.telegram_digest_weekly ?? false}
                onChange={(e) => set('telegram_digest_weekly', e.target.checked)}
              />
              {t('setting_telegram_digest_weekly')}
            </label>
            <Field label={t('setting_telegram_digest_weekday')}>
              <select
                className="input w-auto"
                value={form.telegram_digest_weekly_day ?? 0}
                onChange={(e) => set('telegram_digest_weekly_day', Number(e.target.value))}
              >
                {WEEKDAYS.map((wd) => (
                  <option key={wd.value} value={wd.value}>{t(wd.key)}</option>
                ))}
              </select>
            </Field>
            <Field label={t('setting_telegram_digest_time')}>
              <input
                className="input w-auto"
                type="time"
                value={form.telegram_digest_weekly_time ?? '08:00'}
                onChange={(e) => set('telegram_digest_weekly_time', e.target.value)}
              />
            </Field>
          </div>
        </div>

        <button className="btn-primary mt-3" onClick={save} disabled={busy}>
          {busy ? t('loading') : t('save')}
        </button>
      </div>

      <div className="rounded-lg border border-surface-border p-3 dark:border-[#2f3745]">
        <div className="mb-1 text-sm font-semibold">{t('setting_tooth_labels_title')}</div>
        <p className="mb-3 text-xs text-ink-faint">{t('setting_tooth_labels_hint')}</p>

        <Field
          label={lang === 'ru' ? 'Размер клеток на схеме (%)' : 'Sxemadagi katakcha o‘lchami (%)'}
          hint={
            lang === 'ru'
              ? 'Один размер для всех сотрудников — меняется сразу везде (заявка, карточка проекта).'
              : 'Barcha xodimlar uchun bitta o‘lcham — darhol hamma joyda (ariza, loyiha kartochkasi) o‘zgaradi.'
          }
        >
          <input
            type="number"
            min={50}
            max={300}
            step={10}
            className="input max-w-[140px]"
            value={form.tooth_chart_scale ?? 100}
            onChange={(e) => set('tooth_chart_scale', Number(e.target.value))}
          />
        </Field>

        <div className="flex flex-col items-center gap-3 overflow-x-auto">
          {[[UPPER_RIGHT, UPPER_LEFT], [LOWER_RIGHT, LOWER_LEFT]].map(([right, left], i) => (
            <div key={i} className="flex flex-wrap items-center justify-center gap-1.5 sm:flex-nowrap">
              <div className="flex flex-wrap justify-center gap-1">
                {right.map((code) => (
                  <input
                    key={code}
                    className="input h-8 w-8 shrink-0 p-0 text-center text-[11px]"
                    value={form.tooth_labels?.[String(code)] ?? String(code)}
                    onChange={(e) => setToothLabel(code, e.target.value)}
                  />
                ))}
              </div>
              <div className="hidden h-7 w-px shrink-0 bg-surface-border dark:bg-[#2f3745] sm:block" />
              <div className="flex flex-wrap justify-center gap-1">
                {left.map((code) => (
                  <input
                    key={code}
                    className="input h-8 w-8 shrink-0 p-0 text-center text-[11px]"
                    value={form.tooth_labels?.[String(code)] ?? String(code)}
                    onChange={(e) => setToothLabel(code, e.target.value)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        <button className="btn-primary mt-3" onClick={save} disabled={busy}>
          {busy ? t('loading') : t('save')}
        </button>
      </div>
    </div>
  )
}
