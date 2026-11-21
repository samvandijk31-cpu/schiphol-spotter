import { useCallback, useEffect, useMemo, useState } from 'react'
import FlightMap from './components/FlightMap.jsx'
import FilterPanel from './components/FilterPanel.jsx'
import Sidebar from './components/Sidebar.jsx'
import RegSearch from './components/RegSearch.jsx'
import { DEFAULT_FILTERS, REFRESH_MS, fetchAircraft, matches, regKey } from './lib/adsb.js'
import { photoRegs } from './lib/photos.js'
import { fetchRoute } from './lib/route.js'

function loadFilters() {
  try {
    return { ...DEFAULT_FILTERS, ...JSON.parse(localStorage.getItem('filters')) }
  } catch {
    return DEFAULT_FILTERS
  }
}

export default function App() {
  const [aircraft, setAircraft] = useState([])
  const [status, setStatus] = useState({ ok: true, at: null })
  const [selected, setSelected] = useState(null)
  const [filters, setFilters] = useState(loadFilters)
  const [regsWithPhotos, setRegsWithPhotos] = useState(new Map())

  useEffect(() => localStorage.setItem('filters', JSON.stringify(filters)), [filters])

  const refreshPhotoRegs = useCallback(() => photoRegs().then(setRegsWithPhotos, console.error), [])
  useEffect(() => { refreshPhotoRegs() }, [refreshPhotoRegs])

  // setTimeout chain instead of setInterval: never two requests in flight; failures keep the last data.
  useEffect(() => {
    let timer
    let ctrl
    let stopped = false
    async function tick() {
      ctrl = new AbortController()
      try {
        const list = await fetchAircraft(ctrl.signal)
        setAircraft(list)
        setSelected((s) => {
          if (!s) return s
          // Searched by registration: switch to live data once that aircraft shows up on the radar.
          if (s.offline) return list.find((a) => a.reg && regKey(a.reg) === regKey(s.reg)) ?? s
          return list.find((a) => a.hex === s.hex) ?? { ...s, lost: true }
        })
        setStatus({ ok: true, at: new Date() })
      } catch (e) {
        if (e.name === 'AbortError') return
        setStatus((s) => ({ ...s, ok: false, error: e.message }))
      }
      if (!stopped) timer = setTimeout(tick, REFRESH_MS)
    }
    tick()
    return () => {
      stopped = true
      clearTimeout(timer)
      ctrl.abort()
    }
  }, [])

  const visible = useMemo(() => aircraft.filter((a) => matches(a, filters)), [aircraft, filters])

  // Route of the selected flight: undefined = loading, null = unknown.
  const [route, setRoute] = useState(null)
  const callsign = selected?.offline ? null : selected?.callsign
  useEffect(() => {
    setRoute(callsign ? undefined : null)
    if (!callsign) return
    let current = true
    fetchRoute(callsign).then((r) => current && setRoute(r))
    return () => { current = false }
  }, [callsign])

  const [focus, setFocus] = useState(null)
  function search(ac) {
    setSelected(ac)
    if (!ac.offline) setFocus({ at: [ac.lat, ac.lon] }) // new object each time, so repeated searches pan again
  }

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-zinc-800 bg-zinc-950 px-4 py-2">
        <h1 className="font-bold tracking-tight">✈ Schiphol Spotter</h1>
        <p className="text-right text-xs text-zinc-400" aria-live="polite">
          <span className="tabular-nums">{visible.length}/{aircraft.length}</span> vliegtuigen
          {status.at && <> · {status.at.toLocaleTimeString('nl-NL')}</>}
          {!status.ok && (
            <span className="block text-rose-400">Verbindingsfout: {status.error}, nieuwe poging over {REFRESH_MS / 1000}s</span>
          )}
        </p>
      </header>
      <main className="relative flex-1">
        <FlightMap aircraft={visible} selected={selected} route={route} photoRegs={regsWithPhotos} onSelect={setSelected} focus={focus} />
        <div className="absolute top-3 left-3 z-[1000] w-72 max-w-[calc(100vw-1.5rem)] space-y-2">
          <RegSearch aircraft={aircraft} photoRegs={regsWithPhotos} onSearch={search} />
          <FilterPanel filters={filters} setFilters={setFilters} aircraft={aircraft} />
        </div>
        {selected && <Sidebar ac={selected} route={route} onClose={() => setSelected(null)} onPhotosChange={refreshPhotoRegs} />}
      </main>
    </div>
  )
}
