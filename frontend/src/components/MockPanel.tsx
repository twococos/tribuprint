import { FlaskConical } from 'lucide-react'
import { api } from '../api/client'
import { useAction } from '../api/hooks'

const CONDITIONS: [string, string][] = [
  ['ok', 'Tot bé'],
  ['no_paper', 'Sense paper'],
  ['jam', 'Encallada'],
  ['cover_open', 'Tapa oberta'],
  ['low_ink', 'Poca tinta'],
  ['offline', 'Apagada'],
  ['unknown', 'Motiu estrany'],
]

/** Només amb el backend simulat: provoca estats per provar la UI. */
export function MockPanel() {
  const set = useAction((c: string) => api.mockCondition(c))
  return (
    <details className="border-t border-dashed border-line px-4 py-3 text-sm sm:px-5">
      <summary className="flex min-h-[32px] cursor-pointer items-center gap-2 font-semibold text-muted">
        <FlaskConical size={16} /> Simulador (mode mock)
      </summary>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {CONDITIONS.map(([c, label]) => (
          <button key={c} type="button" className="pill min-h-[36px] hover:border-muted" onClick={() => set.mutate(c)}>
            {label}
          </button>
        ))}
      </div>
    </details>
  )
}
