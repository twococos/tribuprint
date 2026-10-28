import { useSyncExternalStore } from 'react'

export type Route = 'imprimeix' | 'cua' | 'impressora' | 'historial' | 'perfils'
const ROUTES: Route[] = ['imprimeix', 'cua', 'impressora', 'historial', 'perfils']

function current(): Route {
  const h = window.location.hash.replace(/^#\/?/, '') as Route
  return ROUTES.includes(h) ? h : 'imprimeix'
}

export function useRoute(): Route {
  return useSyncExternalStore(
    (l) => {
      window.addEventListener('hashchange', l)
      return () => window.removeEventListener('hashchange', l)
    },
    current,
  )
}

export function navigate(r: Route) {
  window.location.hash = `/${r}`
}
