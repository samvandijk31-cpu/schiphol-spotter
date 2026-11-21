import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import FlightMap from './components/FlightMap.jsx'
import FilterPanel from './components/FilterPanel.jsx'
import Sidebar from './components/Sidebar.jsx'
import RegSearch from './components/RegSearch.jsx'
import {
  DEFAULT_FILTERS, MAX_PHOTO_REGS, REFRESH_MS, SCHIPHOL, areaQuery, fetchArea, fetchRegs, matches, regCandidates, regKey,
} from './lib/adsb.js'
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
  const [view, setView] = useState({ center: SCHIPHOL, radiusNm: 40 })
  const [focus, setFocus] = useState(null)

  useEffect(() => localStorage.setItem('filters', JSON.stringify(filters)), [filters])

  const refreshPhotoRegs = useCallback(() => photoRegs().then(setRegsWithPhotos, console.error), [])
  useEffect(() => { refreshPhotoRegs() }, [refreshPhotoRegs])

  // What to poll: the map view, or (photo filter) all photographed registrations worldwide.
  const query = useMemo(() => (filters.photosOnly
    ? { regs: [...new Set([...regsWithPhotos.values()].slice(0, MAX_PHOTO_REGS).flatMap(regCandidates))] }
    : { area: areaQuery(view.center, view.radiusNm) }), [filters.photosOnly, regsWithPhotos, view])
  const queryRef = useRef(query)
  const kickRef = useRef(() => {})
  const fitNextRef = useRef(false)

  // setTimeout chain instead of setInterval: never two requests in flight; failures keep the last data.
  useEffect(() => {
    let timer
    let ctrl
    let stopped = false
    let busy = false
    let again = false
    async function tick() {
      if (busy) { again = true; return }
      busy = true
      clearTimeout(timer)
      ctrl = new AbortController()
      const q = queryRef.current
      try {
        const list = q.regs ? await fetchRegs(q.regs, ctrl.signal) : await fetchArea(q.area, ctrl.signal)
        if (q === queryRef.current) { // ignore answers for a view the user already left
          setAircraft(list)
          setSelected((s) => {
            if (!s) return s
            // Searched by registration: switch to live data once that aircraft shows up.
            if (s.offline) return list.find((a) => a.reg && regKey(a.reg) === regKey(s.reg)) ?? s
            return list.find((a) => a.hex === s.hex) ?? { ...s, lost: true }
          })
          if (q.regs && fitNextRef.current && list.length) {
            fitNextRef.current = false
            setFocus({ bounds: list.map((a) => [a.lat, a.lon]) })
          }
          setStatus({ ok: true, at: new Date() })
        }
      } catch (e) {
        if (e.name === 'AbortError') return
        setStatus((s) => ({ ...s, ok: false, error: e.message }))
      }
      busy = false
      if (!stopped) timer = setTimeout(tick, again ? 300 : REFRESH_MS)
      again = false
    }
    kickRef.current = () => { clearTimeout(timer); timer = setTimeout(tick, 400) } // debounce map drags
    tick()
    return () => {
      stopped = true
      clearTimeout(timer)
      ctrl.abort()
    }
  }, [])

  // New view or filter mode: poll right away instead of waiting for the next 5 s tick.
  useEffect(() => {
    const changed = JSON.stringify(queryRef.current) !== JSON.stringify(query)
    queryRef.current = query
    if (changed) kickRef.current()
  }, [query])
  useEffect(() => { if (filters.photosOnly) fitNextRef.current = true }, [filters.photosOnly])

  const visible = useMemo(() => aircraft.filter((a) => matches(a, filters, regsWithPhotos)), [aircraft, filters, regsWithPhotos])

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

  function search(ac) {
    setSelected(ac)
    if (!ac.offline) setFocus({ at: [ac.lat, ac.lon] }) // new object each time, so repeated searches pan again
  }

  const limited = !filters.photosOnly && query.area.limited
  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-zinc-800 bg-zinc-950 px-4 py-2">
        <h1 className="font-bold tracking-tight">✈ Schiphol Spotter</h1>
        <p className="text-right text-xs text-zinc-400" aria-live="polite">
          {filters.photosOnly
            ? <><span className="tabular-nums">{visible.length}</span> van je {regsWithPhotos.size} gefotografeerde toestellen live</>
            : <><span className="tabular-nums">{visible.length}/{aircraft.length}</span> vliegtuigen</>}
          {status.at && <> · {status.at.toLocaleTimeString('nl-NL')}</>}
          {limited && <span className="block text-amber-400">Uitgezoomd: alleen binnen de cirkel; zoom in voor alles in beeld</span>}
          {!status.ok && (
            <span className="block text-rose-400">Verbindingsfout: {status.error}, nieuwe poging over {REFRESH_MS / 1000}s</span>
          )}
        </p>
      </header>
      <main className="relative flex-1">
        <FlightMap aircraft={visible} selected={selected} route={route} photoRegs={regsWithPhotos} onSelect={setSelected}
          focus={focus} onView={setView} coverage={limited ? query.area : null} />
        <div className="absolute top-3 left-3 z-[1000] w-72 max-w-[calc(100vw-1.5rem)] space-y-2">
          <RegSearch aircraft={aircraft} photoRegs={regsWithPhotos} onSearch={search} />
          <FilterPanel filters={filters} setFilters={setFilters} aircraft={aircraft} photoCount={regsWithPhotos.size} />
        </div>
        {selected && <Sidebar ac={selected} route={route} onClose={() => setSelected(null)} onPhotosChange={refreshPhotoRegs} />}
      </main>
    </div>
  )
}
