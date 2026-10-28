import { AnimatePresence, motion } from 'motion/react'
import { usePrinter, useQueue } from '../api/hooks'
import { Ticket } from './Ticket'

export function QueueList() {
  const { data, isLoading } = useQueue()
  const { data: printer } = usePrinter()
  const paused = printer?.queue ? !printer.queue.enabled : false
  const active = data?.active ?? []
  const today = data?.today ?? []

  return (
    <div className="space-y-8">
      <section aria-labelledby="queue-title">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 id="queue-title" className="font-display text-2xl font-extrabold tracking-tight">
            A la cua
          </h2>
          {active.length > 0 && <span className="font-mono text-sm text-muted">{active.length} en marxa</span>}
        </div>
        {paused && (
          <div className="mb-3 rounded-xl border border-warn/50 bg-warn/10 px-3 py-2 text-sm font-semibold text-warn-ink">
            Cua en pausa, els treballs esperen.
          </div>
        )}
        {!isLoading && active.length === 0 ? (
          <EmptyQueue />
        ) : (
          <ul className="space-y-3">
            <AnimatePresence initial={false}>
              {active.map((j) => (
                <motion.li
                  key={j.id}
                  layout
                  initial={{ opacity: 0, y: -12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: 30, transition: { duration: 0.2 } }}
                >
                  <Ticket job={j} paused={paused} />
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </section>

      {today.length > 0 && (
        <section aria-labelledby="today-title">
          <h2 id="today-title" className="mb-3 font-display text-xl font-extrabold tracking-tight text-muted">
            Avui
          </h2>
          <ul className="space-y-3">
            <AnimatePresence initial={false}>
              {today.map((j) => (
                <motion.li key={j.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <Ticket job={j} />
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </section>
      )}
    </div>
  )
}

function EmptyQueue() {
  return (
    <div className="flex items-center gap-4 rounded-[14px] border-2 border-dashed border-line px-5 py-6 text-muted">
      <svg viewBox="0 0 48 48" className="h-12 w-12 shrink-0" fill="none" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
        <rect x="10" y="8" width="28" height="34" rx="3" stroke="currentColor" />
        <path d="M16 18h16M16 24h12M16 30h14" stroke="var(--line)" />
        <path d="M33 4c2 2 2 4 0 6M38 6c1.5 1.5 1.5 3 0 4.5" stroke="var(--cyan)" />
      </svg>
      <div>
        <div className="font-semibold text-ink">Cua buida.</div>
        <div className="text-sm">Silenci a la copisteria.</div>
      </div>
    </div>
  )
}
