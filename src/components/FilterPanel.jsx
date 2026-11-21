import { AIRLINES, MAX_ALT, airline } from '../lib/adsb.js'

const startOpen = window.matchMedia('(min-width: 768px)').matches
const ft = (n) => `${n.toLocaleString('nl-NL')} ft`

export default function FilterPanel({ filters, setFilters, aircraft }) {
  const set = (patch) => setFilters((f) => ({ ...f, ...patch }))

  const counts = {}
  for (const ac of aircraft) {
    const code = airline(ac.callsign)
    if (code) counts[code] = (counts[code] ?? 0) + 1
  }
  for (const code of filters.airlines) counts[code] ??= 0 // keep selected chips even when absent
  const codes = Object.keys(counts).sort((a, b) => counts[b] - counts[a] || a.localeCompare(b))
  const toggle = (code) =>
    set({ airlines: filters.airlines.includes(code) ? filters.airlines.filter((c) => c !== code) : [...filters.airlines, code] })

  return (
    <details open={startOpen} className="rounded-lg border border-zinc-800 bg-zinc-900/95 text-sm shadow-xl backdrop-blur">
      <summary className="cursor-pointer select-none px-4 py-2 font-semibold">Filters</summary>
      <div className="space-y-4 px-4 pb-4">
        <fieldset className="space-y-2">
          <legend className="mb-1 text-zinc-400">Hoogte</legend>
          <label className="block">
            <span className="flex justify-between"><span>Min</span><span className="tabular-nums">{ft(filters.minAlt)}</span></span>
            <input type="range" min={0} max={MAX_ALT} step={500} value={filters.minAlt} className="w-full accent-amber-400"
              onChange={(e) => set({ minAlt: Math.min(+e.target.value, filters.maxAlt) })} />
          </label>
          <label className="block">
            <span className="flex justify-between"><span>Max</span><span className="tabular-nums">{filters.maxAlt === MAX_ALT ? 'geen limiet' : ft(filters.maxAlt)}</span></span>
            <input type="range" min={0} max={MAX_ALT} step={500} value={filters.maxAlt} className="w-full accent-amber-400"
              onChange={(e) => set({ maxAlt: Math.max(+e.target.value, filters.minAlt) })} />
          </label>
        </fieldset>

        <label className="flex items-start gap-2">
          <input type="checkbox" checked={filters.phaseOnly} className="mt-1 accent-amber-400"
            onChange={(e) => set({ phaseOnly: e.target.checked })} />
          <span>
            Alleen landend / startend
            <span className="block text-xs text-zinc-400">Binnen 20 NM van EHAM, onder 6.000 ft, stijgend of dalend ≥ 300 ft/min</span>
          </span>
        </label>

        <fieldset>
          <legend className="mb-2 flex w-full justify-between text-zinc-400">
            <span>Airlines</span>
            {filters.airlines.length > 0 && (
              <button type="button" className="text-amber-400 hover:underline" onClick={() => set({ airlines: [] })}>wis</button>
            )}
          </legend>
          <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
            {codes.length === 0 && <span className="text-zinc-500">Nog geen data</span>}
            {codes.map((code) => (
              <button key={code} type="button" title={AIRLINES[code] ?? code} aria-pressed={filters.airlines.includes(code)}
                onClick={() => toggle(code)}
                className={`rounded-full border px-2 py-0.5 text-xs ${filters.airlines.includes(code) ? 'border-amber-400 bg-amber-400 text-zinc-950' : 'border-zinc-700 hover:border-zinc-500'}`}>
                {AIRLINES[code] ?? code} <span className="opacity-60">{counts[code]}</span>
              </button>
            ))}
          </div>
        </fieldset>
      </div>
    </details>
  )
}
