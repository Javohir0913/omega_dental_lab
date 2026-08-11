import { useEffect, useState } from 'react'

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false,
  )

  useEffect(() => {
    const mql = window.matchMedia(query)
    const handler = () => setMatches(mql.matches)
    handler()
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [query])

  return matches
}

/** Kanban kabi drag&drop asosidagi UI larni mobil qurilmada boshqacha ko'rsatish uchun. */
export function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 767px)')
}
