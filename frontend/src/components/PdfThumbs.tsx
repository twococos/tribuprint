import { Check } from 'lucide-react'
import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { useEffect, useRef, useState } from 'react'

GlobalWorkerOptions.workerSrc = workerUrl

const cache = new Map<string, Promise<PDFDocumentProxy>>()
function loadPdf(url: string) {
  let p = cache.get(url)
  if (!p) {
    p = getDocument({ url }).promise
    cache.set(url, p)
  }
  return p
}

const THUMB_W = 132

function Thumb({ url, page, selected, onToggle }: { url: string; page: number; selected: boolean; onToggle: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const box = useRef<HTMLButtonElement>(null)
  const [visible, setVisible] = useState(false)
  const [ratio, setRatio] = useState(1.414)

  useEffect(() => {
    const el = box.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setVisible(true), { rootMargin: '200px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    if (!visible) return
    let cancelled = false
    let task: { cancel: () => void } | null = null
    loadPdf(url).then(async (doc) => {
      const pg = await doc.getPage(page)
      if (cancelled || !canvas.current) return
      const base = pg.getViewport({ scale: 1 })
      setRatio(base.height / base.width)
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const vp = pg.getViewport({ scale: (THUMB_W * dpr) / base.width })
      const c = canvas.current
      c.width = vp.width
      c.height = vp.height
      const t = pg.render({ canvas: c, viewport: vp })
      task = t
      await t.promise.catch(() => {})
    })
    return () => {
      cancelled = true
      task?.cancel()
    }
  }, [visible, url, page])

  return (
    <button
      ref={box}
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      aria-label={`Pàgina ${page}${selected ? ', seleccionada' : ''}`}
      className="group relative flex flex-col items-center gap-1"
    >
      <span
        className={`relative block w-full overflow-hidden rounded-md bg-white transition-all ${selected ? 'ring-[3px] ring-ink' : 'opacity-45 ring-1 ring-line grayscale-[60%]'} group-hover:-translate-y-0.5`}
        style={{ aspectRatio: `1 / ${ratio}`, boxShadow: '0 4px 10px -6px rgba(28,27,24,.35)' }}
      >
        <canvas ref={canvas} className="h-full w-full" />
        {selected && (
          <span className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-ink text-paper">
            <Check size={14} strokeWidth={3} />
          </span>
        )}
      </span>
      <span className="font-mono text-xs text-muted">{page}</span>
    </button>
  )
}

export function PdfThumbs({
  url,
  pages,
  selected,
  onToggle,
}: {
  url: string
  pages: number
  selected: Set<number>
  onToggle: (page: number) => void
}) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-3 sm:grid-cols-[repeat(auto-fill,minmax(100px,1fr))]">
      {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
        <Thumb key={p} url={url} page={p} selected={selected.has(p)} onToggle={() => onToggle(p)} />
      ))}
    </div>
  )
}
