import type { Printer } from '../api/types'

const SHORT: Record<string, string> = {
  'media-empty': 'Sense paper',
  'media-needed': 'Sense paper',
  'media-jam': 'Paper encallat',
  'cover-open': 'Tapa oberta',
  'door-open': 'Tapa oberta',
  'marker-supply-empty': 'Sense tinta',
  'cups-unreachable': 'Sense CUPS',
}

export type Tone = 'ok' | 'busy' | 'warn' | 'error' | 'off'

export function printerSummary(p: Printer | undefined): { tone: Tone; text: string } {
  if (!p) return { tone: 'off', text: 'Connectant…' }
  if (!p.online) return { tone: 'off', text: 'Apagada' }
  const err = p.alerts.find((a) => a.severity === 'error')
  if (err) return { tone: 'error', text: SHORT[err.code] ?? 'Error' }
  if (p.queue && !p.queue.enabled) return { tone: 'warn', text: 'Cua en pausa' }
  if (p.state === 'processing') return { tone: 'busy', text: 'Imprimint' }
  const warn = p.alerts.find((a) => a.severity === 'warning')
  if (warn) return { tone: 'warn', text: warn.code.startsWith('marker') ? 'Poca tinta' : 'Atenció' }
  return { tone: 'ok', text: 'A punt' }
}

export const TONE_COLOR: Record<Tone, string> = {
  ok: 'var(--ok)',
  busy: 'var(--cyan)',
  warn: 'var(--warn)',
  error: 'var(--danger)',
  off: 'var(--muted)',
}

export function StatusPill({ printer, onClick }: { printer?: Printer; onClick?: () => void }) {
  const { tone, text } = printerSummary(printer)
  return (
    <button
      type="button"
      onClick={onClick}
      className="pill min-h-[36px] hover:border-muted"
      aria-label={`Estat de la impressora: ${text}`}
    >
      <span
        className={`inline-block h-2.5 w-2.5 rounded-full ${tone === 'busy' || tone === 'error' ? 'anim-pulse' : ''}`}
        style={{ background: TONE_COLOR[tone], color: TONE_COLOR[tone] }}
      />
      <span className="max-w-[8.5rem] truncate whitespace-nowrap">{text}</span>
    </button>
  )
}
