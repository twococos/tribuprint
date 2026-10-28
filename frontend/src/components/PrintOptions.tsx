import { Minus, Plus } from 'lucide-react'
import type { Capabilities, JobOptions } from '../api/types'
import { mediaLabel, ORIENTATION, QUALITIES, SCALING } from '../lib/format'

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: [T, string][]
  onChange: (v: T) => void
}) {
  return (
    <fieldset>
      <legend className="label mb-1.5">{label}</legend>
      <div className="flex rounded-full border-[1.5px] border-line bg-surface-2 p-1">
        {options.map(([v, text]) => (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            aria-pressed={value === v}
            className={`min-h-[38px] flex-1 rounded-full px-2 text-sm font-semibold transition-all ${value === v ? 'bg-ink text-paper shadow-sm' : 'text-muted hover:text-ink'}`}
          >
            {text}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

export function PrintOptions({
  caps,
  value,
  onChange,
}: {
  caps: Capabilities
  value: JobOptions
  onChange: (o: JobOptions) => void
}) {
  const set = <K extends keyof JobOptions>(k: K, v: JobOptions[K]) => onChange({ ...value, [k]: v })
  const colorOpts = (
    [
      ['color', 'Color'],
      ['monochrome', 'Blanc i negre'],
    ] as [string, string][]
  ).filter(([v]) => caps.color_modes.includes(v))
  const scaleOpts = (['fit', 'fill', 'none'] as const).filter((s) => caps.scaling.includes(s)).map((s) => [s, SCALING[s]] as [string, string])
  const max = value.duplex_manual ? 1 : caps.copies_max

  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <fieldset>
        <legend className="label mb-1.5">Còpies</legend>
        <div className="flex items-center gap-2">
          <button type="button" className="icon-btn border-[1.5px] border-line text-ink" onClick={() => set('copies', Math.max(1, value.copies - 1))} disabled={value.copies <= 1} aria-label="Una còpia menys">
            <Minus size={18} />
          </button>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={max}
            value={value.copies}
            onChange={(e) => set('copies', Math.min(max, Math.max(1, Number(e.target.value) || 1)))}
            className="field w-16 text-center font-mono text-lg"
            aria-label="Nombre de còpies"
          />
          <button type="button" className="icon-btn border-[1.5px] border-line text-ink" onClick={() => set('copies', Math.min(max, value.copies + 1))} disabled={value.copies >= max} aria-label="Una còpia més">
            <Plus size={18} />
          </button>
        </div>
      </fieldset>

      {colorOpts.length > 1 && <Segmented label="Color" value={value.color_mode} options={colorOpts} onChange={(v) => set('color_mode', v)} />}

      {caps.qualities.length > 1 && (
        <Segmented
          label="Qualitat"
          value={value.quality}
          options={caps.qualities.map((q) => [q, QUALITIES[q] ?? q] as [string, string])}
          onChange={(v) => set('quality', v)}
        />
      )}

      <label>
        <span className="label mb-1.5 block">Paper</span>
        <select className="field appearance-none bg-[length:16px] bg-[right_.8rem_center] bg-no-repeat pr-9 font-semibold" value={value.media} onChange={(e) => set('media', e.target.value)} style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%236E685D' stroke-width='2.5'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }}>
          {caps.media.map((m) => (
            <option key={m} value={m}>
              {mediaLabel(m)}
            </option>
          ))}
        </select>
      </label>

      {scaleOpts.length > 1 && <Segmented label="Ajust" value={value.scaling} options={scaleOpts} onChange={(v) => set('scaling', v)} />}

      <Segmented
        label="Orientació"
        value={value.orientation}
        options={(['auto', 'portrait', 'landscape'] as const).map((o) => [o, ORIENTATION[o]] as [typeof o, string])}
        onChange={(v) => set('orientation', v)}
      />

      <label className="flex cursor-pointer items-start gap-3 rounded-xl border-[1.5px] border-line bg-surface-2 p-3 sm:col-span-2">
        <input
          type="checkbox"
          checked={value.duplex_manual}
          onChange={(e) => onChange({ ...value, duplex_manual: e.target.checked, copies: e.target.checked ? 1 : value.copies })}
          className="mt-1 h-5 w-5 shrink-0 accent-[var(--magenta)]"
        />
        <span>
          <span className="block font-semibold">Doble cara manual</span>
          <span className="block text-sm text-muted">
            La impressora no gira els fulls sola. Primer imprimeix les senars, després et diré com tornar-los a posar. Només una còpia.
          </span>
        </span>
      </label>
    </div>
  )
}
