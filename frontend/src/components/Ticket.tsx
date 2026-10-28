import { Ban, Hand, Play, RotateCcw } from 'lucide-react'
import { api } from '../api/client'
import { useAction } from '../api/hooks'
import type { Job } from '../api/types'
import { COLOR_MODES, JOB_STATE, mediaLabel, plural, QUALITIES, time } from '../lib/format'
import { profileStore } from '../lib/prefs'
import { toast } from '../lib/toasts'
import { ProfileAvatar, profileName } from './ProfileAvatar'
import { Stamp } from './Stamp'

function detail(job: Job, paused: boolean): string | null {
  if (job.state === 'held') return 'Retingut fins que el deixis anar'
  if (job.state === 'pending') return paused ? 'Esperant: la cua està en pausa' : 'Esperant torn'
  if (job.state === 'processing') {
    if (job.state_reason === 'printer-stopped') return 'Esperant la impressora (mira els avisos)'
    if (job.sheets_completed !== null && job.sheets_total > 1)
      return `Full ${Math.min(job.sheets_completed + 1, job.sheets_total)} de ${job.sheets_total}`
    return 'Imprimint… no toquis res'
  }
  if (job.state === 'aborted') return 'La impressora no l\'ha pogut acabar'
  return null
}

function chips(job: Job): string[] {
  const o = job.options
  const out = [plural(job.pages, 'pàg.', 'pàg.') + (job.copies > 1 ? ` × ${job.copies}` : '')]
  out.push(o.color_mode === 'monochrome' ? 'B/N' : (COLOR_MODES[o.color_mode ?? 'color'] ?? 'Color'))
  out.push(mediaLabel(o.media))
  if (o.quality === 'high') out.push(QUALITIES.high)
  if (job.duplex) out.push(job.duplex.stage === 1 ? 'Doble cara · A' : 'Doble cara · B')
  return out
}

export function Ticket({ job, paused = false }: { job: Job; paused?: boolean }) {
  const final = ['completed', 'canceled', 'aborted'].includes(job.state)
  const act = useAction(({ action }: { action: 'cancel' | 'hold' | 'release' }) => api.jobAction(job.id, action))
  const reprint = useAction(() => api.reprint(job.id, profileStore.get() ?? job.profile?.id ?? 0), {
    onSuccess: () => toast('ok', 'Tornem-hi!', `${job.filename} és a la cua`),
  })
  const info = detail(job, paused)
  const progress = job.state === 'processing' ? (job.progress ?? 0) : null

  return (
    <article className="ticket-wrap">
      <div className="ticket relative px-5 py-3.5 sm:px-6">
        <header className="flex items-center justify-between font-mono text-xs text-muted">
          <span>Nº {job.number}</span>
          <span>{time(job.created_at)}</span>
        </header>
        <div className="dotted my-2.5" />

        <div className="flex items-start gap-3">
          <ProfileAvatar profile={job.profile} size="md" />
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-semibold leading-snug" title={job.filename}>
              {job.filename}
            </h3>
            <div className="text-sm text-muted">{profileName(job.profile)}</div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {chips(job).map((c) => (
                <span key={c} className="rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-[0.72rem] text-muted ring-1 ring-line">
                  {c}
                </span>
              ))}
            </div>
          </div>
        </div>

        {progress !== null && (
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2 ring-1 ring-line" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
            <div
              className="h-full rounded-full transition-[width] duration-700"
              style={{ width: `${Math.max(6, progress * 100)}%`, background: 'linear-gradient(90deg, var(--cyan), var(--magenta), var(--yellow))' }}
            />
          </div>
        )}

        {(info || !final || job.reprintable) && <div className="dotted my-3" />}

        <footer className="flex flex-wrap items-center gap-2">
          {!final && (
            <span className="pill" style={{ borderColor: job.state === 'held' ? 'var(--warn)' : undefined }}>
              <span
                className={`h-2 w-2 rounded-full ${job.state === 'processing' ? 'anim-pulse' : ''}`}
                style={{ background: job.state === 'processing' ? 'var(--cyan)' : job.state === 'held' ? 'var(--warn)' : 'var(--muted)', color: 'var(--cyan)' }}
              />
              {JOB_STATE[job.state]}
            </span>
          )}
          {info && <span className="text-sm text-muted">{info}</span>}
          <div className="ml-auto flex gap-1.5">
            {job.state === 'pending' && (
              <button type="button" className="btn btn-ghost h-10 min-h-0 px-3 text-sm" onClick={() => act.mutate({ action: 'hold' })} disabled={act.isPending}>
                <Hand size={16} /> Retén
              </button>
            )}
            {job.state === 'held' && (
              <button type="button" className="btn btn-ghost h-10 min-h-0 px-3 text-sm" onClick={() => act.mutate({ action: 'release' })} disabled={act.isPending}>
                <Play size={16} /> Allibera
              </button>
            )}
            {!final && (
              <button type="button" className="btn btn-danger h-10 min-h-0 px-3 text-sm" onClick={() => act.mutate({ action: 'cancel' })} disabled={act.isPending}>
                <Ban size={16} /> Cancel·la
              </button>
            )}
            {final && job.reprintable && (
              <button type="button" className="btn btn-ghost h-10 min-h-0 px-3 text-sm" onClick={() => reprint.mutate(undefined)} disabled={reprint.isPending}>
                <RotateCcw size={16} /> Torna a imprimir
              </button>
            )}
          </div>
        </footer>

        {final && <Stamp state={job.state} />}
      </div>
    </article>
  )
}
