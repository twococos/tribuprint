import type {
  HistoryPage,
  Job,
  JobOptions,
  Printer,
  Profile,
  QueuePayload,
  Stats,
  UploadResult,
} from './types'

export class ApiError extends Error {
  code: string
  status: number
  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, init)
  } catch {
    throw new ApiError(0, 'network', 'No arribo al servidor. Hi ha connexió?')
  }
  if (res.status === 204) return undefined as T
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    throw new ApiError(res.status, body?.error ?? 'http_error', body?.message ?? 'Alguna cosa no ha anat bé.')
  }
  return body as T
}

const json = (method: string, data?: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: data === undefined ? undefined : JSON.stringify(data),
})

export const api = {
  profiles: () => request<Profile[]>('/api/profiles'),
  createProfile: (p: Pick<Profile, 'name' | 'emoji' | 'color'>) => request<Profile>('/api/profiles', json('POST', p)),
  updateProfile: (id: number, p: Partial<Pick<Profile, 'name' | 'emoji' | 'color'>>) =>
    request<Profile>(`/api/profiles/${id}`, json('PATCH', p)),
  deleteProfile: (id: number) => request<void>(`/api/profiles/${id}`, { method: 'DELETE' }),

  printer: () => request<Printer>('/api/printer'),
  pause: () => request<Printer>('/api/printer/pause', { method: 'POST' }),
  resume: () => request<Printer>('/api/printer/resume', { method: 'POST' }),

  queue: async (): Promise<QueuePayload> => {
    const [active, today] = await Promise.all([
      request<{ items: Job[]; duplex_waiting: QueuePayload['duplex_waiting'] }>('/api/jobs?scope=active'),
      request<{ items: Job[] }>('/api/jobs?scope=today'),
    ])
    return { active: active.items, duplex_waiting: active.duplex_waiting, today: today.items }
  },
  history: (page: number, profile?: number | null) =>
    request<HistoryPage>(`/api/jobs?scope=history&page=${page}${profile ? `&profile=${profile}` : ''}`),
  createJob: (upload_id: string, profile_id: number, options: JobOptions) =>
    request<{ items: Job[] }>('/api/jobs', json('POST', { upload_id, profile_id, options })),
  jobAction: (id: number, action: 'cancel' | 'hold' | 'release') =>
    request<Job>(`/api/jobs/${id}/${action}`, { method: 'POST' }),
  reprint: (id: number, profile_id: number) => request<{ items: Job[] }>(`/api/jobs/${id}/reprint`, json('POST', { profile_id })),
  duplexContinue: (batch: number) => request<Job>(`/api/duplex/${batch}/continue`, { method: 'POST' }),
  duplexCancel: (batch: number) => request<unknown>(`/api/duplex/${batch}/cancel`, { method: 'POST' }),
  stats: (month?: string) => request<Stats>(`/api/stats${month ? `?month=${month}` : ''}`),
  mockCondition: (condition: string) => request<unknown>('/api/mock/condition', json('POST', { condition })),
}

/** Pujada amb progrés (fetch encara no en dona). */
export function uploadFile(file: File, onProgress?: (p: number) => void): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/uploads')
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total)
    xhr.onload = () => {
      let body: any = null
      try {
        body = JSON.parse(xhr.responseText)
      } catch {
        /* resposta no JSON (p. ex. 413 de NPM) */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body)
      else if (xhr.status === 413) reject(new ApiError(413, 'too_large', 'El fitxer és massa gros.'))
      else reject(new ApiError(xhr.status, body?.error ?? 'http_error', body?.message ?? 'No s\'ha pogut pujar.'))
    }
    xhr.onerror = () => reject(new ApiError(0, 'network', 'No arribo al servidor. Hi ha connexió?'))
    const fd = new FormData()
    fd.append('file', file)
    xhr.send(fd)
  })
}
