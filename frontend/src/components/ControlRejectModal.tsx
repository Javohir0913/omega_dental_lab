import { useState } from 'react'
import { api, errText } from '@/lib/api'
import { useLang, useT } from '@/i18n'
import { Field, Modal } from '@/components/ui'
import type { OrderCard, OrderDetail } from '@/lib/types'

/** Kontrolyor control'ni rad etadi — sababi majburiy. */
export default function ControlRejectModal({
  order,
  onClose,
  onDone,
}: {
  order: OrderCard | OrderDetail
  onClose: () => void
  onDone: () => void
}) {
  const t = useT()
  const lang = useLang((s) => s.lang)

  const [comment, setComment] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (!comment.trim()) {
      setError(t('required'))
      return
    }
    setBusy(true)
    setError(null)
    try {
      await api.post(`/orders/${order.id}/control/reject`, { comment: comment.trim() })
      onDone()
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
      title={t('control_reject')}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose} disabled={busy}>
            {t('cancel')}
          </button>
          <button className="btn-primary" onClick={submit} disabled={busy}>
            {busy ? t('loading') : t('control_reject')}
          </button>
        </>
      }
    >
      <div className="mb-3 text-xs text-ink-faint">
        {order.number} · {order.title}
      </div>

      <Field label={t('control_reject_reason')} required>
        <textarea
          className="input min-h-[70px]"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
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
