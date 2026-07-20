import { API_URL, tokens, emitAuthLost } from '@/lib/api'

type Handler = (data: any) => void

/**
 * Bitta umumiy WebSocket ulanish. Uzilsa — o'zi qayta ulanadi.
 * Obuna: on('order.moved', fn) -> unsubscribe funksiyasini qaytaradi.
 */
class Socket {
  private ws: WebSocket | null = null
  private handlers = new Map<string, Set<Handler>>()
  private topics = new Set<string>()
  private retry = 0
  private timer: number | null = null
  private pinger: number | null = null
  private closedByUs = false

  connect() {
    const token = tokens.access
    if (!token) return
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return

    this.closedByUs = false
    const url = `${API_URL.replace(/^http/, 'ws')}/api/v1/ws?token=${encodeURIComponent(token)}`
    const ws = new WebSocket(url)
    this.ws = ws

    ws.onopen = () => {
      this.retry = 0
      this.topics.forEach((t) => this.send({ action: 'join', topic: t }))
      this.pinger = window.setInterval(() => this.send({ action: 'ping' }), 25000)
      this.emit('__open', {})
    }

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        this.emit(msg.type, msg.data)
        if (msg.type === 'session.revoked') {
          tokens.clear()
          emitAuthLost(msg.data?.reason || 'session_revoked')
          this.close()
        }
      } catch {
        /* noto'g'ri JSON — e'tibor bermaymiz */
      }
    }

    ws.onclose = (e) => {
      if (this.pinger) window.clearInterval(this.pinger)
      this.emit('__close', {})
      // 4401 = token yaroqsiz, qayta urinish ma'nosiz
      if (this.closedByUs || e.code === 4401) return
      this.retry = Math.min(this.retry + 1, 6)
      const delay = Math.min(1000 * 2 ** this.retry, 30000)
      this.timer = window.setTimeout(() => this.connect(), delay)
    }

    ws.onerror = () => ws.close()
  }

  close() {
    this.closedByUs = true
    if (this.timer) window.clearTimeout(this.timer)
    if (this.pinger) window.clearInterval(this.pinger)
    this.ws?.close()
    this.ws = null
    this.topics.clear()
  }

  private send(payload: object) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(payload))
  }

  join(topic: string) {
    this.topics.add(topic)
    this.send({ action: 'join', topic })
  }

  leave(topic: string) {
    this.topics.delete(topic)
    this.send({ action: 'leave', topic })
  }

  on(type: string, fn: Handler): () => void {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set())
    this.handlers.get(type)!.add(fn)
    return () => this.handlers.get(type)?.delete(fn)
  }

  private emit(type: string, data: any) {
    this.handlers.get(type)?.forEach((fn) => fn(data))
  }
}

export const socket = new Socket()
