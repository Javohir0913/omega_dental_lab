import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { api, errText } from '@/lib/api'
import { socket } from '@/lib/ws'
import { useAuth } from '@/lib/auth'
import { useLang, useT } from '@/i18n'
import { Avatar } from '@/components/ui'
import { toast } from '@/components/Toast'
import { fileSize, timeOnly, dateOnly } from '@/lib/format'
import type { ChatMessage, FileAsset } from '@/lib/types'
import { API_URL, tokens } from '@/lib/api'

export default function ChatPanel({ chatId }: { chatId: number }) {
  const t = useT()
  const lang = useLang((s) => s.lang)
  const me = useAuth((s) => s.me)
  const qc = useQueryClient()

  const [text, setText] = useState('')
  const [pending, setPending] = useState<FileAsset[]>([])
  const [sending, setSending] = useState(false)
  const bottom = useRef<HTMLDivElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const { data: messages = [] } = useQuery({
    queryKey: ['chat', chatId],
    queryFn: async () => (await api.get<ChatMessage[]>(`/chats/${chatId}/messages`)).data,
  })

  // Real-time: shu chat xonasiga qo'shilamiz
  useEffect(() => {
    socket.join(`chat:${chatId}`)
    const offs = [
      socket.on('chat.message', (m: ChatMessage) => {
        if (m.chat_id !== chatId) return
        qc.setQueryData<ChatMessage[]>(['chat', chatId], (old = []) =>
          old.some((x) => x.id === m.id) ? old : [...old, m],
        )
      }),
      socket.on('chat.message_edited', (m: ChatMessage) => {
        if (m.chat_id !== chatId) return
        qc.setQueryData<ChatMessage[]>(['chat', chatId], (old = []) =>
          old.map((x) => (x.id === m.id ? m : x)),
        )
      }),
      socket.on('chat.message_deleted', ({ id }: { id: number }) =>
        qc.setQueryData<ChatMessage[]>(['chat', chatId], (old = []) =>
          old.filter((x) => x.id !== id),
        ),
      ),
    ]
    return () => {
      socket.leave(`chat:${chatId}`)
      offs.forEach((off) => off())
    }
  }, [chatId, qc])

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth' })
    api.post(`/chats/${chatId}/read`).catch(() => {})
  }, [messages.length, chatId])

  async function attach(files: FileList | null) {
    if (!files?.length) return
    for (const f of Array.from(files)) {
      const fd = new FormData()
      fd.append('file', f)
      fd.append('entity', 'message')
      fd.append('entity_id', '0') // xabar yaratilgach backend bog'laydi
      try {
        const { data } = await api.post<FileAsset>('/files', fd)
        setPending((p) => [...p, data])
      } catch (e) {
        toast(errText(e, lang), 'error')
      }
    }
    if (fileInput.current) fileInput.current.value = ''
  }

  async function send() {
    const body = text.trim()
    if (!body && pending.length === 0) return
    setSending(true)
    try {
      await api.post(`/chats/${chatId}/messages`, {
        text: body || null,
        file_ids: pending.map((f) => f.id),
      })
      setText('')
      setPending([])
    } catch (e) {
      toast(errText(e, lang), 'error')
    } finally {
      setSending(false)
    }
  }

  let lastDay = ''

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {messages.length === 0 && (
          <div className="py-10 text-center text-xs text-ink-faint">{t('no_messages')}</div>
        )}

        {messages.map((m) => {
          const day = dateOnly(m.created_at)
          const showDay = day !== lastDay
          lastDay = day
          const mine = m.author?.id === me?.id

          return (
            <div key={m.id}>
              {showDay && (
                <div className="my-3 text-center">
                  <span className="chip bg-surface-muted text-ink-faint dark:bg-[#242b38]">
                    {day}
                  </span>
                </div>
              )}

              {m.is_system ? (
                <div className="my-2 text-center">
                  <span className="chip whitespace-pre-line bg-surface-muted text-ink-faint dark:bg-[#242b38]">
                    {m.text}
                  </span>
                </div>
              ) : (
                <div className={clsx('flex gap-2', mine && 'flex-row-reverse')}>
                  <Avatar name={m.author?.full_name} size={26} />
                  <div className={clsx('max-w-[75%]', mine && 'items-end text-right')}>
                    <div className="mb-0.5 text-[10px] text-ink-faint">
                      {m.author?.full_name} · {timeOnly(m.created_at)}
                      {m.edited_at && ' ·  ✎'}
                    </div>
                    <div
                      className={clsx(
                        'inline-block whitespace-pre-wrap break-words rounded-xl px-3 py-1.5 text-left text-[13px]',
                        mine
                          ? 'bg-brand-500 text-white'
                          : 'bg-surface-muted text-ink dark:bg-[#242b38] dark:text-[#e6e9ee]',
                      )}
                    >
                      {m.text}
                      {m.attachments.length > 0 && (
                        <div className="mt-1.5 space-y-1">
                          {m.attachments.map((a) => (
                            <Attachment key={a.id} file={a} inverted={mine} />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
        <div ref={bottom} />
      </div>

      {pending.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-t border-surface-border px-3 py-2 dark:border-[#2a3140]">
          {pending.map((f) => (
            <span key={f.id} className="chip bg-surface-muted text-ink-soft dark:bg-[#242b38]">
              📎 {f.name}
              <button
                onClick={() => setPending((p) => p.filter((x) => x.id !== f.id))}
                className="ml-1 text-ink-faint hover:text-rose-500"
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2 border-t border-surface-border p-2 dark:border-[#2a3140]">
        <input
          ref={fileInput}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => attach(e.target.files)}
        />
        <button
          onClick={() => fileInput.current?.click()}
          className="btn-ghost px-2"
          title={t('attach')}
        >
          📎
        </button>
        <textarea
          className="input max-h-32 min-h-[38px] flex-1 resize-none py-2"
          placeholder={t('message_placeholder')}
          value={text}
          rows={1}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
        />
        <button
          className="btn-primary px-3"
          onClick={send}
          disabled={sending || (!text.trim() && pending.length === 0)}
        >
          ➤
        </button>
      </div>
    </div>
  )
}

function Attachment({ file, inverted }: { file: FileAsset; inverted?: boolean }) {
  // Rasm/faylni ochish uchun token kerak — brauzer <img src> ga header qo'shmaydi,
  // shuning uchun tokenni so'rov satrida uzatamiz emas: yuklab olamiz blob orqali.
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let revoked: string | null = null
    if (!file.is_image) return
    fetch(`${API_URL}${file.url}`, { headers: { Authorization: `Bearer ${tokens.access}` } })
      .then((r) => r.blob())
      .then((b) => {
        revoked = URL.createObjectURL(b)
        setUrl(revoked)
      })
      .catch(() => {})
    return () => {
      if (revoked) URL.revokeObjectURL(revoked)
    }
  }, [file])

  async function download() {
    const r = await fetch(`${API_URL}${file.url}`, {
      headers: { Authorization: `Bearer ${tokens.access}` },
    })
    const blob = await r.blob()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = file.name
    a.click()
    URL.revokeObjectURL(a.href)
  }

  if (file.is_image && url) {
    return (
      <img
        src={url}
        alt={file.name}
        onClick={download}
        className="max-h-52 cursor-pointer rounded-lg"
      />
    )
  }

  return (
    <button
      onClick={download}
      className={clsx(
        'flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-[11px]',
        inverted ? 'bg-white/15 hover:bg-white/25' : 'bg-black/5 hover:bg-black/10',
      )}
    >
      <span>📄</span>
      <span className="flex-1 truncate text-left">{file.name}</span>
      <span className="opacity-60">{fileSize(file.size)}</span>
    </button>
  )
}
