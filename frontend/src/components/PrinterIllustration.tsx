export type IllustrationState = 'idle' | 'printing' | 'error' | 'offline'

/** Impressora dibuixada amb línies; cada estat té la seva animació (CSS). */
export function PrinterIllustration({ state, className = '' }: { state: IllustrationState; className?: string }) {
  const off = state === 'offline'
  const led = { idle: 'var(--ok)', printing: 'var(--cyan)', error: 'var(--danger)', offline: 'var(--line)' }[state]
  const stroke = 'var(--ink)'
  return (
    <svg
      viewBox="0 0 220 170"
      className={className}
      role="img"
      aria-label={{ idle: 'Impressora en repòs', printing: 'Impressora imprimint', error: 'Impressora amb un error', offline: 'Impressora apagada' }[state]}
      style={{ filter: off ? 'grayscale(1)' : undefined, opacity: off ? 0.6 : 1 }}
    >
      <g className={state === 'idle' ? 'anim-breathe' : ''} style={{ transformBox: 'fill-box' }}>
        {/* safata posterior amb fulls */}
        <g strokeLinejoin="round" strokeWidth="2.5">
          <path d="M62 62 L74 14 H150 L160 62 Z" fill="var(--surface-2)" stroke={stroke} />
          <path d="M80 56 L88 22 H140 L146 56 Z" fill="var(--surface)" stroke="var(--line)" strokeWidth="2" />
          <path d="M96 32 H132 M94 40 H136 M92 48 H130" stroke="var(--line)" strokeWidth="2" strokeLinecap="round" />
        </g>

        {/* cos */}
        <rect x="22" y="58" width="176" height="62" rx="14" fill="var(--surface)" stroke={stroke} strokeWidth="3" />
        <path d="M34 72 H186" stroke="var(--line)" strokeWidth="2" strokeLinecap="round" />
        {/* panell */}
        <rect x="150" y="80" width="30" height="16" rx="4" fill="var(--surface-2)" stroke={stroke} strokeWidth="2" />
        <circle cx="140" cy="88" r="4.5" fill={led} className={state === 'error' ? 'anim-blink' : ''} />
        {/* ranura de sortida */}
        <rect x="56" y="104" width="108" height="7" rx="3.5" fill="var(--ink)" />

        {/* full que surt */}
        {state === 'printing' && (
          <g className="anim-sheet">
            <rect x="70" y="108" width="80" height="34" rx="2" fill="var(--surface)" stroke={stroke} strokeWidth="2" />
            <path d="M80 120 H128" stroke="var(--cyan)" strokeWidth="3" strokeLinecap="round" />
            <path d="M80 128 H140" stroke="var(--magenta)" strokeWidth="3" strokeLinecap="round" />
            <path d="M80 134 H118" stroke="var(--yellow)" strokeWidth="3" strokeLinecap="round" />
          </g>
        )}
        {/* tapa per amagar el full mentre "entra" */}
        <rect x="56" y="96" width="108" height="9" fill="var(--surface)" />

        {/* safata de sortida */}
        <path d="M48 120 L36 150 H184 L172 120" fill="var(--surface-2)" stroke={stroke} strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M44 140 H176" stroke="var(--line)" strokeWidth="2" />

        {/* potes */}
        <rect x="40" y="150" width="20" height="6" rx="2" fill="var(--ink)" />
        <rect x="160" y="150" width="20" height="6" rx="2" fill="var(--ink)" />
      </g>

      {state === 'error' && (
        <g className="anim-blink">
          <circle cx="196" cy="44" r="16" fill="var(--danger)" />
          <path d="M196 35 V47" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
          <circle cx="196" cy="54" r="2.4" fill="#fff" />
        </g>
      )}

      {off && (
        <g fill="var(--muted)" fontFamily="var(--font-display)" fontWeight="800">
          <text x="176" y="50" fontSize="18" className="anim-zzz" style={{ transformBox: 'fill-box' }}>z</text>
          <text x="186" y="36" fontSize="14" className="anim-zzz" style={{ animationDelay: '.9s', transformBox: 'fill-box' }}>z</text>
          <text x="194" y="24" fontSize="11" className="anim-zzz" style={{ animationDelay: '1.8s', transformBox: 'fill-box' }}>z</text>
        </g>
      )}
    </svg>
  )
}
