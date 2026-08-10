import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { useAuth } from '@/lib/auth'
import { errText } from '@/lib/api'
import { useLang, useT } from '@/i18n'
import { PasswordInput } from '@/components/ui'
import type { Lang } from '@/lib/types'

export default function LoginPage() {
  const t = useT()
  const { lang, setLang } = useLang()
  const login = useAuth((s) => s.login)
  const navigate = useNavigate()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await login(username.trim(), password)
      navigate('/', { replace: true })
    } catch (err) {
      setError(errText(err, lang))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-surface-muted p-4 dark:bg-[#131720]">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-xl bg-brand-500 text-lg font-bold text-white">
            Ω
          </div>
          <h1 className="text-lg font-semibold">OMEGA DENTAL LAB</h1>
          <p className="text-xs text-ink-faint">CRM</p>
        </div>

        <form onSubmit={submit} className="card p-5">
          <div className="mb-4 flex justify-center gap-1">
            {(['ru', 'uz'] as Lang[]).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLang(l)}
                className={clsx(
                  'rounded-md px-2 py-0.5 text-xs uppercase transition-colors',
                  lang === l ? 'bg-brand-500 text-white' : 'text-ink-faint hover:text-ink',
                )}
              >
                {l}
              </button>
            ))}
          </div>

          <div className="mb-3">
            <label className="label">{t('username')}</label>
            <input
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              autoComplete="username"
            />
          </div>

          <div className="mb-4">
            <label className="label">{t('password')}</label>
            <PasswordInput
              value={password}
              onChange={setPassword}
              autoComplete="current-password"
            />
          </div>

          {error && (
            <div className="mb-3 whitespace-pre-line rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {error}
            </div>
          )}

          <button className="btn-primary w-full" disabled={busy || !username || !password}>
            {busy ? t('loading') : t('sign_in')}
          </button>
        </form>
      </div>
    </div>
  )
}
