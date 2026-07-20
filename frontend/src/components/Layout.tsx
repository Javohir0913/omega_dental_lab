import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { useAuth } from '@/lib/auth'
import { useLang, useT } from '@/i18n'
import { ToastHost } from '@/components/Toast'
import { Avatar } from '@/components/ui'
import NotificationBell from '@/components/NotificationBell'
import { api } from '@/lib/api'
import { socket } from '@/lib/ws'
import type { Lang } from '@/lib/types'

interface NavItem {
  to: string
  key: string
  perm?: string
  icon: string
  end?: boolean
}

const NAV: NavItem[] = [
  { to: '/', key: 'nav_kanban', icon: '▦', end: true },
  { to: '/orders', key: 'nav_orders', icon: '☰' },
  { to: '/chats', key: 'nav_chats', icon: '💬' },
  { to: '/patients', key: 'nav_patients', perm: 'patient.view', icon: '☺' },
  { to: '/doctors', key: 'nav_doctors', perm: 'doctor.view', icon: '✚' },
  { to: '/services', key: 'nav_services', perm: 'service.view', icon: '❖' },
  { to: '/users', key: 'nav_users', perm: 'user.view', icon: '☷' },
  { to: '/logs', key: 'nav_logs', perm: 'log.system', icon: '⌘' },
]

const ADMIN_PERMS = ['admin.stages', 'admin.fields', 'admin.roles', 'admin.notify', 'admin.settings']

export default function Layout() {
  const { me, logout, can } = useAuth()
  const t = useT()
  const { lang, setLang } = useLang()
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(localStorage.getItem('omega_nav') === 'off')
  const [dark, setDark] = useState(document.documentElement.classList.contains('dark'))
  const [unreadChats, setUnreadChats] = useState(0)

  const showAdmin = ADMIN_PERMS.some((p) => can(p))

  useEffect(() => {
    localStorage.setItem('omega_nav', collapsed ? 'off' : 'on')
  }, [collapsed])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem('omega_theme', dark ? 'dark' : 'light')
  }, [dark])

  // o'qilmagan chat xabarlari — kirishda va har yangi xabarda
  useEffect(() => {
    const refresh = () =>
      api
        .get('/chats/unread/total')
        .then(({ data }) => setUnreadChats(data.total))
        .catch(() => {})
    refresh()
    const off = socket.on('chat.message', refresh)
    return off
  }, [])

  async function switchLang(next: Lang) {
    setLang(next)
    try {
      await api.patch('/auth/me', { lang: next })
    } catch {
      /* til lokal ham ishlayveradi */
    }
  }

  return (
    <div className="flex min-h-screen">
      {/* Chap menyu */}
      <aside
        className={clsx(
          'sticky top-0 flex h-screen shrink-0 flex-col border-r border-surface-border bg-white transition-[width] dark:border-[#2a3140] dark:bg-[#171c26]',
          collapsed ? 'w-14' : 'w-56',
        )}
      >
        <div className="flex h-14 items-center gap-2 border-b border-surface-border px-3 dark:border-[#2a3140]">
          <div className="grid h-7 w-7 shrink-0 place-items-center rounded bg-brand-500 text-xs font-bold text-white">
            Ω
          </div>
          {!collapsed && (
            <div className="truncate text-sm font-semibold leading-tight">
              OMEGA
              <div className="text-[10px] font-normal text-ink-faint">DENTAL LAB</div>
            </div>
          )}
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
          {NAV.filter((n) => !n.perm || can(n.perm)).map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors',
                  isActive
                    ? 'bg-brand-50 font-medium text-brand-700 dark:bg-brand-900/30 dark:text-brand-200'
                    : 'text-ink-soft hover:bg-surface-muted dark:hover:bg-[#222836]',
                )
              }
              title={collapsed ? t(n.key) : undefined}
            >
              <span className="w-4 shrink-0 text-center text-[13px]">{n.icon}</span>
              {!collapsed && <span className="truncate">{t(n.key)}</span>}
              {!collapsed && n.to === '/chats' && unreadChats > 0 && (
                <span className="ml-auto rounded-full bg-brand-500 px-1.5 text-[10px] text-white">
                  {unreadChats}
                </span>
              )}
            </NavLink>
          ))}

          {showAdmin && (
            <NavLink
              to="/admin"
              className={({ isActive }) =>
                clsx(
                  'mt-2 flex items-center gap-2.5 rounded-lg border-t border-surface-border px-2.5 pb-2 pt-3 text-sm dark:border-[#2a3140]',
                  isActive ? 'font-medium text-brand-700' : 'text-ink-soft hover:text-ink',
                )
              }
              title={collapsed ? t('nav_admin') : undefined}
            >
              <span className="w-4 shrink-0 text-center text-[13px]">⚙</span>
              {!collapsed && <span>{t('nav_admin')}</span>}
            </NavLink>
          )}
        </nav>

        <button
          onClick={() => setCollapsed((v) => !v)}
          className="border-t border-surface-border py-2 text-xs text-ink-faint hover:bg-surface-muted dark:border-[#2a3140] dark:hover:bg-[#222836]"
        >
          {collapsed ? '»' : '«'}
        </button>
      </aside>

      {/* O'ng qism */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-surface-border bg-white/90 px-4 backdrop-blur dark:border-[#2a3140] dark:bg-[#171c26]/90">
          <div className="flex-1" />

          {/* til */}
          <div className="flex overflow-hidden rounded-lg border border-surface-border text-xs dark:border-[#2f3745]">
            {(['ru', 'uz'] as Lang[]).map((l) => (
              <button
                key={l}
                onClick={() => switchLang(l)}
                className={clsx(
                  'px-2 py-1 uppercase transition-colors',
                  lang === l
                    ? 'bg-brand-500 font-medium text-white'
                    : 'text-ink-soft hover:bg-surface-muted dark:hover:bg-[#222836]',
                )}
              >
                {l}
              </button>
            ))}
          </div>

          <button
            onClick={() => setDark((v) => !v)}
            className="rounded-lg border border-surface-border px-2 py-1 text-xs text-ink-soft hover:bg-surface-muted dark:border-[#2f3745] dark:hover:bg-[#222836]"
            title={dark ? 'Light' : 'Dark'}
          >
            {dark ? '☀' : '☾'}
          </button>

          <NotificationBell />

          <button
            onClick={() => navigate('/profile')}
            className="flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-surface-muted dark:hover:bg-[#222836]"
          >
            <Avatar name={me?.full_name} />
            <div className="hidden text-left leading-tight sm:block">
              <div className="max-w-[140px] truncate text-xs font-medium">{me?.full_name}</div>
              <div className="text-[10px] text-ink-faint">
                {lang === 'ru' ? me?.role.name_ru : me?.role.name_uz}
              </div>
            </div>
          </button>

          <button
            onClick={async () => {
              await logout()
              navigate('/login', { replace: true })
            }}
            className="rounded-lg border border-surface-border px-2 py-1 text-xs text-ink-soft hover:bg-surface-muted dark:border-[#2f3745] dark:hover:bg-[#222836]"
            title={t('logout')}
          >
            ⏻
          </button>
        </header>

        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>

      <ToastHost />
    </div>
  )
}
