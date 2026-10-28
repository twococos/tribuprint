import { AnimatePresence, motion } from 'motion/react'
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { dismiss, useToasts, type ToastKind } from '../lib/toasts'

const STYLE: Record<ToastKind, { Icon: typeof Info; color: string }> = {
  ok: { Icon: CheckCircle2, color: 'var(--ok)' },
  error: { Icon: XCircle, color: 'var(--danger)' },
  warning: { Icon: AlertTriangle, color: 'var(--warn)' },
  info: { Icon: Info, color: 'var(--cyan)' },
}

export function Toasts() {
  const toasts = useToasts()
  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-[72px] z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6 lg:top-auto lg:items-end lg:px-8"
      aria-live="polite"
    >
      <AnimatePresence>
        {toasts.map((t) => {
          const { Icon, color } = STYLE[t.kind]
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40 }}
              className="card pointer-events-auto flex w-full max-w-sm items-start gap-3 p-3 pl-4"
              style={{ borderLeft: `4px solid ${color}` }}
              role={t.kind === 'error' ? 'alert' : 'status'}
            >
              <Icon size={20} style={{ color }} className="mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{t.title}</div>
                {t.body && <div className="truncate text-sm text-muted">{t.body}</div>}
              </div>
              <button type="button" className="icon-btn -my-2 -mr-1 h-9 w-9" onClick={() => dismiss(t.id)} aria-label="Tanca l'avís">
                <X size={16} />
              </button>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
