import { Moon, Sun } from 'lucide-react'
import { usePrinter } from '../api/hooks'
import type { Profile } from '../api/types'
import { navigate, type Route } from '../lib/router'
import { applyTheme, themeStore } from '../lib/prefs'
import { Logo } from './Logo'
import { ProfileAvatar } from './ProfileAvatar'
import { StatusPill } from './StatusPill'

export function ThemeToggle() {
  const theme = themeStore.use()
  const next = theme === 'dark' ? 'light' : 'dark'
  return (
    <button
      type="button"
      className="icon-btn"
      onClick={() => {
        themeStore.set(next)
        applyTheme(next)
      }}
      aria-label={theme === 'dark' ? 'Mode clar' : 'Mode fosc'}
      title={theme === 'dark' ? 'Mode clar' : 'Mode fosc'}
    >
      {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
    </button>
  )
}

export function Header({ profile, route, desktop }: { profile: Profile; route: Route; desktop: boolean }) {
  const { data: printer } = usePrinter()
  const links: [Route, string][] = [
    ['imprimeix', 'Imprimeix'],
    ['historial', 'Historial'],
  ]
  return (
    <header className="sticky top-0 z-30 border-b border-line/70 bg-paper/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1240px] items-center gap-3 px-4 sm:h-[72px] lg:px-8">
        <a href="#/imprimeix" className="min-w-0 shrink rounded-lg" aria-label="TribuPrint, inici">
          <Logo compact={!desktop} />
        </a>
        {desktop && (
          <nav className="ml-8 flex gap-1" aria-label="Seccions">
            {links.map(([r, label]) => {
              const on = r === 'historial' ? route === 'historial' : route !== 'historial'
              return (
                <a
                  key={r}
                  href={`#/${r}`}
                  aria-current={on ? 'page' : undefined}
                  className={`rounded-full px-4 py-2 font-semibold transition-colors ${on ? 'bg-ink text-paper' : 'text-muted hover:bg-surface-2 hover:text-ink'}`}
                >
                  {label}
                </a>
              )
            })}
          </nav>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-0.5 sm:gap-2">
          <StatusPill printer={printer} onClick={() => navigate('impressora')} />
          <ThemeToggle />
          <button
            type="button"
            onClick={() => navigate('perfils')}
            className="flex items-center gap-2 rounded-full p-1 pr-1 transition-colors hover:bg-surface-2 sm:pr-3"
            aria-label={`Ets ${profile.name}. Canvia de perfil`}
            title="Canvia de perfil"
          >
            <ProfileAvatar profile={profile} size="sm" />
            {desktop && (
              <span className="text-left leading-tight">
                <span className="block text-sm font-semibold">{profile.name}</span>
                <span className="block text-xs text-muted">Canvia de perfil</span>
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  )
}
