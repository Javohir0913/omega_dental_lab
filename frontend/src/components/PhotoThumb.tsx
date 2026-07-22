import { useEffect, useState } from 'react'
import { API_URL, tokens } from '@/lib/api'
import type { FileOut } from '@/lib/types'

const RAW_EXTS = ['cr2', 'cr3']

function fileExt(name: string) {
  return name.split('.').pop()?.toLowerCase() ?? ''
}

// Proyekt rasmi — format qanday bo'lishidan qat'i nazar (jpg/png/heic/cr2/cr3)
// ko'rsatishga harakat qiladi. HEIC serverda yuklashda JPEG'ga aylantiriladi,
// CR2/CR3 uchun esa /preview endpoint orqali JPEG ko'rinishi olinadi.
export default function PhotoThumb({ photo, className }: { photo: FileOut | null; className?: string }) {
  const [src, setSrc] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!photo) return
    let revoked: string | null = null
    let cancelled = false
    const ext = fileExt(photo.name)
    const url = RAW_EXTS.includes(ext) ? `${API_URL}${photo.url}/preview` : `${API_URL}${photo.url}`
    fetch(url, { headers: { Authorization: `Bearer ${tokens.access ?? ''}` } })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.blob()
      })
      .then((b) => {
        if (cancelled) return
        revoked = URL.createObjectURL(b)
        setSrc(revoked)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
      if (revoked) URL.revokeObjectURL(revoked)
    }
  }, [photo?.id, photo?.url, photo?.name])

  return (
    <div className={className ?? 'relative h-full w-full'}>
      {!photo || failed ? (
        <div className="flex h-full w-full items-center justify-center bg-surface-muted dark:bg-[#1e2533]">
          <span className="text-3xl opacity-40">🦷</span>
        </div>
      ) : !src ? (
        <div className="flex h-full w-full items-center justify-center bg-surface-muted dark:bg-[#1e2533]">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-surface-border border-t-brand-500 dark:border-[#334155]" />
        </div>
      ) : (
        <img src={src} alt="" className="h-full w-full object-cover" />
      )}
    </div>
  )
}
