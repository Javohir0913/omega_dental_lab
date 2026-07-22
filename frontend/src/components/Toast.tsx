import { useEffect, useState } from 'react'
import clsx from 'clsx'

type Kind = 'ok' | 'error' | 'info'
interface Item {
  id: number
  text: string
  kind: Kind
}

const EVT = 'omega:toast'
let seq = 1

export function toast(text: string, kind: Kind = 'ok') {
  window.dispatchEvent(new CustomEvent(EVT, { detail: { id: seq++, text, kind } }))
}

export function ToastHost() {
  const [items, setItems] = useState<Item[]>([])

  useEffect(() => {
    const on = (e: Event) => {
      const item = (e as CustomEvent<Item>).detail
      setItems((prev) => [...prev, item])
      window.setTimeout(
        () => setItems((prev) => prev.filter((i) => i.id !== item.id)),
        item.kind === 'error' ? 6000 : 3500,
      )
    }
    window.addEventListener(EVT, on)
    return () => window.removeEventListener(EVT, on)
  }, [])

  return (
    <div className="pointer-events-none fixed inset-x-3 bottom-3 z-[100] flex max-w-sm flex-col gap-2 sm:inset-x-auto sm:bottom-4 sm:right-4 sm:w-80">
      {items.map((i) => (
        <div
          key={i.id}
          className={clsx(
            'pointer-events-auto whitespace-pre-line rounded-lg border px-3 py-2 text-sm shadow-pop',
            i.kind === 'ok' && 'border-emerald-200 bg-emerald-50 text-emerald-800',
            i.kind === 'error' && 'border-rose-200 bg-rose-50 text-rose-800',
            i.kind === 'info' && 'border-brand-200 bg-brand-50 text-brand-800',
          )}
        >
          {i.text}
        </div>
      ))}
    </div>
  )
}
