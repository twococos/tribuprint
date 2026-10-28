import { AlertTriangle, CircleHelp, Info, OctagonAlert } from 'lucide-react'
import type { Alert } from '../api/types'

const STYLE = {
  error: { Icon: OctagonAlert, color: 'var(--danger)', ink: 'var(--danger-ink)' },
  warning: { Icon: AlertTriangle, color: 'var(--warn)', ink: 'var(--warn-ink)' },
  info: { Icon: Info, color: 'var(--cyan)', ink: 'var(--muted)' },
  unknown: { Icon: CircleHelp, color: 'var(--line)', ink: 'var(--muted)' },
}

export function AlertList({ alerts }: { alerts: Alert[] }) {
  if (!alerts.length) return null
  return (
    <ul className="space-y-2">
      {alerts.map((a) => {
        const s = STYLE[a.severity] ?? STYLE.unknown
        return (
          <li
            key={a.code}
            className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 ${a.severity === 'unknown' ? 'text-sm' : ''}`}
            style={{
              borderColor: `color-mix(in srgb, ${s.color} 40%, transparent)`,
              background: `color-mix(in srgb, ${s.color} 9%, var(--surface))`,
            }}
            role={a.severity === 'error' ? 'alert' : undefined}
          >
            <s.Icon size={20} className="mt-0.5 shrink-0" style={{ color: s.color }} />
            <span className={a.severity === 'unknown' ? 'font-mono text-muted' : 'font-semibold'} style={{ color: a.severity === 'unknown' ? undefined : s.ink }}>
              {a.message}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
