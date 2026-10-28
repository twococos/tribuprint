import { useSyncExternalStore } from 'react'

/* Preferències locals del navegador (perfil triat i tema) */

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
function write(key: string, v: string | null) {
  try {
    if (v === null) localStorage.removeItem(key)
    else localStorage.setItem(key, v)
  } catch {
    /* mode privat: només dura la sessió */
  }
}

function store<T>(key: string, parse: (s: string | null) => T, ser: (v: T) => string | null) {
  let value = parse(read(key))
  const ls = new Set<() => void>()
  return {
    get: () => value,
    set: (v: T) => {
      value = v
      write(key, ser(v))
      ls.forEach((l) => l())
    },
    use: () =>
      useSyncExternalStore(
        (l) => {
          ls.add(l)
          return () => ls.delete(l)
        },
        () => value,
      ),
  }
}

export const profileStore = store<number | null>(
  'tp-profile',
  (s) => (s && /^\d+$/.test(s) ? Number(s) : null),
  (v) => (v === null ? null : String(v)),
)

export type Theme = 'light' | 'dark'
export const themeStore = store<Theme>(
  'tp-theme',
  (s) => (s === 'dark' ? 'dark' : 'light'), // sempre comença en clar
  (v) => v,
)

export function applyTheme(t: Theme) {
  document.documentElement.dataset.theme = t
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'dark' ? '#1A1916' : '#F7F3EA')
}
