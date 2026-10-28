import { Bell, BellOff, ExternalLink, Pause, Play } from 'lucide-react'
import { useState } from 'react'
import { api } from '../api/client'
import { useAction, usePrinter } from '../api/hooks'
import type { Printer } from '../api/types'
import { mediaLabel } from '../lib/format'
import { browserNotifyEnabled, setBrowserNotify } from '../lib/toasts'
import { AlertList } from './AlertList'
import { Cartridge } from './Cartridge'
import { MockPanel } from './MockPanel'
import { PrinterIllustration, type IllustrationState } from './PrinterIllustration'
import { printerSummary, TONE_COLOR } from './StatusPill'

function illustrationState(p?: Printer): IllustrationState {
  if (!p || !p.online) return 'offline'
  if (p.alerts.some((a) => a.severity === 'error')) return 'error'
  if (p.state === 'processing') return 'printing'
  return 'idle'
}

function microtext(p?: Printer): string {
  if (!p) return 'Preguntant a la impressora…'
  if (!p.online) return 'Apagada o desconnectada. Quan l\'encenguis, es posarà al dia sola.'
  if (p.alerts.some((a) => a.severity === 'error')) return 'Alguna cosa la fa patir. Mira els avisos.'
  if (p.queue && !p.queue.enabled) return 'Cua en pausa, els treballs esperen.'
  if (p.state === 'processing') return 'Imprimint… no toquis res.'
  return 'Tot a punt. La tribu té paper?'
}

export function PrinterCard({ full = false }: { full?: boolean }) {
  const { data: p } = usePrinter()
  const summary = printerSummary(p)
  const paused = p?.queue ? !p.queue.enabled : false
  const toggle = useAction(() => (paused ? api.resume() : api.pause()))
  const [notify, setNotify] = useState(browserNotifyEnabled())

  return (
    <section className="card overflow-hidden" aria-labelledby="printer-title">
      <div className="flex items-center gap-4 p-4 sm:p-5">
        <PrinterIllustration state={illustrationState(p)} className="h-24 w-32 shrink-0 sm:h-28 sm:w-36" />
        <div className="min-w-0">
          <div className="smallcaps text-sm text-muted">{p?.make_and_model?.replace(' series', '') ?? 'Canon TS3350'}</div>
          <h2 id="printer-title" className="flex items-center gap-2 font-display text-2xl font-extrabold tracking-tight">
            <span className="inline-block h-3 w-3 rounded-full" style={{ background: TONE_COLOR[summary.tone] }} />
            {summary.text}
          </h2>
          <p className="mt-0.5 text-[0.95rem] text-muted">{microtext(p)}</p>
        </div>
      </div>

      {p && p.online && p.alerts.length > 0 && (
        <div className="px-4 pb-4 sm:px-5">
          <AlertList alerts={p.alerts} />
        </div>
      )}

      {p && p.online && p.markers.length > 0 && (
        <div className="border-t border-line bg-surface-2/60 px-4 py-5 sm:px-5">
          <div className="flex items-end justify-center gap-10">
            {p.markers.map((m) => (
              <Cartridge key={m.name} marker={m} />
            ))}
          </div>
          <p className="mt-4 text-center text-xs text-muted">Nivells aproximats segons la impressora</p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3 sm:px-5">
        <button
          type="button"
          className={`btn ${paused ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => toggle.mutate(undefined)}
          disabled={toggle.isPending || !p?.queue}
        >
          {paused ? <Play size={18} /> : <Pause size={18} />}
          {paused ? 'Reprèn la cua' : 'Pausa la cua'}
        </button>
        {p?.online && p.media_ready.length > 0 && (
          <span className="pill text-muted">Safata: {p.media_ready.map(mediaLabel).join(', ')}</span>
        )}
        {full && 'Notification' in window && (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={async () => setNotify(await setBrowserNotify(!notify))}
            aria-pressed={notify}
          >
            {notify ? <BellOff size={18} /> : <Bell size={18} />}
            {notify ? 'Silencia el navegador' : "Avisa'm al navegador"}
          </button>
        )}
        {p?.cups_web_url && (
          <a
            href={p.cups_web_url}
            target="_blank"
            rel="noreferrer"
            className="ml-auto inline-flex min-h-[44px] items-center gap-1 text-sm text-muted underline-offset-4 hover:text-ink hover:underline"
          >
            CUPS <ExternalLink size={14} />
          </a>
        )}
      </div>

      {p?.backend === 'mock' && <MockPanel />}
    </section>
  )
}
