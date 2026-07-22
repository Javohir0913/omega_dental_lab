import type { QueryClient } from '@tanstack/react-query'
import type { ChatItem, ChatMessage, KanbanColumn, OrderDetail } from '@/lib/types'

export const CHAT_LIST_FILTERS = ['', 'order', 'direct'] as const

/** Barcha chat ro'yxati cache'larini (filter bo'yicha) bir xil yangilash */
export function patchChatListOnMessage(
  qc: QueryClient,
  meId: number,
  m: ChatMessage,
): boolean {
  let found = false
  for (const filter of CHAT_LIST_FILTERS) {
    qc.setQueryData<ChatItem[]>(['chats', filter], (old = []) => {
      const idx = old.findIndex((c) => c.id === m.chat_id)
      if (idx === -1) return old
      found = true
      const chat = { ...old[idx] }
      chat.last_message = m.text ?? chat.last_message
      chat.last_message_at = m.created_at
      if (m.author?.id !== meId) {
        chat.unread = (chat.unread ?? 0) + 1
        chat.hidden = false
      }
      return [chat, ...old.filter((_, i) => i !== idx)]
    })
  }
  return found
}

export function patchChatRead(qc: QueryClient, chatId: number) {
  for (const filter of CHAT_LIST_FILTERS) {
    qc.setQueryData<ChatItem[]>(['chats', filter], (old = []) =>
      old.map((c) => (c.id === chatId ? { ...c, unread: 0 } : c)),
    )
  }
}

/** Kanban kartasidagi o'qilmagan xabarlar soni */
export function patchKanbanUnread(
  qc: QueryClient,
  orderId: number,
  meId: number,
  m: ChatMessage,
) {
  if (m.author?.id === meId) return
  qc.setQueriesData<{ columns: KanbanColumn[] }>({ queryKey: ['kanban'] }, (old) => {
    if (!old?.columns) return old
    return {
      columns: old.columns.map((col) => ({
        ...col,
        orders: col.orders.map((o) =>
          o.id === orderId
            ? { ...o, unread_messages: (o.unread_messages ?? 0) + 1 }
            : o,
        ),
      })),
    }
  })
}

/** Buyurtma sahifasidagi chat tab badge */
export function patchOrderUnread(
  qc: QueryClient,
  orderId: number,
  meId: number,
  m: ChatMessage,
) {
  if (m.author?.id === meId) return
  qc.setQueryData<OrderDetail>(['order', orderId], (old) =>
    old ? { ...old, unread_messages: (old.unread_messages ?? 0) + 1 } : old,
  )
}

export function clearOrderUnread(qc: QueryClient, orderId: number) {
  qc.setQueryData<OrderDetail>(['order', orderId], (old) =>
    old ? { ...old, unread_messages: 0 } : old,
  )
  qc.setQueriesData<{ columns: KanbanColumn[] }>({ queryKey: ['kanban'] }, (old) => {
    if (!old?.columns) return old
    return {
      columns: old.columns.map((col) => ({
        ...col,
        orders: col.orders.map((o) =>
          o.id === orderId ? { ...o, unread_messages: 0 } : o,
        ),
      })),
    }
  })
}

export function onChatMessage(
  qc: QueryClient,
  meId: number,
  m: ChatMessage,
  refreshUnread: () => void,
) {
  refreshUnread()
  const found = patchChatListOnMessage(qc, meId, m)
  if (!found) {
    qc.invalidateQueries({ queryKey: ['chats'] })
  }
  if (m.order_id) {
    patchKanbanUnread(qc, m.order_id, meId, m)
    patchOrderUnread(qc, m.order_id, meId, m)
  }
}
