import { useEffect, useState } from 'react'
import { API_URL, errText, tokens } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useLang, useT } from '@/i18n'
import { Modal, Spinner } from '@/components/ui'
import type { OrderDetail } from '@/lib/types'

/** Proyekt sahifasiga skaner qilib kirish uchun QR-kod modal oynasi. */
export default function QrModal({ order, onClose }: { order: OrderDetail; onClose: () => void }) {
  const t = useT()
  const lang = useLang((s) => s.lang)
  const { can } = useAuth()
  const [src, setSrc] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let revoked: string | null = null
    let cancelled = false
    fetch(`${API_URL}/api/v1/orders/${order.id}/qr`, {
      headers: { Authorization: `Bearer ${tokens.access ?? ''}` },
    })
      .then(async (r) => {
        if (!r.ok) {
          const data = await r.json().catch(() => null)
          throw { response: { data } }
        }
        return r.blob()
      })
      .then((b) => {
        if (cancelled) return
        revoked = URL.createObjectURL(b)
        setSrc(revoked)
      })
      .catch((e) => {
        if (!cancelled) setError(errText(e, lang))
      })
    return () => {
      cancelled = true
      if (revoked) URL.revokeObjectURL(revoked)
    }
  }, [order.id, lang])

  function printQr() {
    if (!src) return
    const w = window.open('', '_blank', 'width=420,height=560')
    if (!w) return
    w.document.write(`<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  @page { margin: 8mm; }
  body { font-family: system-ui, sans-serif; display: flex; flex-direction: column;
         align-items: center; justify-content: center; text-align: center; }
  img { width: 240px; height: 240px; }
  .num { font-family: monospace; font-size: 16px; font-weight: 600; margin-top: 8px; }
  .title { font-size: 12px; color: #555; margin-top: 2px; max-width: 260px; }
</style>
</head>
<body></body>
</html>`)
    w.document.close()
    w.document.title = order.number
    const img = w.document.createElement('img')
    img.src = src
    const num = w.document.createElement('div')
    num.className = 'num'
    num.textContent = order.number
    const title = w.document.createElement('div')
    title.className = 'title'
    title.textContent = order.title ?? ''
    w.document.body.append(img, num, title)
    // document.write dan keyin DOM darhol to'ldirilgani uchun onload o'rniga kichik kechikish ishonchli
    setTimeout(() => {
      w.focus()
      w.print()
    }, 150)
  }

  return (
    <Modal open onClose={onClose} title={`${t('qr_code')} — ${order.number}`}>
      <div className="flex flex-col items-center gap-3 py-2">
        {error && <div className="text-sm text-rose-600 dark:text-rose-400">{error}</div>}
        {!error && !src && <Spinner />}
        {src && (
          <>
            <img src={src} alt="QR" className="h-56 w-56 rounded-lg border border-surface-border dark:border-[#2a3140]" />
            <div className="text-center text-xs text-ink-soft dark:text-[#98a2b3]">{t('qr_modal_hint')}</div>
            <div className="text-center text-[11px] text-ink-faint">{t('qr_print_note')}</div>
            {can('order.qr.print') && (
              <button className="btn-primary mt-1" onClick={printQr}>
                {t('print')}
              </button>
            )}
          </>
        )}
      </div>
    </Modal>
  )
}
