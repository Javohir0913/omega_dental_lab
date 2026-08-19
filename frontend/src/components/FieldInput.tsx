import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, API_URL, tokens } from '@/lib/api'
import { useLang } from '@/i18n'
import { NumberInput } from '@/components/ui'
import type { CustomField, FileOut, Page, User } from '@/lib/types'
import Model3DViewer from '@/components/Model3DViewer'
import { MODEL3D_EXTS, fileExt, isImageName, isRawName } from '@/lib/fileTypes'

function fileUrl(f: FileOut): string {
  if (!f.url) return ''
  return f.url.startsWith('http') ? f.url : `${API_URL}${f.url}`
}

async function openFileWithAuth(f: FileOut): Promise<string> {
  // RAW (CR2/CR3/NEF/ARW/DNG) — brauzer ko'rsata olmaydi, serverdan JPEG preview olamiz.
  const raw = isRawName(f.name)
  const url = raw ? `${fileUrl(f)}/preview` : fileUrl(f)
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${tokens.access ?? ''}` },
  })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  const blob = await r.blob()
  const ext = fileExt(f.name)
  const IMAGE_MIME: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
    webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp',
    pdf: 'application/pdf',
  }
  const type = raw ? 'image/jpeg' : (IMAGE_MIME[ext] || f.mime || blob.type || 'application/octet-stream')
  return URL.createObjectURL(new Blob([blob], { type }))
}

/** Adminkada yaratilgan qo'shimcha maydon uchun universal input. */
export function CustomFieldInput({
  field,
  value,
  onChange,
  orderId,
}: {
  field: CustomField
  value: unknown
  onChange: (v: unknown) => void
  orderId?: number | null
}) {
  const lang = useLang((s) => s.lang)
  const opts = field.options ?? []

  switch (field.type) {
    case 'text':
      return (
        <textarea
          className="input min-h-[70px]"
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value || null)}
        />
      )

    case 'int':
    case 'decimal':
      return (
        <NumberInput
          decimal={field.type === 'decimal'}
          className="input"
          value={value as number | null}
          onChange={(v) => onChange(v)}
        />
      )

    case 'date':
      return (
        <input
          type="date"
          className="input"
          value={((value as string) ?? '').slice(0, 10)}
          onChange={(e) => onChange(e.target.value || null)}
        />
      )

    case 'datetime':
      return (
        <input
          type="datetime-local"
          className="input"
          value={((value as string) ?? '').slice(0, 16)}
          onChange={(e) => onChange(e.target.value || null)}
        />
      )

    case 'bool':
      return (
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
          />
          <span className="text-ink-soft">
            {lang === 'ru' ? field.label_ru : field.label_uz}
          </span>
        </label>
      )

    case 'select':
      return (
        <select
          className="input"
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value || null)}
        >
          <option value="">—</option>
          {opts.map((o) => (
            <option key={o.value} value={o.value}>
              {lang === 'ru' ? o.label_ru : o.label_uz}
            </option>
          ))}
        </select>
      )

    case 'multiselect': {
      const arr = Array.isArray(value) ? (value as string[]) : []
      return (
        <div className="flex flex-wrap gap-1.5">
          {opts.map((o) => {
            const on = arr.includes(o.value)
            return (
              <button
                key={o.value}
                type="button"
                onClick={() =>
                  onChange(on ? arr.filter((v) => v !== o.value) : [...arr, o.value])
                }
                className={
                  on
                    ? 'chip border border-brand-300 bg-brand-100 text-brand-700'
                    : 'chip border border-surface-border bg-white text-ink-soft dark:border-[#2f3745] dark:bg-[#151a23]'
                }
              >
                {lang === 'ru' ? o.label_ru : o.label_uz}
              </button>
            )
          })}
        </div>
      )
    }

    case 'user':
      return <UserSelect value={value as number | null} onChange={onChange} />

    case 'file':
      return <FileFieldInput value={value as (number | string)[] | number | string | null} onChange={onChange} orderId={orderId} lang={lang} multiple={(field.options as any)?.[0]?.['multiple'] === true} />

    default:
      return (
        <input
          className="input"
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value || null)}
        />
      )
  }
}

const PREVIEW_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp',
  'application/pdf',
  'text/plain', 'text/csv', 'text/html', 'text/xml', 'application/json', 'application/xml',
  'video/mp4', 'video/webm', 'video/ogg',
  'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4',
])

function fileIcon(mime: string | null, name: string): string {
  const ext = fileExt(name)
  if (MODEL3D_EXTS.includes(ext)) return '🦷'
  if (!mime) return '📄'
  if (mime.startsWith('image/')) return '🖼️'
  if (mime.startsWith('video/')) return '🎬'
  if (mime.startsWith('audio/')) return '🎵'
  if (mime === 'application/pdf') return '📕'
  if (mime.startsWith('text/') || mime.includes('json') || mime.includes('xml')) return '📝'
  return '📄'
}

export function FileFieldInput({
  value,
  onChange,
  orderId,
  lang,
  multiple,
}: {
  value: (number | string)[] | number | string | null
  onChange: (v: unknown) => void
  orderId?: number | null
  lang: string
  multiple: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [localFiles, setLocalFiles] = useState<Map<number, FileOut>>(new Map())
  const [preview, setPreview] = useState<{ idx: number; blobUrls: (string | null)[] } | null>(null)
  const [model3d, setModel3d] = useState<{ url: string; name: string } | null>(null)

  const ids = value == null ? [] : Array.isArray(value) ? value : [value]
  const numericIds = ids.filter((id): id is number => typeof id === 'number')
  const localIds = new Set(localFiles.keys())
  const fetchIds = numericIds.filter((id) => !localIds.has(id))

  const { data: existingFiles } = useQuery({
    queryKey: ['cf-files-info', ...fetchIds],
    queryFn: async () => {
      const results: FileOut[] = []
      for (const id of fetchIds) {
        try {
          const r = await api.get<FileOut>(`/files/${id}/info`)
          results.push(r.data)
        } catch { /* file not found */ }
      }
      return results
    },
    enabled: fetchIds.length > 0,
  })

  const allFiles = [...(existingFiles ?? []), ...localFiles.values()]

  // Preview rasm fayllari (oddiy rasmlar + RAW preview)
  const previewImgFiles = allFiles.filter((f) => isImageName(f.name, f.is_image) || isRawName(f.name))

  // ESC + Arrow keys
  useEffect(() => {
    if (!preview) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setPreview(null); return }
      if (previewImgFiles.length <= 1) return
      if (e.key === 'ArrowRight') {
        setPreview((p) => {
          if (!p) return null
          const next = Math.min(p.idx + 1, previewImgFiles.length - 1)
          loadPreviewImg(next)
          return { ...p, idx: next }
        })
      }
      if (e.key === 'ArrowLeft') {
        setPreview((p) => {
          if (!p) return null
          const prev = Math.max(p.idx - 1, 0)
          loadPreviewImg(prev)
          return { ...p, idx: prev }
        })
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [preview, previewImgFiles.length])

  function canPreview(f: FileOut): boolean {
    const ext = fileExt(f.name)
    if (MODEL3D_EXTS.includes(ext)) return true
    return isImageName(f.name, f.is_image)
      || isRawName(f.name)
      || (f.mime != null && PREVIEW_TYPES.has(f.mime))
  }

  async function handleOpen(f: FileOut) {
    try {
      const ext = fileExt(f.name)
      // 3D model
      if (MODEL3D_EXTS.includes(ext)) {
        const blobUrl = await openFileWithAuth(f)
        setModel3d({ url: blobUrl, name: f.name })
        return
      }
      // Rasm bo'lsa (yoki RAW preview) — gallery preview
      if (isImageName(f.name, f.is_image) || isRawName(f.name)) {
        const imgIdx = previewImgFiles.findIndex((x) => x.id === f.id)
        const blobUrl = await openFileWithAuth(f)
        const blobUrls = previewImgFiles.map((_, i) => i === Math.max(imgIdx, 0) ? blobUrl : null)
        setPreview({ idx: Math.max(imgIdx, 0), blobUrls })
        return
      }
      // Boshqa preview (PDF, video, audio)
      if (canPreview(f)) {
        const blobUrl = await openFileWithAuth(f)
        setPreview({ idx: -1, blobUrls: [blobUrl] })
        return
      }
      // Download
      const blobUrl = await openFileWithAuth(f)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = f.name
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000)
    } catch {
      // silent fail
    }
  }

  // Keyingi rasm lazy yuklash
  async function loadPreviewImg(targetIdx: number) {
    if (!preview) return
    if (preview.blobUrls[targetIdx]) return // allaqachon yuklangan
    const f = previewImgFiles[targetIdx]
    if (!f) return
    const blobUrl = await openFileWithAuth(f)
    setPreview((p) => {
      if (!p) return null
      const next = [...p.blobUrls]
      next[targetIdx] = blobUrl
      return { ...p, blobUrls: next }
    })
  }

  async function uploadFile(fileObj: File): Promise<number> {
    const fd = new FormData()
    fd.append('file', fileObj)
    fd.append('entity', 'order')
    fd.append('entity_id', String(orderId ?? 0))
    const { data } = await api.post<FileOut>('/files', fd)
    setLocalFiles((prev) => new Map(prev).set(data.id, data))
    return data.id
  }

  async function handlePick() {
    const el = inputRef.current
    if (!el || !el.files?.length) return
    setBusy(true)
    try {
      const max = multiple ? el.files.length : 1
      // `numericIds` — shu render paytidagi holat; tsikl ichida ketma-ket
      // yuklashda uni yangilab boramiz, aks holda har bir onChange avvalgi
      // qo'shilgan faylni bekor qilib yuboradi (faqat oxirgisi qoladi)
      let currentIds = multiple ? [...numericIds] : []
      for (let i = 0; i < max; i++) {
        const newId = await uploadFile(el.files[i])
        currentIds = multiple ? [...currentIds, newId] : [newId]
        onChange(currentIds)
      }
    } catch {
      // silent
    } finally {
      setBusy(false)
      el.value = ''
    }
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const droppedFiles = Array.from(e.dataTransfer.files)
    if (!droppedFiles.length) return
    setBusy(true)
    try {
      const max = multiple ? droppedFiles.length : 1
      let currentIds = multiple ? [...numericIds] : []
      for (let i = 0; i < max; i++) {
        const newId = await uploadFile(droppedFiles[i])
        currentIds = multiple ? [...currentIds, newId] : [newId]
        onChange(currentIds)
      }
    } catch {
      // silent
    } finally {
      setBusy(false)
    }
  }

  function remove(id: number) {
    setLocalFiles((prev) => { const m = new Map(prev); m.delete(id); return m })
    onChange(numericIds.filter((v) => v !== id))
  }

  return (
    <div className="space-y-1.5">
      {allFiles.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {allFiles.map((f) => (
            <div
              key={f.id}
              className="flex items-center gap-1.5 rounded-md border border-surface-border bg-surface-muted px-2 py-1 text-xs dark:border-[#2f3745] dark:bg-[#222836]"
            >
              {/* Thumbnail yoki ikon (RAW ham serverdan preview bilan ko'rsatiladi) */}
              {(isImageName(f.name, f.is_image) || isRawName(f.name)) ? (
                <img
                  src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=="
                  alt=""
                  className="h-6 w-6 cursor-pointer rounded object-cover"
                  ref={(el) => {
                    if (!el || el.dataset.loaded) return
                    el.dataset.loaded = '1'
                    openFileWithAuth(f).then((blob) => { el.src = blob }).catch(() => {})
                  }}
                  onClick={() => handleOpen(f)}
                />
              ) : (
                <span
                  className="cursor-pointer"
                  onClick={() => handleOpen(f)}
                >
                  {fileIcon(f.mime, f.name)}
                </span>
              )}
              <span
                className={`max-w-[100px] truncate sm:max-w-[180px] ${canPreview(f) ? 'cursor-pointer hover:text-brand-600' : ''}`}
                onClick={() => handleOpen(f)}
              >
                {f.name}
              </span>
              <button
                type="button"
                onClick={() => remove(f.id)}
                className="ml-0.5 text-ink-faint hover:text-rose-500"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
      <div
        ref={dropRef}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`
          flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-3 text-sm transition-colors
          ${dragging ? 'border-brand-400 bg-brand-50 dark:bg-brand-900/20' : 'border-surface-border text-ink-faint hover:border-brand-300 hover:text-ink-soft dark:border-[#2f3745]'}
        `}
      >
        <input
          ref={inputRef}
          type="file"
          multiple={multiple}
          className="hidden"
          onChange={handlePick}
        />
        {busy ? (
          <span>...</span>
        ) : (
          <>
            📎 {lang === 'ru' ? 'Перетащите файл или нажмите' : 'Faylni tashlang yoki bosing'}
            {ids.length > 0 && (
              <span className="ml-1 text-[10px] text-ink-faint">({ids.length})</span>
            )}
          </>
        )}
      </div>

      {/* 3D Model Viewer */}
      {model3d && (
        <Model3DViewer
          url={model3d.url}
          name={model3d.name}
          onClose={() => setModel3d(null)}
          onDownload={async () => {
            const f = allFiles.find(x => x.name === model3d.name)
            if (!f) return
            const blobUrl = await openFileWithAuth(f)
            const a = document.createElement('a')
            a.href = blobUrl
            a.download = f.name
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            setTimeout(() => URL.revokeObjectURL(blobUrl), 1000)
          }}
        />
      )}

      {/* Preview modal */}
      {preview && (() => {
        // Rasm gallery rejimi
        if (preview.idx >= 0 && previewImgFiles.length > 0) {
          const currentFile = previewImgFiles[preview.idx]
          const currentUrl = preview.blobUrls[preview.idx]
          const total = previewImgFiles.length
          return (
            <div
              className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90"
              onClick={() => setPreview(null)}
            >
              {/* Header */}
              <div className="mb-3 flex w-full max-w-5xl shrink-0 items-center justify-between px-4">
                <div className="flex items-center gap-3">
                  <span className="truncate text-sm text-white/80">{currentFile?.name}</span>
                  {total > 1 && (
                    <span className="rounded bg-white/10 px-2 py-0.5 text-xs text-white/60">
                      {preview.idx + 1} / {total}
                    </span>
                  )}
                </div>
                <button
                  className="rounded-md bg-white/10 px-3 py-1 text-xs text-white hover:bg-white/20"
                  onClick={() => setPreview(null)}
                >
                  ✕ Yopish
                </button>
              </div>

              {/* Image + arrows */}
              <div className="relative flex w-full flex-1 items-center justify-center" onClick={(e) => e.stopPropagation()}>
                {total > 1 && preview.idx > 0 && (
                  <button
                    className="absolute left-4 z-10 flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-2xl text-white backdrop-blur-sm hover:bg-white/25 transition-colors"
                    onClick={() => {
                      const ni = preview.idx - 1
                      setPreview((p) => p ? { ...p, idx: ni } : null)
                      loadPreviewImg(ni)
                    }}
                  >
                    ‹
                  </button>
                )}

                {currentUrl ? (
                  <img
                    key={preview.idx}
                    src={currentUrl}
                    alt={currentFile?.name}
                    className="max-h-[80vh] max-w-[85vw] rounded-lg object-contain shadow-2xl"
                  />
                ) : (
                  <div className="flex h-40 w-40 items-center justify-center">
                    <div className="h-10 w-10 animate-spin rounded-full border-4 border-white/20 border-t-white" />
                  </div>
                )}

                {total > 1 && preview.idx < total - 1 && (
                  <button
                    className="absolute right-4 z-10 flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-2xl text-white backdrop-blur-sm hover:bg-white/25 transition-colors"
                    onClick={() => {
                      const ni = preview.idx + 1
                      setPreview((p) => p ? { ...p, idx: ni } : null)
                      loadPreviewImg(ni)
                    }}
                  >
                    ›
                  </button>
                )}
              </div>

              {total > 1 && (
                <div className="mt-4 flex shrink-0 gap-1.5">
                  {previewImgFiles.map((_, i) => (
                    <button
                      key={i}
                      className={`h-1.5 rounded-full transition-all ${
                        i === preview.idx ? 'w-5 bg-white' : 'w-1.5 bg-white/30 hover:bg-white/60'
                      }`}
                      onClick={(e) => {
                        e.stopPropagation()
                        setPreview((p) => p ? { ...p, idx: i } : null)
                        loadPreviewImg(i)
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          )
        }

        // PDF / video / audio preview (oddiy modal)
        const blobUrl = preview.blobUrls[0]
        if (!blobUrl) return null
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            onClick={() => setPreview(null)}
          >
            <div
              className="relative max-h-[90vh] max-w-[90vw] overflow-auto rounded-xl bg-white p-2 shadow-2xl dark:bg-[#1e2533]"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setPreview(null)}
                className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60"
              >
                ✕
              </button>
              <iframe src={blobUrl} className="h-[80vh] w-[80vw] rounded" title="preview" />
            </div>
          </div>
        )
      })()}
    </div>
  )
}

function TextPreview({ url }: { url: string }) {
  const [text, setText] = useState('')
  useQuery({
    queryKey: ['text-preview', url],
    queryFn: async () => {
      const r = await fetch(url)
      const t = await r.text()
      setText(t.slice(0, 50000))
      return t
    },
  })
  return <pre className="max-h-[80vh] w-[80vw] overflow-auto whitespace-pre-wrap rounded p-4 text-xs">{text || '...'}</pre>
}

export function UserSelect({
  value,
  onChange,
  stageId,
}: {
  value: number | null
  onChange: (v: number | null) => void
  stageId?: number
}) {
  const { data } = useQuery({
    queryKey: ['users-select', stageId],
    queryFn: async () =>
      (
        await api.get<Page<User>>('/users', {
          params: { size: 200, is_active: true, stage_id: stageId },
        })
      ).data,
  })

  return (
    <select
      className="input"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
    >
      <option value="">—</option>
      {(data?.items ?? []).map((u) => (
        <option key={u.id} value={u.id}>
          {u.full_name}
        </option>
      ))}
    </select>
  )
}