import { ArrowRight, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { api } from '../api/client'
import { useAction, useQueue } from '../api/hooks'
import { DUPLEX_GUIDE } from '../duplexGuide'
import { Modal } from './Modal'
import { profileName } from './ProfileAvatar'

/** Apareix quan la cara A d'un dúplex manual ha acabat. */
export function DuplexModal() {
  const { data } = useQueue()
  const [dismissed, setDismissed] = useState<number[]>([])
  const batch = data?.duplex_waiting.find((b) => !dismissed.includes(b.batch_id))
  const go = useAction((id: number) => api.duplexContinue(id))
  const cancel = useAction((id: number) => api.duplexCancel(id))

  if (!batch) return null
  return (
    <Modal open title={DUPLEX_GUIDE.title} onClose={() => setDismissed((d) => [...d, batch.batch_id])} wide>
      <p className="-mt-2 mb-4 text-muted">
        <span className="font-semibold text-ink">{batch.filename}</span> · cara A feta. Ho ha enviat: {profileName(batch.profile)}.
      </p>
      <FlipIllustration />
      <ol className="mt-5 space-y-2">
        {DUPLEX_GUIDE.steps.map((s, i) => (
          <li key={i} className="flex gap-3">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ink font-mono text-sm text-paper">{i + 1}</span>
            <span className="pt-0.5">{s}</span>
          </li>
        ))}
      </ol>
      <div className="mt-6 flex flex-wrap justify-end gap-2">
        <button type="button" className="btn btn-ghost" onClick={() => cancel.mutate(batch.batch_id)} disabled={cancel.isPending || go.isPending}>
          Deixa-ho estar
        </button>
        <button type="button" className="btn btn-primary" onClick={() => go.mutate(batch.batch_id)} disabled={go.isPending || cancel.isPending}>
          {go.isPending ? <Loader2 size={18} className="animate-spin" /> : <ArrowRight size={18} />}
          Continua
        </button>
      </div>
    </Modal>
  )
}

/** Tres vinyetes: recull → gira → torna a la safata posterior. */
function FlipIllustration() {
  const flipAnim = DUPLEX_GUIDE.flip === 'long' ? 'flip-long' : 'flip-short'
  const down = DUPLEX_GUIDE.printedSide === 'down'
  return (
    <div className="grid grid-cols-3 items-end gap-2 rounded-xl bg-surface-2 p-3 ring-1 ring-line" aria-hidden>
      {/* 1. recull */}
      <figure className="text-center">
        <svg viewBox="0 0 100 80" className="mx-auto h-20 w-full">
          <path d="M14 58 L6 74 H94 L86 58" fill="var(--surface)" stroke="var(--ink)" strokeWidth="2.2" strokeLinejoin="round" />
          {[0, 1, 2].map((i) => (
            <g key={i} transform={`translate(${26 - i * 2} ${30 + i * 3})`}>
              <rect width="48" height="30" rx="2" fill="var(--surface)" stroke="var(--ink)" strokeWidth="1.8" />
              <path d="M6 8 H36 M6 14 H30" stroke="var(--cyan)" strokeWidth="2" strokeLinecap="round" />
            </g>
          ))}
          <path d="M50 22 V6 M44 12 L50 6 L56 12" stroke="var(--magenta)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        </svg>
        <figcaption className="text-xs font-semibold text-muted">Recull</figcaption>
      </figure>
      {/* 2. gira */}
      <figure className="text-center">
        <div className="mx-auto grid h-20 place-items-center [perspective:300px]">
          <div
            className="relative h-14 w-11 rounded-sm border-2 border-ink bg-surface"
            style={{ animation: `${flipAnim} 2.8s ease-in-out infinite` }}
          >
            <div className="absolute inset-x-1.5 top-2 space-y-1">
              <div className="h-1 rounded bg-cyan" />
              <div className="h-1 w-2/3 rounded bg-cyan" />
              <div className="h-1 w-4/5 rounded bg-cyan" />
            </div>
            <span className="absolute bottom-0.5 right-1 font-mono text-[0.6rem] font-medium">A</span>
          </div>
        </div>
        <figcaption className="text-xs font-semibold text-muted">
          Gira-ho {DUPLEX_GUIDE.flip === 'long' ? 'com un llibre' : 'com un bloc'}
        </figcaption>
      </figure>
      {/* 3. safata posterior */}
      <figure className="text-center">
        <svg viewBox="0 0 100 80" className="mx-auto h-20 w-full">
          <path d="M24 74 L34 14 H74 L80 74 Z" fill="var(--surface)" stroke="var(--ink)" strokeWidth="2.2" strokeLinejoin="round" />
          <rect x="38" y="24" width="34" height="40" rx="2" fill={down ? 'var(--surface-2)' : 'var(--surface)'} stroke="var(--ink)" strokeWidth="1.8" />
          {!down && <path d="M44 32 H66 M44 38 H60" stroke="var(--cyan)" strokeWidth="2" strokeLinecap="round" />}
          {down && <text x="55" y="50" fontSize="9" textAnchor="middle" fill="var(--muted)" fontFamily="var(--font-mono)">B</text>}
          <path d="M55 6 V18 M49 12 L55 18 L61 12" stroke="var(--magenta)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        </svg>
        <figcaption className="text-xs font-semibold text-muted">Safata posterior</figcaption>
      </figure>
    </div>
  )
}
