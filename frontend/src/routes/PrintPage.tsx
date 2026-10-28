import { useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import { FileImage, FileText, Loader2, Printer as PrinterIcon, TriangleAlert, X } from 'lucide-react'
import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { api, ApiError, uploadFile } from '../api/client'
import { usePrinter } from '../api/hooks'
import type { JobOptions, Profile, UploadResult } from '../api/types'
import { Dropzone } from '../components/Dropzone'
import { PrintOptions } from '../components/PrintOptions'
import { bytes, parseRanges, plural, toRanges } from '../lib/format'
import { navigate } from '../lib/router'
import { toast } from '../lib/toasts'

interface Item {
  key: string
  file: File
  status: 'uploading' | 'ready' | 'error'
  progress: number
  upload?: UploadResult
  error?: string
  selected: Set<number>
}

const DEFAULTS: JobOptions = {
  copies: 1,
  pages: null,
  color_mode: 'color',
  quality: 'normal',
  media: 'iso_a4_210x297mm',
  scaling: 'fit',
  orientation: 'auto',
  duplex_manual: false,
}

let seq = 0

// pdf.js pesa: només es carrega quan hi ha alguna cosa per previsualitzar
const PdfThumbs = lazy(() => import('../components/PdfThumbs').then((m) => ({ default: m.PdfThumbs })))

export function PrintPage({ profile, desktop }: { profile: Profile; desktop: boolean }) {
  const qc = useQueryClient()
  const { data: printer } = usePrinter()
  const caps = printer?.capabilities
  const [items, setItems] = useState<Item[]>([])
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const [options, setOptions] = useState<JobOptions>(DEFAULTS)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (caps?.media_default && caps.media.includes(caps.media_default)) {
      setOptions((o) => (o === DEFAULTS ? { ...o, media: caps.media_default } : o))
    }
  }, [caps?.media_default, caps?.media])

  const patch = (key: string, p: Partial<Item>) => setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...p } : x)))

  const addFiles = (files: File[]) => {
    const fresh = files.map<Item>((file) => ({ key: `f${++seq}`, file, status: 'uploading', progress: 0, selected: new Set() }))
    setItems((xs) => [...xs, ...fresh])
    if (!activeKey && fresh[0]) setActiveKey(fresh[0].key)
    for (const it of fresh) {
      uploadFile(it.file, (p) => patch(it.key, { progress: p }))
        .then((u) => {
          patch(it.key, {
            status: 'ready',
            upload: u,
            selected: new Set(Array.from({ length: u.pages }, (_, i) => i + 1)),
          })
        })
        .catch((e) => patch(it.key, { status: 'error', error: e instanceof ApiError ? e.message : 'No s\'ha pogut pujar.' }))
    }
  }

  const remove = (key: string) => {
    setItems((xs) => xs.filter((x) => x.key !== key))
    if (activeKey === key) setActiveKey(items.find((x) => x.key !== key)?.key ?? null)
  }

  const ready = items.filter((x) => x.status === 'ready' && x.selected.size > 0)
  const busy = items.some((x) => x.status === 'uploading')
  const sheets = ready.reduce((n, x) => n + x.selected.size * options.copies, 0)
  const active = items.find((x) => x.key === activeKey) ?? items[0]

  const send = async () => {
    setSending(true)
    const sent: string[] = []
    for (const it of ready) {
      const u = it.upload!
      const pages = it.selected.size === u.pages ? null : toRanges([...it.selected])
      try {
        await api.createJob(u.id, profile.id, { ...options, pages })
        sent.push(it.key)
      } catch (e) {
        toast('error', `${u.name}: no ha entrat a la cua`, e instanceof ApiError ? e.message : undefined)
      }
    }
    setSending(false)
    if (sent.length) {
      qc.invalidateQueries({ queryKey: ['queue'] })
      toast('ok', sent.length === 1 ? 'A la cua!' : `${sent.length} treballs a la cua!`, options.duplex_manual ? 'Primer les cares senars. Quan acabi, t\'aviso.' : undefined)
      setItems((xs) => xs.filter((x) => !sent.includes(x.key)))
      setActiveKey(null)
      if (!desktop) navigate('cua')
    }
  }

  const offline = printer && !printer.online

  return (
    <div className="space-y-5">
      <section className="card p-4 sm:p-5" aria-labelledby="print-title">
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <h1 id="print-title" className="font-display text-3xl font-extrabold tracking-tight">
            Imprimeix
          </h1>
          <span className="truncate text-sm text-muted">Hola, {profile.name} {profile.emoji}</span>
        </div>
        <Dropzone onFiles={addFiles} compact={items.length > 0} />

        {items.length > 0 && (
          <ul className="mt-4 space-y-2">
            <AnimatePresence initial={false}>
              {items.map((it) => (
                <motion.li key={it.key} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }}>
                  <FileRow item={it} active={active?.key === it.key} onSelect={() => setActiveKey(it.key)} onRemove={() => remove(it.key)} />
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </section>

      {active?.status === 'ready' && active.upload && (
        <PagePicker
          key={active.key}
          item={active}
          onChange={(selected) => patch(active.key, { selected })}
        />
      )}

      {caps && (
        <section className="card p-4 sm:p-5" aria-labelledby="opts-title">
          <h2 id="opts-title" className="mb-4 font-display text-xl font-extrabold tracking-tight">
            Com ho vols?
          </h2>
          <PrintOptions caps={caps} value={options} onChange={setOptions} />
        </section>
      )}

      <div className="sticky bottom-[72px] z-20 lg:bottom-4">
        <div className="card flex items-center gap-3 p-3 pl-4">
          <div className="min-w-0 flex-1 text-sm leading-tight">
            {ready.length ? (
              <>
                <div className="font-semibold">
                  {plural(ready.length, 'fitxer', 'fitxers')} · {plural(sheets, 'pàgina', 'pàgines')}
                </div>
                <div className="truncate text-muted">
                  {offline ? 'La impressora dorm: s\'imprimirà quan es desperti.' : options.duplex_manual ? 'Doble cara manual' : 'Llest per sortir'}
                </div>
              </>
            ) : (
              <span className="text-muted">{busy ? 'Pujant papers…' : 'Encara no hi ha res per imprimir.'}</span>
            )}
          </div>
          <button type="button" className="btn btn-primary px-5" disabled={!ready.length || sending || busy} onClick={send}>
            {sending ? <Loader2 size={18} className="animate-spin" /> : <PrinterIcon size={18} />}
            Imprimeix
          </button>
        </div>
      </div>
    </div>
  )
}

function FileRow({ item, active, onSelect, onRemove }: { item: Item; active: boolean; onSelect: () => void; onRemove: () => void }) {
  const isImage = item.file.type.startsWith('image/') || /\.(heic|heif)$/i.test(item.file.name)
  const Icon = item.status === 'error' ? TriangleAlert : isImage ? FileImage : FileText
  const u = item.upload
  return (
    <div
      className={`flex items-center gap-3 rounded-xl border-[1.5px] px-3 py-2 transition-colors ${active && item.status === 'ready' ? 'border-ink bg-surface' : 'border-line bg-surface-2/60'} ${item.status === 'error' ? 'border-danger/50' : ''}`}
    >
      <button type="button" onClick={onSelect} className="flex min-h-[44px] min-w-0 flex-1 items-center gap-3 text-left" disabled={item.status !== 'ready'}>
        <Icon size={22} className={`shrink-0 ${item.status === 'error' ? 'text-danger' : 'text-muted'}`} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{item.file.name}</span>
          <span className="block text-xs text-muted">
            {item.status === 'uploading' && (item.progress < 1 ? `Pujant… ${Math.round(item.progress * 100)}%` : 'Convertint a PDF…')}
            {item.status === 'error' && <span className="font-semibold text-danger-ink">{item.error}</span>}
            {item.status === 'ready' && u && (
              <>
                {item.selected.size === u.pages ? plural(u.pages, 'pàgina', 'pàgines') : `${item.selected.size} de ${u.pages} pàgines`} · {bytes(u.size)}
              </>
            )}
          </span>
          {item.status === 'uploading' && (
            <span className="mt-1 block h-1 overflow-hidden rounded-full bg-line">
              <span className="block h-full bg-cyan transition-[width]" style={{ width: `${Math.max(4, item.progress * 100)}%` }} />
            </span>
          )}
        </span>
      </button>
      <button type="button" className="icon-btn shrink-0" onClick={onRemove} aria-label={`Treu ${item.file.name}`}>
        <X size={18} />
      </button>
    </div>
  )
}

function PagePicker({ item, onChange }: { item: Item; onChange: (s: Set<number>) => void }) {
  const u = item.upload!
  const current = useMemo(() => toRanges([...item.selected]), [item.selected])
  const [text, setText] = useState(current)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => setText(item.selected.size === u.pages ? '' : current), [current, item.selected.size, u.pages])

  const toggle = (p: number) => {
    const s = new Set(item.selected)
    if (s.has(p)) s.delete(p)
    else s.add(p)
    onChange(s)
  }
  const apply = () => {
    if (!text.trim()) {
      setError(null)
      return onChange(new Set(Array.from({ length: u.pages }, (_, i) => i + 1)))
    }
    const parsed = parseRanges(text, u.pages)
    if (!parsed) return setError(`No ho entenc. Escriu per exemple «1-3,5» (té ${u.pages} pàgines).`)
    setError(null)
    onChange(new Set(parsed))
  }

  return (
    <section className="card p-4 sm:p-5" aria-labelledby="pages-title">
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 id="pages-title" className="mr-auto min-w-0 truncate font-display text-xl font-extrabold tracking-tight">
          Quines pàgines?
        </h2>
        {u.pages > 1 && (
          <div className="flex gap-1.5">
            <button type="button" className="pill min-h-[36px] hover:border-muted" onClick={() => onChange(new Set(Array.from({ length: u.pages }, (_, i) => i + 1)))}>
              Totes
            </button>
            <button type="button" className="pill min-h-[36px] hover:border-muted" onClick={() => onChange(new Set())}>
              Cap
            </button>
          </div>
        )}
      </div>
      {u.pages > 1 && (
        <label className="mb-4 block">
          <span className="sr-only">Rang de pàgines</span>
          <input
            className="field font-mono"
            placeholder={`Totes (1-${u.pages}) · o escriu «1-3,5»`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={apply}
            onKeyDown={(e) => e.key === 'Enter' && apply()}
            aria-invalid={!!error}
          />
          {error && <span className="mt-1 block text-sm font-semibold text-danger-ink">{error}</span>}
        </label>
      )}
      <Suspense fallback={<div className="h-32 animate-pulse rounded-xl bg-surface-2" />}>
        <PdfThumbs url={u.pdf_url} pages={u.pages} selected={item.selected} onToggle={toggle} />
      </Suspense>
      {item.selected.size === 0 && <p className="mt-3 text-sm font-semibold text-warn-ink">Cap pàgina triada: aquest fitxer no s'imprimirà.</p>}
    </section>
  )
}
