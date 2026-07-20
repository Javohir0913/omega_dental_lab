import { create } from 'zustand'
import { api, tokens } from '@/lib/api'
import { useLang } from '@/i18n'
import type { Me } from '@/lib/types'

interface AuthState {
  me: Me | null
  ready: boolean
  setMe: (me: Me | null) => void
  load: () => Promise<void>
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  can: (perm: string) => boolean
}

export const useAuth = create<AuthState>((set, get) => ({
  me: null,
  ready: false,

  setMe: (me) => set({ me }),

  load: async () => {
    if (!tokens.access) {
      set({ me: null, ready: true })
      return
    }
    try {
      const { data } = await api.get<Me>('/auth/me')
      useLang.getState().setLang(data.lang)
      set({ me: data, ready: true })
    } catch {
      tokens.clear()
      set({ me: null, ready: true })
    }
  },

  login: async (username, password) => {
    const { data } = await api.post('/auth/login', { username, password })
    tokens.set(data.access_token, data.refresh_token)
    useLang.getState().setLang(data.user.lang)
    set({ me: data.user, ready: true })
  },

  logout: async () => {
    try {
      await api.post('/auth/logout')
    } catch {
      /* sessiya allaqachon uzilgan bo'lishi mumkin */
    }
    tokens.clear()
    set({ me: null })
  },

  /** Huquq tekshiruvi. Super admin — hamma narsaga ruxsat. */
  can: (perm) => {
    const me = get().me
    if (!me) return false
    return me.is_super || me.permissions.includes(perm)
  },
}))
