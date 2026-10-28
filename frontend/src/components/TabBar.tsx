import { FilePlus2, History, Layers, Printer } from 'lucide-react'
import { useQueue } from '../api/hooks'
import type { Route } from '../lib/router'

const TABS: { route: Route; label: string; Icon: typeof Printer }[] = [
  { route: 'imprimeix', label: 'Imprimeix', Icon: FilePlus2 },
  { route: 'cua', label: 'Cua', Icon: Layers },
  { route: 'impressora', label: 'Impressora', Icon: Printer },
  { route: 'historial', label: 'Historial', Icon: History },
]

export function TabBar({ route }: { route: Route }) {
  const { data } = useQueue()
  const pending = data?.active.length ?? 0
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md"
      aria-label="Seccions"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-4">
        {TABS.map(({ route: r, label, Icon }) => {
          const on = route === r
          return (
            <li key={r}>
              <a
                href={`#/${r}`}
                aria-current={on ? 'page' : undefined}
                className={`relative flex min-h-[60px] flex-col items-center justify-center gap-0.5 text-[0.72rem] font-semibold transition-colors ${on ? 'text-ink' : 'text-muted'}`}
              >
                {on && <span className="absolute top-0 h-[3px] w-10 rounded-b-full bg-magenta" />}
                <span className="relative">
                  <Icon size={22} strokeWidth={on ? 2.4 : 1.9} />
                  {r === 'cua' && pending > 0 && (
                    <span className="absolute -right-2.5 -top-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-magenta px-1 font-mono text-[0.65rem] text-white">
                      {pending}
                    </span>
                  )}
                </span>
                {label}
              </a>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
