import { useSyncExternalStore } from 'react'

export type ToastKind = 'ok' | 'error' | 'warning' | 'info'
export interface Toast {
  id: number
  kind: ToastKind
  title: string
  body?: string
}

let toasts: Toast[] = []
let nextId = 1
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function toast(kind: ToastKind, title: string, body?: string, ms = 5000) {
  const id = nextId++
  toasts = [...toasts.slice(-3), { id, kind, title, body }]
  emit()
  setTimeout(() => dismiss(id), ms)
  notifyBrowser(title, body)
}

export function dismiss(id: number) {
  toasts = toasts.filter((t) => t.id !== id)
  emit()
}

export function useToasts() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => toasts,
  )
}

/* Notificacions del navegador: opcionals, només si la pestanya no es veu */
const NOTIF_KEY = 'tp-notify'

export function browserNotifyEnabled() {
  try {
    return localStorage.getItem(NOTIF_KEY) === '1' && 'Notification' in window && Notification.permission === 'granted'
  } catch {
    return false
  }
}

export async function setBrowserNotify(on: boolean) {
  if (on && 'Notification' in window && Notification.permission !== 'granted') {
    const p = await Notification.requestPermission()
    if (p !== 'granted') on = false
  }
  try {
    localStorage.setItem(NOTIF_KEY, on ? '1' : '0')
  } catch {
    /* sense localStorage, no passa res */
  }
  return on
}

function notifyBrowser(title: string, body?: string) {
  if (document.visibilityState === 'visible' || !browserNotifyEnabled()) return
  try {
    new Notification(title, { body, icon: '/favicon.svg' })
  } catch {
    /* alguns mòbils només permeten notificacions des d'un service worker */
  }
}
