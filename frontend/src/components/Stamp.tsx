import type { JobState } from '../api/types'

const STAMPS: Partial<Record<JobState, { text: string; color: string; rot: string }>> = {
  completed: { text: 'Imprès', color: 'var(--ok)', rot: '-11deg' },
  canceled: { text: 'Anul·lat', color: 'var(--danger)', rot: '8deg' },
  aborted: { text: 'Error', color: 'var(--danger)', rot: '-7deg' },
}

/** Segell de goma: cau a sobre del tiquet quan el treball acaba. */
export function Stamp({ state }: { state: JobState }) {
  const s = STAMPS[state]
  if (!s) return null
  return (
    <div
      className="anim-stamp pointer-events-none absolute right-5 top-[3.4rem] select-none sm:right-8"
      style={{ ['--rot' as string]: s.rot, transform: `rotate(${s.rot})` }}
      aria-label={s.text}
    >
      <div
        className="rounded-md px-3 py-0.5 font-display text-xl font-extrabold uppercase tracking-[0.12em]"
        style={{
          color: s.color,
          border: `3px double ${s.color}`,
          opacity: 0.82,
          // Tinta irregular, com un segell de debò
          WebkitMask:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='60'%3E%3Cfilter id='f'%3E%3CfeTurbulence baseFrequency='.9' numOctaves='2'/%3E%3CfeColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -1.6 1.5'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23f)'/%3E%3C/svg%3E\")",
          mask: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='60'%3E%3Cfilter id='f'%3E%3CfeTurbulence baseFrequency='.9' numOctaves='2'/%3E%3CfeColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -1.6 1.5'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23f)'/%3E%3C/svg%3E\")",
        }}
      >
        {s.text}
      </div>
    </div>
  )
}
