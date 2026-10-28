import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { api } from '../api/client'
import { useProfiles } from '../api/hooks'
import type { Stats } from '../api/types'
import { ProfileAvatar, profileName } from '../components/ProfileAvatar'
import { Ticket } from '../components/Ticket'
import { dateTime, plural } from '../lib/format'

function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function monthName(month: string) {
  const [y, m] = month.split('-').map(Number)
  const s = new Date(y, m - 1, 1).toLocaleDateString('ca', { month: 'long', year: 'numeric' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}
const thisMonth = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function HistoryPage() {
  const [month, setMonth] = useState(thisMonth)
  const { data: stats } = useQuery({ queryKey: ['stats', month], queryFn: () => api.stats(month), placeholderData: keepPreviousData })
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start">
      <HistoryList />
      <div className="lg:sticky lg:top-24 lg:order-last">
        <StatsPanel stats={stats} month={month} setMonth={setMonth} />
      </div>
    </div>
  )
}

function StatsPanel({ stats, month, setMonth }: { stats?: Stats; month: string; setMonth: (m: string) => void }) {
  const max = Math.max(1, ...(stats?.ranking.map((r) => r.pages) ?? [1]))
  const medals = ['🥇', '🥈', '🥉']
  const isNow = month === thisMonth()
  return (
    <section className="card p-4 sm:p-5" aria-labelledby="stats-title">
      <div className="flex items-center justify-between">
        <h2 id="stats-title" className="font-display text-2xl font-extrabold tracking-tight">
          Estadístiques
        </h2>
        <div className="flex items-center">
          <button type="button" className="icon-btn" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Mes anterior">
            <ChevronLeft size={20} />
          </button>
          <span className="min-w-[8.5rem] text-center text-sm font-semibold">{monthName(month)}</span>
          <button type="button" className="icon-btn" onClick={() => setMonth(shiftMonth(month, 1))} disabled={isNow} aria-label="Mes següent">
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-surface-2 p-3 ring-1 ring-line">
          <div className="label">Pàgines</div>
          <div className="font-mono text-4xl font-medium tracking-tight">{stats?.total_pages ?? '—'}</div>
          <div className="text-xs text-muted">Una pila d'uns {((stats?.total_pages ?? 0) * 0.01).toFixed(1).replace('.', ',')} cm</div>
        </div>
        <div className="rounded-xl bg-surface-2 p-3 ring-1 ring-line">
          <div className="label">Color</div>
          <div className="font-mono text-4xl font-medium tracking-tight">{stats ? `${stats.color_pct}%` : '—'}</div>
          <div className="mt-2 flex h-2 overflow-hidden rounded-full ring-1 ring-line" aria-hidden>
            <span className="bg-cyan" style={{ width: `${(stats?.color_pct ?? 0) / 3}%` }} />
            <span className="bg-magenta" style={{ width: `${(stats?.color_pct ?? 0) / 3}%` }} />
            <span className="bg-yellow" style={{ width: `${(stats?.color_pct ?? 0) / 3}%` }} />
            <span className="flex-1 bg-key" />
          </div>
          <div className="mt-1 text-xs text-muted">{stats?.mono_pages ?? 0} en blanc i negre</div>
        </div>
      </div>

      <h3 className="mt-6 font-display text-lg font-extrabold tracking-tight">Rànquing de la tribu</h3>
      {stats && stats.ranking.length === 0 ? (
        <p className="mt-2 text-sm text-muted">Aquest mes no ha imprès ningú. Els arbres ho agraeixen. 🌳</p>
      ) : (
        <ol className="mt-3 space-y-3">
          {stats?.ranking.map((r, i) => (
            <li key={r.profile?.id ?? `x${i}`} className="flex items-center gap-3">
              <span className="w-6 text-center text-lg">{medals[i] ?? <span className="font-mono text-sm text-muted">{i + 1}</span>}</span>
              <ProfileAvatar profile={r.profile} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="flex justify-between gap-2 text-sm">
                  <span className="truncate font-semibold">{profileName(r.profile)}</span>
                  <span className="font-mono text-muted">{r.pages} pàg.</span>
                </div>
                <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-surface-2 ring-1 ring-line">
                  <div className="h-full rounded-full" style={{ width: `${(r.pages / max) * 100}%`, background: r.profile && !r.profile.deleted ? r.profile.color : 'var(--line)' }} />
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
      {stats && <p className="mt-5 text-xs text-muted">Des del principi dels temps: {plural(stats.all_time_pages, 'pàgina', 'pàgines')}.</p>}
    </section>
  )
}

function HistoryList() {
  const { data: profiles = [] } = useProfiles()
  const [profile, setProfile] = useState<number | null>(null)
  const [page, setPage] = useState(1)
  const { data, isLoading } = useQuery({
    queryKey: ['history', profile, page],
    queryFn: () => api.history(page, profile),
    placeholderData: keepPreviousData,
  })

  return (
    <section aria-labelledby="history-title">
      <h1 id="history-title" className="font-display text-3xl font-extrabold tracking-tight">
        Historial
      </h1>
      <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label="Filtra per perfil">
        <button
          type="button"
          onClick={() => {
            setProfile(null)
            setPage(1)
          }}
          aria-pressed={profile === null}
          className={`pill min-h-[40px] shrink-0 px-4 ${profile === null ? 'border-ink bg-ink text-paper' : ''}`}
        >
          Tothom
        </button>
        {profiles.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => {
              setProfile(p.id)
              setPage(1)
            }}
            aria-pressed={profile === p.id}
            className={`pill min-h-[40px] shrink-0 pl-1 pr-3 ${profile === p.id ? 'border-ink bg-ink text-paper' : ''}`}
          >
            <ProfileAvatar profile={p} size="xs" />
            {p.name}
          </button>
        ))}
      </div>

      {!isLoading && data?.items.length === 0 && (
        <p className="mt-6 rounded-[14px] border-2 border-dashed border-line px-5 py-8 text-center text-muted">
          Encara no hi ha res a l'arxiu. Quan imprimiu, ho anotarem aquí.
        </p>
      )}

      <ul className="mt-4 space-y-3">
        {data?.items.map((j, i) => {
          const prev = data.items[i - 1]
          const day = dateTime(j.created_at).split(',')[0]
          const showDay = !prev || dateTime(prev.created_at).split(',')[0] !== day
          return (
            <li key={j.id}>
              {showDay && <div className="smallcaps mb-2 mt-4 text-sm font-semibold text-muted first:mt-0">{day}</div>}
              <Ticket job={j} />
            </li>
          )
        })}
      </ul>

      {data && data.pages > 1 && (
        <nav className="mt-5 flex items-center justify-center gap-3" aria-label="Pàgines de l'historial">
          <button type="button" className="btn btn-ghost" onClick={() => setPage((p) => p - 1)} disabled={page <= 1}>
            <ChevronLeft size={18} /> Més nous
          </button>
          <span className="font-mono text-sm text-muted">
            {page} / {data.pages}
          </span>
          <button type="button" className="btn btn-ghost" onClick={() => setPage((p) => p + 1)} disabled={page >= data.pages}>
            Més antics <ChevronRight size={18} />
          </button>
        </nav>
      )}
    </section>
  )
}
