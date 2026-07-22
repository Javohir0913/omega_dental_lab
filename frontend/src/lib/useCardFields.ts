import { useState, useCallback } from 'react'

const STORAGE_KEY = 'omega_kanban_fields'

const DEFAULT_VISIBILITY: Record<string, boolean> = {
  patient: true,
  doctor: true,
  services: true,
  responsible: true,
  deadline: true,
  priority: true,
  files: true,
}

export function useCardFields() {
  const [visibility, setVisibility] = useState<Record<string, boolean>>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) return { ...DEFAULT_VISIBILITY, ...JSON.parse(stored) }
    } catch { /* ignore */ }
    return { ...DEFAULT_VISIBILITY }
  })

  const toggle = useCallback((key: string) => {
    setVisibility((prev) => {
      const next = { ...prev, [key]: !prev[key] }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  const showAll = useCallback(() => {
    setVisibility(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_VISIBILITY))
      return { ...DEFAULT_VISIBILITY }
    })
  }, [])

  return { visibility, toggle, showAll }
}
