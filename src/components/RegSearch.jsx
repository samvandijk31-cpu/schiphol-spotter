import { useState } from 'react'
import { regKey } from '../lib/adsb.js'

// Search a registration to open its photos, also when that aircraft is not on the map right now.
export default function RegSearch({ aircraft, photoRegs, onSearch }) {
  const [q, setQ] = useState('')
  const [error, setError] = useState(null)

  function submit(e) {
    e.preventDefault()
    const key = regKey(q)
    if (!/^[A-Z0-9]{2,8}$/.test(key)) return setError('Vul een registratie in, bijv. PH-BXA')
    // Photos are stored by regKey, so any spelling works; show the best-known one:
    // live ADS-B, else a typed hyphenated form, else the stored spelling, else what was typed.
    const live = aircraft.find((a) => regKey(a.reg) === key)
    const typed = q.trim().toUpperCase().replace(/\s+/g, '')
    const reg = live?.reg ?? (typed.includes('-') ? typed : photoRegs.get(key) ?? typed)
    onSearch(live ?? { reg, offline: true })
    setQ('')
    setError(null)
  }

  const suggestions = [...new Set([...aircraft.map((a) => a.reg).filter(Boolean), ...photoRegs.values()])].sort()

  return (
    <form role="search" onSubmit={submit} className="rounded-lg border border-zinc-800 bg-zinc-900/95 p-2 shadow-xl backdrop-blur">
      <div className="flex gap-2">
        <input type="search" value={q} onChange={(e) => { setQ(e.target.value); setError(null) }} list="known-regs"
          placeholder="Registratie, bijv. PH-BXA" aria-label="Zoek registratie" aria-invalid={!!error} maxLength={12}
          autoCapitalize="characters" autoComplete="off" spellCheck={false}
          className="min-w-0 flex-1 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm uppercase placeholder:normal-case placeholder:text-zinc-500 focus:border-amber-400 focus:outline-none" />
        <button type="submit" className="rounded-md bg-amber-400 px-3 text-sm font-semibold text-zinc-950 hover:bg-amber-300">Zoek</button>
      </div>
      {error && <p role="alert" className="mt-1 text-xs text-rose-400">{error}</p>}
      <datalist id="known-regs">
        {suggestions.map((r) => <option key={r} value={r} />)}
      </datalist>
    </form>
  )
}
