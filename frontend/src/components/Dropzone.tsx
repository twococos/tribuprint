import { useRef, useState } from 'react'

export const ACCEPT = '.pdf,.jpg,.jpeg,.png,.gif,.webp,.bmp,.tif,.tiff,.heic,.heif,.txt,.md,.csv,.doc,.docx,.odt,.rtf,.xls,.xlsx,.ods,.ppt,.pptx,.odp,application/pdf,image/*,text/plain'

/** Safata de paper on es deixen anar els fitxers. */
export function Dropzone({ onFiles, compact = false }: { onFiles: (files: File[]) => void; compact?: boolean }) {
  const [over, setOver] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const depth = useRef(0)

  return (
    <div
      onDragEnter={(e) => {
        e.preventDefault()
        depth.current++
        setOver(true)
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={() => {
        depth.current = Math.max(0, depth.current - 1)
        if (depth.current === 0) setOver(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        depth.current = 0
        setOver(false)
        const files = [...e.dataTransfer.files]
        if (files.length) onFiles(files)
      }}
      className={`relative rounded-[18px] border-2 border-dashed transition-colors ${over ? 'border-magenta bg-magenta/5' : 'border-line bg-surface-2/70 hover:border-muted'}`}
    >
      <button
        type="button"
        onClick={() => input.current?.click()}
        className={`flex w-full items-center gap-5 rounded-[16px] text-left ${compact ? 'px-4 py-3' : 'flex-col justify-center px-6 py-9 text-center sm:py-12'}`}
      >
        <Sheets moving={over} small={compact} />
        <span>
          <span className={`block font-display font-extrabold tracking-tight ${compact ? 'text-lg' : 'text-3xl'}`}>
            {over ? 'Deixa-ho anar!' : compact ? 'Afegeix més papers' : 'Deixa-hi els papers'}
          </span>
          <span className={`block text-muted ${compact ? 'text-sm' : 'mt-1'}`}>
            o <span className="font-semibold text-ink underline decoration-magenta decoration-2 underline-offset-4">tria fitxers</span>
            {!compact && <span className="mt-2 block text-sm">PDF, fotos (també HEIC de l'iPhone) i text</span>}
          </span>
        </span>
      </button>
      <input
        ref={input}
        type="file"
        multiple
        accept={ACCEPT}
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          const files = [...(e.target.files ?? [])]
          if (files.length) onFiles(files)
          e.target.value = ''
        }}
      />
    </div>
  )
}

function Sheets({ moving, small }: { moving: boolean; small: boolean }) {
  const cls = moving ? 'anim-shuffle' : ''
  return (
    <svg viewBox="0 0 120 92" className={small ? 'h-12 w-16 shrink-0' : 'h-24 w-32'} aria-hidden>
      {/* safata */}
      <path d="M8 60 L20 86 H100 L112 60" fill="var(--surface)" stroke="var(--ink)" strokeWidth="2.5" strokeLinejoin="round" />
      <g className={cls} style={{ ['--r' as string]: '-8deg', transformOrigin: '60px 60px', transform: 'rotate(-8deg)' }}>
        <rect x="30" y="10" width="54" height="64" rx="3" fill="var(--surface)" stroke="var(--ink)" strokeWidth="2" />
        <path d="M38 22 H72 M38 30 H66" stroke="var(--cyan)" strokeWidth="2.5" strokeLinecap="round" />
      </g>
      <g className={cls} style={{ ['--r' as string]: '6deg', transformOrigin: '60px 60px', transform: 'rotate(6deg)', animationDelay: '.1s' }}>
        <rect x="36" y="8" width="54" height="64" rx="3" fill="var(--surface)" stroke="var(--ink)" strokeWidth="2" />
        <path d="M44 20 H78 M44 28 H70 M44 36 H74" stroke="var(--magenta)" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="76" cy="58" r="5" fill="var(--yellow)" />
      </g>
      <path d="M8 60 H112" stroke="var(--ink)" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M14 66 L22 84 H98 L106 66" fill="var(--surface-2)" stroke="none" />
    </svg>
  )
}
