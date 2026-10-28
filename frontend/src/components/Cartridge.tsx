import type { Marker } from '../api/types'

const LABEL: Record<string, string> = { black: 'Negre', color: 'Color' }

/** Ona SVG que es repeteix: la fem el doble d'ample i la desplacem un 50%. */
const WAVE =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 12' preserveAspectRatio='none'%3E%3Cpath d='M0 6 Q15 0 30 6 T60 6 T90 6 T120 6 V12 H0Z' fill='black'/%3E%3C/svg%3E\")"

export function Cartridge({ marker }: { marker: Marker }) {
  const level = marker.level ?? 0
  const unknown = marker.level === null
  const low = !unknown && marker.low !== null && level <= marker.low
  const colors = marker.colors.length ? marker.colors : ['#000000']
  const name = LABEL[marker.name.toLowerCase()] ?? marker.name
  // Negre de debò en tots dos temes (el tub té fons clar per contrastar)
  const fill = (c: string) => (c.toUpperCase() === '#000000' ? '#141311' : c)

  return (
    <figure className="flex flex-col items-center gap-2" aria-label={`Tinta ${name}: ${unknown ? 'desconeguda' : `${level}%`}`}>
      <div className="relative">
        {/* tap del cartutx */}
        <div className="mx-auto h-2.5 w-9 rounded-t-md border-2 border-b-0 border-ink bg-surface-2" />
        <div className="relative h-36 w-[4.5rem] overflow-hidden rounded-[14px] border-[2.5px] border-ink bg-surface-2 dark:bg-[#4a463e]">
          {/* líquid */}
          <div
            className="absolute inset-x-0 bottom-0 flex transition-[height] duration-1000 ease-out"
            style={{ height: `${Math.max(level, unknown ? 0 : 2)}%` }}
          >
            {colors.map((c) => (
              <div key={c} className="relative h-full flex-1" style={{ background: fill(c) }}>
                <div
                  className="anim-wave absolute -top-[7px] left-0 h-2 w-[200%]"
                  style={{
                    background: fill(c),
                    WebkitMask: `${WAVE} 0 0 / 50% 100% repeat-x`,
                    mask: `${WAVE} 0 0 / 50% 100% repeat-x`,
                    animationDuration: `${5 + colors.indexOf(c)}s`,
                  }}
                />
              </div>
            ))}
          </div>
          {/* marca de nivell baix */}
          {marker.low !== null && (
            <div className="absolute inset-x-0 border-t-2 border-dashed border-danger/70" style={{ bottom: `${marker.low}%` }}>
              <span className="absolute -top-[9px] right-1 rounded bg-surface px-1 font-mono text-[0.6rem] font-medium text-danger-ink">baix</span>
            </div>
          )}
          {/* reflex del vidre */}
          <div className="pointer-events-none absolute inset-y-2 left-2 w-1.5 rounded-full bg-white/40" />
        </div>
        {low && (
          <span
            className="anim-bob absolute -right-3 top-3 grid h-7 w-7 place-items-center rounded-full bg-warn font-display font-extrabold text-[#1C1B18] shadow"
            aria-hidden
          >
            !
          </span>
        )}
      </div>
      <figcaption className="text-center leading-tight">
        <div className="font-mono text-lg font-medium">{unknown ? '?' : `${level}%`}</div>
        <div className="text-sm font-semibold text-muted">{name}</div>
      </figcaption>
    </figure>
  )
}
