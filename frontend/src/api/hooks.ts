import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useSyncExternalStore } from 'react'
import { toast } from '../lib/toasts'
import { api, ApiError } from './client'
import type { Alert, Printer, QueuePayload } from './types'

/* --- estat de la connexió SSE (si cau, tornem al polling) --- */
let sseUp = false
const sseListeners = new Set<() => void>()
function setSse(v: boolean) {
  if (v === sseUp) return
  sseUp = v
  sseListeners.forEach((l) => l())
}
export function useSseConnected() {
  return useSyncExternalStore(
    (l) => {
      sseListeners.add(l)
      return () => sseListeners.delete(l)
    },
    () => sseUp,
  )
}

export function useProfiles() {
  return useQuery({ queryKey: ['profiles'], queryFn: api.profiles })
}

export function usePrinter() {
  const live = useSseConnected()
  return useQuery({ queryKey: ['printer'], queryFn: api.printer, refetchInterval: live ? false : 5000 })
}

export function useQueue() {
  const live = useSseConnected()
  return useQuery({ queryKey: ['queue'], queryFn: api.queue, refetchInterval: live ? false : 3000 })
}

const STATE_TOAST: Record<string, [kind: 'ok' | 'error' | 'info', title: string]> = {
  completed: ['ok', 'Imprès!'],
  canceled: ['info', 'Treball anul·lat'],
  aborted: ['error', 'El treball ha fallat'],
}

/** Escolta /api/events i escriu directament a la memòria cau de TanStack Query. */
export function useLiveEvents() {
  const qc = useQueryClient()
  const seenAlerts = useRef<Set<string> | null>(null)

  useEffect(() => {
    let es: EventSource | null = null
    let retry: ReturnType<typeof setTimeout> | undefined
    let closed = false

    const onPrinter = (p: Printer) => {
      qc.setQueryData(['printer'], p)
      // Toast només per alertes noves (no en carregar la pàgina)
      const codes = new Set(p.alerts.filter(isLoud).map((a) => a.code))
      if (seenAlerts.current) {
        for (const a of p.alerts.filter(isLoud)) {
          if (!seenAlerts.current.has(a.code)) toast(a.severity === 'error' ? 'error' : 'warning', a.message)
        }
      }
      seenAlerts.current = codes
    }

    const connect = () => {
      es = new EventSource('/api/events')
      es.onopen = () => setSse(true)
      es.addEventListener('printer', (e) => onPrinter(JSON.parse((e as MessageEvent).data)))
      es.addEventListener('jobs', (e) => qc.setQueryData(['queue'], JSON.parse((e as MessageEvent).data) as QueuePayload))
      es.addEventListener('job_done', (e) => {
        const d = JSON.parse((e as MessageEvent).data)
        const t = STATE_TOAST[d.state]
        if (t) toast(t[0], t[1], d.filename)
        qc.invalidateQueries({ queryKey: ['history'] })
        qc.invalidateQueries({ queryKey: ['stats'] })
      })
      es.onerror = () => {
        setSse(false)
        es?.close()
        if (!closed) retry = setTimeout(connect, 4000)
      }
    }
    connect()
    return () => {
      closed = true
      clearTimeout(retry)
      es?.close()
      setSse(false)
    }
  }, [qc])
}

const isLoud = (a: Alert) => a.severity === 'error' || a.severity === 'warning'

/** Mutació amb toast d'error automàtic i refresc de la cua. */
export function useAction<A, R>(fn: (a: A) => Promise<R>, opts?: { onSuccess?: (r: R, a: A) => void }) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: (r, a) => {
      qc.invalidateQueries({ queryKey: ['queue'] })
      opts?.onSuccess?.(r, a)
    },
    onError: (e) => toast('error', e instanceof ApiError ? e.message : 'Alguna cosa no ha anat bé.'),
  })
}
