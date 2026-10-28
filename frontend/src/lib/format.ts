import type { JobState, PrinterState } from '../api/types'

const MEDIA: Record<string, string> = {
  iso_a4_210x297mm: 'A4',
  iso_a5_148x210mm: 'A5',
  jis_b5_182x257mm: 'B5',
  'na_letter_8.5x11in': 'Carta',
  'na_legal_8.5x14in': 'Legal',
  'na_index-4x6_4x6in': 'Foto 10×15',
  na_5x7_5x7in: 'Foto 13×18',
  'oe_photo-l_3.5x5in': 'Foto L (9×13)',
  'oe_square-photo_5x5in': 'Quadrada 13×13',
}

export function mediaLabel(m?: string | null): string {
  if (!m) return '—'
  if (MEDIA[m]) return MEDIA[m]
  // PWG: classe_nom_mides → només el nom
  const parts = m.split('_')
  return parts.length >= 2 ? parts[1].replace(/-/g, ' ') : m
}

export const COLOR_MODES: Record<string, string> = {
  color: 'Color',
  monochrome: 'Blanc i negre',
  auto: 'Automàtic',
  'auto-monochrome': 'Auto (B/N)',
}
export const QUALITIES: Record<string, string> = { draft: 'Esborrany', normal: 'Normal', high: 'Alta' }
export const SCALING: Record<string, string> = {
  fit: 'Encabeix',
  fill: 'Omple',
  none: 'Mida real',
  'auto-fit': 'Auto encabeix',
  auto: 'Automàtic',
}
export const ORIENTATION: Record<string, string> = { auto: 'Auto', portrait: 'Vertical', landscape: 'Horitzontal' }

export const JOB_STATE: Record<JobState, string> = {
  pending: 'A la cua',
  held: 'Retingut',
  processing: 'Imprimint',
  stopped: 'Aturat',
  canceled: 'Anul·lat',
  aborted: 'Error',
  completed: 'Imprès',
}

export const PRINTER_STATE: Record<PrinterState, string> = {
  idle: 'A punt',
  processing: 'Imprimint',
  stopped: 'Aturada',
  offline: 'Apagada',
}

export function time(iso?: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('ca', { hour: '2-digit', minute: '2-digit' })
}

export function dateTime(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const today = new Date()
  const sameDay = d.toDateString() === today.toDateString()
  const yesterday = new Date(today.getTime() - 864e5).toDateString() === d.toDateString()
  const t = time(iso)
  if (sameDay) return `Avui, ${t}`
  if (yesterday) return `Ahir, ${t}`
  return `${d.toLocaleDateString('ca', { day: 'numeric', month: 'short' })}, ${t}`
}

export function bytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} kB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** "1-3,5" a partir d'un conjunt de pàgines. */
export function toRanges(pages: number[]): string {
  const s = [...new Set(pages)].sort((a, b) => a - b)
  const out: string[] = []
  let i = 0
  while (i < s.length) {
    let j = i
    while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++
    out.push(i === j ? `${s[i]}` : `${s[i]}-${s[j]}`)
    i = j + 1
  }
  return out.join(',')
}

/** Inversa de toRanges; null si no s'entén. */
export function parseRanges(spec: string, total: number): number[] | null {
  const out = new Set<number>()
  for (const raw of spec.split(',')) {
    const part = raw.trim()
    if (!part) continue
    const m = /^(\d+)\s*(?:-\s*(\d+))?$/.exec(part)
    if (!m) return null
    const a = +m[1]
    const b = m[2] ? +m[2] : a
    if (a < 1 || b < a || b > total) return null
    for (let p = a; p <= b; p++) out.add(p)
  }
  return out.size ? [...out].sort((x, y) => x - y) : null
}

