export type Severity = 'error' | 'warning' | 'info' | 'unknown'

export interface Profile {
  id: number
  name: string
  emoji: string
  color: string
  deleted: boolean
}

export interface Alert {
  code: string
  severity: Severity
  message: string
}

export interface Marker {
  name: string
  colors: string[]
  level: number | null
  low: number | null
  high: number | null
}

export interface Capabilities {
  media: string[]
  media_default: string
  color_modes: string[]
  qualities: string[]
  scaling: string[]
  copies_max: number
  sides: string[]
}

export type PrinterState = 'idle' | 'processing' | 'stopped' | 'offline'

export interface Printer {
  online: boolean
  state: PrinterState
  reasons: string[]
  alerts: Alert[]
  alert_description: string | null
  markers: Marker[]
  media_ready: string[]
  make_and_model: string | null
  queue: { enabled: boolean; accepting: boolean; reason: string | null } | null
  capabilities: Capabilities
  cups_web_url: string
  backend: 'real' | 'mock'
}

export type JobState = 'pending' | 'held' | 'processing' | 'stopped' | 'canceled' | 'aborted' | 'completed'

export interface JobOptions {
  copies: number
  pages: string | null
  color_mode: string
  quality: string
  media: string
  scaling: string
  orientation: 'auto' | 'portrait' | 'landscape'
  duplex_manual: boolean
}

export interface Job {
  id: number
  number: string
  cups_job_id: number | null
  filename: string
  pages: number
  copies: number
  options: Partial<JobOptions>
  color: boolean
  state: JobState
  state_reason: string | null
  progress: number | null
  sheets_completed: number | null
  sheets_total: number
  created_at: string
  completed_at: string | null
  profile: Profile | null
  duplex: { batch_id: number; stage: 1 | 2; status: string | null } | null
  reprintable: boolean
}

export interface DuplexWaiting {
  batch_id: number
  status: string
  filename: string
  odd_job_id: number | null
  even_job_id: number | null
  profile: Profile | null
}

export interface QueuePayload {
  active: Job[]
  today: Job[]
  duplex_waiting: DuplexWaiting[]
}

export interface UploadResult {
  id: string
  name: string
  pages: number
  pdf_url: string
  size: number
  expires_at: string
}

export interface HistoryPage {
  items: Job[]
  page: number
  page_size: number
  total: number
  pages: number
}

export interface Stats {
  month: string
  total_pages: number
  color_pages: number
  mono_pages: number
  color_pct: number
  jobs: number
  ranking: { profile: Profile | null; pages: number; color_pages: number; jobs: number }[]
  all_time_pages: number
}
