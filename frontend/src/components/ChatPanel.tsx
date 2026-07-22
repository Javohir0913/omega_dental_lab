import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { api, errText } from '@/lib/api'
import { socket } from '@/lib/ws'
import { useAuth } from '@/lib/auth'
import { useLang, useT } from '@/i18n'
import { Avatar, Empty, Modal } from '@/components/ui'
import { toast } from '@/components/Toast'
import { fileSize, timeOnly, dateOnly } from '@/lib/format'
import { clearOrderUnread, patchChatRead } from '@/lib/chatUpdates'
import type { ChatItem, ChatMessage, FileAsset, UserShort } from '@/lib/types'
import { API_URL, tokens } from '@/lib/api'

export default function ChatPanel({
  chatId,
  chatType,
  onClose,
}: {
  chatId: number
  chatType?: string
  onClose?: () => void
}) {
  const [leaving, setLeaving] = useState(false)

  async function leaveChat() {
    if (leaving) return
    setLeaving(true)
    try {
      await api.post(`/chats/${chatId}/leave`)
      qc.invalidateQueries({ queryKey: ['chats'] })
      onClose?.()
    } catch (e) {
      toast(errText(e, lang), 'error')
    } finally {
      setLeaving(false)
    }
  }
  const t = useT()
  const lang = useLang((s) => s.lang)
  const me = useAuth((s) => s.me)
  const qc = useQueryClient()
  const { can } = useAuth()

  const [text, setText] = useState('')
  const [pending, setPending] = useState<FileAsset[]>([])
  const [sending, setSending] = useState(false)
  const [showMembers, setShowMembers] = useState(false)
  const bottom = useRef<HTMLDivElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentionIndex, setMentionIndex] = useState(0)

  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editText, setEditText] = useState('')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [selectMode, setSelectMode] = useState(false)
  const [showForward, setShowForward] = useState(false)
  const [forwardMsgs, setForwardMsgs] = useState<ChatMessage[]>([])
  const [menuMsg, setMenuMsg] = useState<ChatMessage | null>(null)
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 })
  const menuRef = useRef<HTMLDivElement>(null)

  const { data: messages = [] } = useQuery({
    queryKey: ['chat', chatId],
    queryFn: async () => (await api.get<ChatMessage[]>(`/chats/${chatId}/messages`)).data,
  })

  const { data: chat } = useQuery({
    queryKey: ['chat-info', chatId],
    queryFn: async () => (await api.get<ChatItem>(`/chats/${chatId}`)).data,
  })

  const isOrder = (chatType ?? chat?.type) === 'order'

  useEffect(() => {
    socket.join(`chat:${chatId}`)
    const offs = [
      socket.on('chat.message', (m: ChatMessage) => {
        if (m.chat_id !== chatId) return
        qc.setQueryData<ChatMessage[]>(['chat', chatId], (old = []) =>
          old.some((x) => x.id === m.id) ? old : [...old, m],
        )
        if (m.author?.id !== me?.id) {
          api.post(`/chats/${chatId}/read`).then(() => {
            patchChatRead(qc, chatId)
            if (chat?.order_id) clearOrderUnread(qc, chat.order_id)
          }).catch(() => {})
        }
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
    api.post(`/chats/${chatId}/read`).then(() => {
      patchChatRead(qc, chatId)
      if (chat?.order_id) clearOrderUnread(qc, chat.order_id)
    }).catch(() => {})
  }, [messages.length, chatId, chat?.order_id, qc])

  useEffect(() => {
    const onClick = () => setMenuMsg(null)
    window.addEventListener('click', onClick)
    return () => window.removeEventListener('click', onClick)
  }, [])

  // Context menu viewport-boundary detection
  useLayoutEffect(() => {
    if (!menuMsg || !menuRef.current) return
    const el = menuRef.current
    const rect = el.getBoundingClientRect()
    const { innerWidth, innerHeight } = window
    let x = menuPos.x
    let y = menuPos.y
    if (x + rect.width > innerWidth - 8) x = innerWidth - rect.width - 8
    if (y + rect.height > innerHeight - 8) y = innerHeight - rect.height - 8
    el.style.left = `${Math.max(8, x)}px`
    el.style.top = `${Math.max(8, y)}px`
  }, [menuMsg, menuPos])

  async function attach(files: FileList | null) {
    if (!files?.length) return
    for (const f of Array.from(files)) {
      const fd = new FormData()
      fd.append('file', f)
      fd.append('entity', 'message')
      fd.append('entity_id', '0')
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
      const { data: sentMsg } = await api.post<ChatMessage>(`/chats/${chatId}/messages`, {
        text: body || null,
        file_ids: pending.map((f) => f.id),
        reply_to_id: replyTo?.id ?? null,
      })
      qc.setQueryData<ChatMessage[]>(['chat', chatId], (old = []) =>
        old.some((x) => x.id === sentMsg.id) ? old : [...old, sentMsg],
      )
      qc.invalidateQueries({ queryKey: ['chats'] })
      setText('')
      setPending([])
      setReplyTo(null)
    } catch (e) {
      toast(errText(e, lang), 'error')
    } finally {
      setSending(false)
    }
  }

  const mentionMembers = (
    mentionQuery === null
      ? []
      : (chat?.members ?? []).filter((m) =>
          m.full_name.toLowerCase().includes(mentionQuery.toLowerCase()),
        )
  ).slice(0, 6)

  function handleTextChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value
    setText(val)
    const pos = e.target.selectionStart ?? val.length
    const m = val.slice(0, pos).match(/(?:^|\s)@([^\s@]*)$/)
    if (m) {
      setMentionQuery(m[1])
      setMentionIndex(0)
    } else {
      setMentionQuery(null)
    }
  }

  function selectMention(u: UserShort) {
    const pos = textareaRef.current?.selectionStart ?? text.length
    const uptoCursor = text.slice(0, pos)
    const m = uptoCursor.match(/(?:^|\s)@([^\s@]*)$/)
    if (!m) return
    const atIndex = uptoCursor.lastIndexOf('@')
    const before = text.slice(0, atIndex)
    const after = text.slice(pos)
    const mentionToken = `@${u.full_name.replace(/\s+/g, '_')} `
    const newText = before + mentionToken + after
    setText(newText)
    setMentionQuery(null)
    requestAnimationFrame(() => {
      const newPos = before.length + mentionToken.length
      textareaRef.current?.focus()
      textareaRef.current?.setSelectionRange(newPos, newPos)
    })
  }

  function handleTextKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (mentionQuery !== null && mentionMembers.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setMentionIndex((i) => Math.min(i + 1, mentionMembers.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setMentionIndex((i) => Math.max(i - 1, 0))
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        selectMention(mentionMembers[mentionIndex])
        return
      }
      if (e.key === 'Escape') {
        setMentionQuery(null)
        return
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  async function editMessage(msg: ChatMessage) {
    if (!editText.trim()) return
    try {
      await api.patch(`/chats/${chatId}/messages/${msg.id}`, { text: editText.trim() })
      setEditingId(null)
      setEditText('')
    } catch (e) {
      toast(errText(e, lang), 'error')
    }
  }

  async function deleteMessage(msg: ChatMessage) {
    if (!confirm(lang === 'ru' ? 'Удалить сообщение?' : 'Xabarni o\'chirish?')) return
    try {
      await api.delete(`/chats/${chatId}/messages/${msg.id}`)
      qc.invalidateQueries({ queryKey: ['chats'] })
    } catch (e) {
      toast(errText(e, lang), 'error')
    }
  }

  function openMenu(e: React.MouseEvent, msg: ChatMessage) {
    e.stopPropagation()
    e.preventDefault()
    setMenuMsg(msg)
    setMenuPos({ x: e.clientX, y: e.clientY })
  }

  function startReply(msg: ChatMessage) {
    setMenuMsg(null)
    setEditingId(null)
    setReplyTo(msg)
  }

  function startEdit(msg: ChatMessage) {
    setMenuMsg(null)
    setReplyTo(null)
    setEditingId(msg.id)
    setEditText(msg.text ?? '')
  }

  function startForward(msg: ChatMessage) {
    setMenuMsg(null)
    setForwardMsgs([msg])
    setShowForward(true)
  }

  function startSelect(msg: ChatMessage) {
    setMenuMsg(null)
    setSelectMode(true)
    setSelected(new Set([msg.id]))
  }

  function startDeleteSelected() {
    if (!confirm(lang === 'ru' ? `Удалить ${selected.size} сообщений?` : `${selected.size} ta xabarni o'chirish?`)) return
    ;(async () => {
      for (const id of selected) {
        try { await api.delete(`/chats/${chatId}/messages/${id}`) } catch {}
      }
      setSelected(new Set())
      setSelectMode(false)
    })()
  }

  function toggleSelect(msgId: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(msgId)) next.delete(msgId)
      else next.add(msgId)
      return next
    })
  }

  function forwardSelected(msgs: ChatMessage[]) {
    setForwardMsgs(msgs)
    setShowForward(true)
    setSelectMode(false)
  }

  function copyLink(msg: ChatMessage) {
    const url = `${window.location.origin}/chats/${chatId}?msg=${msg.id}`
    navigator.clipboard.writeText(url).then(() => toast(lang === 'ru' ? 'Ссылка скопирована' : 'Havola nusxalandi', 'info'))
    setMenuMsg(null)
  }

  let lastDay = ''

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Sarlavha */}
      <div className="flex flex-wrap items-center gap-2 border-b border-surface-border px-3 py-1.5 dark:border-[#2a3140]">
        <div className="flex flex-1 flex-wrap gap-1">
          {(chat?.members ?? []).slice(0, 6).map((m) => (
            <span key={m.id} className="flex items-center gap-1 rounded-md bg-surface-muted px-1.5 py-0.5 text-[10px] dark:bg-[#242b38]">
              <Avatar name={m.full_name} size={14} />
              {m.full_name}
            </span>
          ))}
          {(chat?.members?.length ?? 0) > 6 && (
            <span className="text-[10px] text-ink-faint">+{chat!.members.length - 6}</span>
          )}
        </div>
        {selected.size > 0 && (
          <>
            <button onClick={() => forwardSelected(Array.from(selected).map((id) => messages.find((m) => m.id === id)!).filter(Boolean))} className="btn-ghost px-1.5 text-[11px]">
              ➤ {t('forward') ?? 'Переслать'}
            </button>
            <button onClick={startDeleteSelected} className="btn-ghost px-1.5 text-[11px] text-rose-500">
              ✕ {t('delete') ?? 'Удалить'}
            </button>
          </>
        )}
        {selectMode && (
          <button onClick={() => { setSelectMode(false); setSelected(new Set()) }} className="btn-ghost px-1.5 text-[11px]">
            ✕
          </button>
        )}
        {isOrder && can('chat.order') && (
          <button onClick={() => setShowMembers(true)} className="btn-ghost px-1.5 text-[11px]" title={t('add_member')}>
            ✚
          </button>
        )}
        {isOrder && (
          <button onClick={leaveChat} disabled={leaving} className="btn-ghost px-1.5 text-[11px] text-rose-500" title={lang === 'ru' ? 'Покинуть чат' : 'Chatdan chiqish'}>
            {leaving ? '...' : lang === 'ru' ? 'Покинуть' : 'Chiqish'}
          </button>
        )}
      </div>

      {/* Xabarlar */}
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {messages.length === 0 && (
          <div className="py-10 text-center text-xs text-ink-faint">{t('no_messages')}</div>
        )}

        {messages.map((m) => {
          const day = dateOnly(m.created_at)
          const showDay = day !== lastDay
          lastDay = day
          const mine = m.author?.id === me?.id

          return (
            <div key={m.id} className={clsx('group relative', selected.has(m.id) && 'rounded-lg bg-brand-50/60 dark:bg-brand-900/25')}>
              {showDay && (
                <div className="my-3 text-center">
                  <span className="chip bg-surface-muted text-ink-faint dark:bg-[#242b38]">{day}</span>
                </div>
              )}

              {selected.has(m.id) && (
                <div className="absolute left-0 top-1/2 z-10 -translate-y-1/2">
                  <input type="checkbox" checked onChange={() => toggleSelect(m.id)} className="h-4 w-4" />
                </div>
              )}

              {m.is_system ? (
                <div className={clsx('my-2 text-center', selected.has(m.id) && 'pl-8')} onContextMenu={(e) => openMenu(e, m)}>
                  <span className="chip whitespace-pre-line bg-surface-muted text-ink-faint dark:bg-[#242b38]">{m.text}</span>
                </div>
              ) : (
                <div className={clsx('flex gap-2', mine && 'flex-row-reverse', selected.has(m.id) && 'pl-8')} onContextMenu={(e) => openMenu(e, m)}>
                  <div className="shrink-0" onClick={() => !selectMode && setSelectMode(true)}>
                    <Avatar name={m.author?.full_name} size={26} />
                  </div>
                  <div className={clsx('max-w-[75%]', mine && 'items-end text-right')}>
                    <div className="mb-0.5 text-[10px] text-ink-faint">
                      {m.author?.full_name} · {timeOnly(m.created_at)}
                      {m.edited_at && ' · ✎'}
                    </div>

                    {m.reply_to_id && <ReplyPreview chatId={chatId} replyToId={m.reply_to_id} />}

                    {editingId === m.id ? (
                      <div className="flex flex-col gap-1">
                        <textarea className="input min-h-[60px] resize-none py-1.5 text-[13px]" value={editText} onChange={(e) => setEditText(e.target.value)} autoFocus />
                        <div className="flex justify-end gap-1">
                          <button onClick={() => { setEditingId(null); setEditText('') }} className="btn-ghost px-2 py-0.5 text-[11px]">{t('cancel') ?? 'Отмена'}</button>
                          <button onClick={() => editMessage(m)} className="btn-primary px-2 py-0.5 text-[11px]">{t('save') ?? 'Сохранить'}</button>
                        </div>
                      </div>
                    ) : (
                      <div className={clsx('inline-block whitespace-pre-wrap break-words rounded-xl px-3 py-1.5 text-left text-[13px]', mine ? 'bg-brand-500 text-white' : 'bg-surface-muted text-ink dark:bg-[#242b38] dark:text-[#e6e9ee]')}>
                        <MessageText text={m.text} />
                        {m.attachments.length > 0 && (
                          <div className="mt-1.5 space-y-1">
                            {m.attachments.map((a) => <Attachment key={a.id} file={a} inverted={mine} />)}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Hover actions */}
                    {!editingId && !selectMode && (
                      <div className={clsx('mt-0.5 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100', mine ? 'justify-end' : 'justify-start')}>
                        <button onClick={() => startReply(m)} className="text-[10px] text-ink-faint hover:text-brand-500">↩</button>
                        {mine && <button onClick={() => startEdit(m)} className="text-[10px] text-ink-faint hover:text-brand-500">✎</button>}
                        {mine && <button onClick={() => deleteMessage(m)} className="text-[10px] text-ink-faint hover:text-rose-500">✕</button>}
                        <button onClick={() => startForward(m)} className="text-[10px] text-ink-faint hover:text-brand-500">➤</button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
        <div ref={bottom} />
      </div>

      {/* Context menu */}
      {menuMsg && (
        <div ref={menuRef} className="fixed z-50 rounded-lg border border-surface-border bg-white py-1 shadow-pop dark:border-[#2a3140] dark:bg-[#1a202c]" style={{ left: 0, top: 0 }}>
          <button onClick={() => startReply(menuMsg!)} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-surface-muted dark:hover:bg-[#222836]">↩ {t('reply') ?? 'Ответить'}</button>
          {menuMsg.author?.id === me?.id && (
            <>
              <button onClick={() => startEdit(menuMsg!)} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-surface-muted dark:hover:bg-[#222836]">✎ {t('edit') ?? 'Редактировать'}</button>
              <button onClick={() => deleteMessage(menuMsg!)} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-rose-500 hover:bg-surface-muted dark:hover:bg-[#222836]">✕ {t('delete') ?? 'Удалить'}</button>
            </>
          )}
          <button onClick={() => startForward(menuMsg!)} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-surface-muted dark:hover:bg-[#222836]">➤ {t('forward') ?? 'Переслать'}</button>
          <button onClick={() => startSelect(menuMsg!)} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-surface-muted dark:hover:bg-[#222836]">☐ {t('select') ?? 'Выбрать'}</button>
          <button onClick={() => copyLink(menuMsg!)} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-surface-muted dark:hover:bg-[#222836]">🔗 {t('copy_link') ?? 'Копировать ссылку'}</button>
        </div>
      )}

      {/* Reply preview */}
      {replyTo && (
        <div className="flex items-center gap-2 border-t border-surface-border bg-surface-muted px-3 py-1.5 dark:border-[#2a3140] dark:bg-[#242b38]">
          <div className="flex-1 truncate text-xs">
            <span className="font-medium">{replyTo.author?.full_name}: </span>
            {replyTo.text ?? '📎'}
          </div>
          <button onClick={() => setReplyTo(null)} className="text-ink-faint hover:text-rose-500">✕</button>
        </div>
      )}

      {pending.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-t border-surface-border px-3 py-2 dark:border-[#2a3140]">
          {pending.map((f) => (
            <span key={f.id} className="chip bg-surface-muted text-ink-soft dark:bg-[#242b38]">
              📎 {f.name}
              <button onClick={() => setPending((p) => p.filter((x) => x.id !== f.id))} className="ml-1 text-ink-faint hover:text-rose-500">✕</button>
            </span>
          ))}
        </div>
      )}

      <div className="relative flex items-end gap-2 border-t border-surface-border p-2 dark:border-[#2a3140]">
        {mentionQuery !== null && mentionMembers.length > 0 && (
          <div className="absolute bottom-full left-2 z-20 mb-1 max-h-[40vh] w-56 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-lg border border-surface-border bg-white shadow-pop dark:border-[#2f3745] dark:bg-[#1e2533]">
            {mentionMembers.map((u, i) => (
              <button
                key={u.id}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); selectMention(u) }}
                className={clsx(
                  'flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-sm hover:bg-surface-muted dark:hover:bg-[#222836]',
                  i === mentionIndex && 'bg-brand-50 dark:bg-brand-900/20',
                )}
              >
                <Avatar name={u.full_name} size={22} />
                <span className="truncate">{u.full_name}</span>
              </button>
            ))}
          </div>
        )}
        <input ref={fileInput} type="file" multiple className="hidden" onChange={(e) => attach(e.target.files)} />
        <button onClick={() => fileInput.current?.click()} className="btn-ghost px-2" title={t('attach')}>📎</button>
        <textarea ref={textareaRef} className="input max-h-32 min-h-[38px] flex-1 resize-none py-2" placeholder={t('message_placeholder')} value={text} rows={1}
          onChange={handleTextChange}
          onKeyDown={handleTextKeyDown} />
        <button className="btn-primary px-3" onClick={send} disabled={sending || (!text.trim() && pending.length === 0)}>➤</button>
      </div>

      {showMembers && chat && (
        <AddMemberModal chatId={chatId} members={chat.members ?? []} onClose={() => setShowMembers(false)} onDone={() => { qc.invalidateQueries({ queryKey: ['chat-info', chatId] }); qc.invalidateQueries({ queryKey: ['chats'] }) }} />
      )}

      {showForward && <ForwardModal msgs={forwardMsgs} chatId={chatId} onClose={() => { setShowForward(false); setForwardMsgs([]) }} onDone={() => { qc.invalidateQueries({ queryKey: ['chats'] }); toast(lang === 'ru' ? 'Сообщение отправлено' : 'Xabar yuborildi', 'info') }} />}
    </div>
  )
}

function ReplyPreview({ chatId, replyToId }: { chatId: number; replyToId: number }) {
  const qc = useQueryClient()
  const messages = qc.getQueryData<ChatMessage[]>(['chat', chatId]) ?? []
  const msg = messages.find((m) => m.id === replyToId)
  if (!msg) return null
  return (
    <div className="mb-1 rounded bg-black/5 px-2 py-1 text-[11px] text-ink-faint dark:bg-white/5">
      <span className="font-medium">{msg.author?.full_name}: </span>
      {msg.text ?? '📎'}
    </div>
  )
}

function ForwardModal({ msgs, chatId, onClose, onDone }: { msgs: ChatMessage[]; chatId: number; onClose: () => void; onDone: () => void }) {
  const t = useT()
  const lang = useLang((s) => s.lang)
  const me = useAuth((s) => s.me)
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)

  const { data: users } = useQuery({
    queryKey: ['users-forward', q],
    queryFn: async () => (await api.get<{ items: UserShort[] }>('/users', { params: { q: q || undefined, is_active: true, size: 30 } })).data,
  })

  const candidates = (users?.items ?? []).filter((u) => u.id !== me?.id)

  async function forwardTo(userId: number) {
    setBusy(true)
    try {
      const { data: chat } = await api.post<{ id: number }>('/chats/direct', { user_id: userId })
      for (const msg of msgs) {
        await api.post(`/chats/${chat.id}/messages`, { text: msg.text, file_ids: [] })
      }
      onDone()
      onClose()
    } catch (e) {
      toast(errText(e, lang), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={lang === 'ru' ? 'Переслать сообщение' : 'Xabarni yuborish'}>
      <input className="input mb-3" placeholder={t('search')} value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      <div className="max-h-80 space-y-1 overflow-y-auto">
        {candidates.length === 0 && <Empty />}
        {candidates.map((u) => (
          <button key={u.id} onClick={() => forwardTo(u.id)} disabled={busy}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-muted dark:hover:bg-[#222836]">
            <Avatar name={u.full_name} />
            <div className="truncate">{u.full_name}</div>
          </button>
        ))}
      </div>
    </Modal>
  )
}

function MessageText({ text }: { text: string | null }) {
  if (!text) return null
  const parts = text.split(/(@\S+)/g)
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('@') ? (
          <span key={i} className="font-semibold text-brand-600 dark:text-brand-400">{p}</span>
        ) : (
          p
        ),
      )}
    </>
  )
}

function Attachment({ file, inverted }: { file: FileAsset; inverted?: boolean }) {
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
    return () => { if (revoked) URL.revokeObjectURL(revoked) }
  }, [file])

  async function download() {
    const r = await fetch(`${API_URL}${file.url}`, { headers: { Authorization: `Bearer ${tokens.access}` } })
    const blob = await r.blob()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = file.name
    a.click()
    URL.revokeObjectURL(a.href)
  }

  if (file.is_image && url) {
    return <img src={url} alt={file.name} onClick={download} className="max-h-52 cursor-pointer rounded-lg" />
  }

  return (
    <button onClick={download} className={clsx('flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-[11px]', inverted ? 'bg-white/15 hover:bg-white/25' : 'bg-black/5 hover:bg-black/10')}>
      <span>📄</span>
      <span className="flex-1 truncate text-left">{file.name}</span>
      <span className="opacity-60">{fileSize(file.size)}</span>
    </button>
  )
}

function AddMemberModal({ chatId, members, onClose, onDone }: { chatId: number; members: UserShort[]; onClose: () => void; onDone: () => void }) {
  const t = useT()
  const lang = useLang((s) => s.lang)
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)

  const { data } = useQuery({
    queryKey: ['users-add', q],
    queryFn: async () => (await api.get<{ items: UserShort[] }>('/users', { params: { q: q || undefined, is_active: true, size: 30 } })).data,
  })

  const memberIds = new Set(members.map((m) => m.id))
  const available = (data?.items ?? []).filter((u) => !memberIds.has(u.id))

  async function addUser(userId: number) {
    setBusy(true)
    try {
      await api.post(`/chats/${chatId}/members`, { user_ids: [userId] })
      onDone()
    } catch (e) {
      toast(errText(e, lang), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="Добавить участника">
      <input className="input mb-3" placeholder={t('search')} value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      <div className="max-h-80 space-y-1 overflow-y-auto">
        {available.length === 0 && <Empty />}
        {available.map((u) => (
          <button key={u.id} onClick={() => addUser(u.id)} disabled={busy}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-muted dark:hover:bg-[#222836]">
            <Avatar name={u.full_name} />
            <div className="truncate">{u.full_name}</div>
          </button>
        ))}
      </div>
    </Modal>
  )
}
