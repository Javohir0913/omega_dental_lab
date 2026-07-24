import { useState } from 'react'
import { api, errText } from '@/lib/api'
import { useLang, useT } from '@/i18n'
import { Field, Modal } from '@/components/ui'
import type { OrderCard, OrderDetail } from '@/lib/types'

/**
 * Ishni pauza qilish oynasi — sababi majburiy, boshqalarga ham shu sabab ko'rinadi.
 */
export default function PauseModal({
  order,
  onClose,
  onDone,
}: {
  order: OrderCard | OrderDetail
  onClose: () => void
  onDone: (updated: OrderDetail) => void
}) {
  const t = useT()
  const lang = useLang((s) => s.lang)

  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (!reason.trim()) {
      setError(t('required'))
      return
    }
    setBusy(true)
    setError(null)
    try {
      const { data } = await api.post<OrderDetail>(`/orders/${order.id}/pause`, {
        reason: reason.trim(),
      })
      onDone(data)
      onClose()
    } catch (e) {
      setError(errText(e, lang))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t('pause')}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose} disabled={busy}>
            {t('cancel')}
          </button>
          <button className="btn-primary" onClick={submit} disabled={busy}>
            {busy ? t('loading') : t('pause')}
          </button>
        </>
      }
    >
      <div className="mb-3 text-xs text-ink-faint">
        {order.number} · {order.title}
      </div>

      <p className="mb-3 text-sm text-ink-soft">{t('pause_confirm')}</p>

      <Field label={t('pause_reason')} required hint={t('pause_reason_hint')}>
        <textarea
          className="input min-h-[70px]"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          autoFocus
        />
      </Field>

      {error && (
        <div className="mt-3 whitespace-pre-line rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {error}
        </div>
      )}
    </Modal>
  )
}
