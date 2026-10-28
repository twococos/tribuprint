export function PrinterGlyph({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden fill="none" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 16V6h16v10" stroke="var(--cyan)" />
      <rect x="6" y="16" width="28" height="13" rx="3.5" stroke="currentColor" />
      <path d="M12 25h16v10H12z" stroke="var(--magenta)" fill="var(--surface)" />
      <path d="M15 29h10M15 32h6" stroke="var(--magenta)" strokeWidth="1.6" />
      <circle cx="29" cy="21" r="1.6" fill="var(--yellow)" stroke="none" />
    </svg>
  )
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5 select-none">
      <PrinterGlyph className="h-9 w-9 shrink-0 text-ink" />
      <div className="leading-none">
        <div className="riso font-display text-[1.45rem] font-extrabold tracking-tight">TribuPrint</div>
        {!compact && (
          <div className="smallcaps mt-1 text-[0.82rem] text-muted">Servei de reprografia de la Tribu</div>
        )}
      </div>
    </div>
  )
}
