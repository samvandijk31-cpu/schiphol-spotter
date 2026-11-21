export const SCHIPHOL = [52.3105, 4.7683]
export const RADIUS_NM = 60
export const REFRESH_MS = 5000
export const MAX_ALT = 50000

// Dev: same-origin '/adsb' via the Vite proxy. Production: VITE_ADSB_BASE = URL of server/index.js.
const BASE = import.meta.env?.VITE_ADSB_BASE || '/adsb'

export async function fetchAircraft(signal) {
  const res = await fetch(`${BASE}/api/v2/lat/${SCHIPHOL[0]}/lon/${SCHIPHOL[1]}/dist/${RADIUS_NM}`, { signal })
  if (!res.ok) throw new Error(res.status === 429 ? 'te veel verzoeken (429)' : `HTTP ${res.status}`)
  const data = await res.json()
  return (data.aircraft ?? data.ac ?? []).map(normalize).filter(Boolean)
}

// The one place where raw ADSB.fi fields are interpreted; any of them may be missing.
export function normalize(a) {
  if (a.lat == null || a.lon == null) return null
  const onGround = a.alt_baro === 'ground'
  return {
    hex: a.hex,
    reg: a.r?.trim().toUpperCase() || null,
    type: a.t ?? null,
    desc: a.desc ?? null,
    callsign: a.flight?.trim() || null,
    alt: onGround ? 0 : (a.alt_baro ?? a.alt_geom ?? null),
    onGround,
    speed: a.gs ?? null,
    track: a.track ?? a.true_heading ?? a.mag_heading ?? null,
    vrate: a.baro_rate ?? a.geom_rate ?? null,
    squawk: a.squawk ?? null,
    dist: a.dst ?? null, // NM from the query point, i.e. Schiphol
    lat: a.lat,
    lon: a.lon,
  }
}

// Spelling-independent registration key: "ph bxa", "phbxa" and "PH-BXA" all become "PHBXA".
export const regKey = (reg) => (reg ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')

// ICAO airline prefix only for "ABC123"-style callsigns; registration callsigns (PHABC) have none.
export const airline = (callsign) => /^([A-Z]{3})\d/.exec(callsign ?? '')?.[1] ?? null

// shortcut: hand-picked list of carriers common at EHAM, extend when unknown codes annoy you.
export const AIRLINES = {
  KLM: 'KLM', KLC: 'KLM Cityhopper', TRA: 'Transavia', MPH: 'Martinair', CND: 'Corendon Dutch',
  TFL: 'TUI fly NL', EZY: 'easyJet', EJU: 'easyJet Europe', RYR: 'Ryanair', VLG: 'Vueling',
  BAW: 'British Airways', DLH: 'Lufthansa', AFR: 'Air France', SAS: 'SAS', EWG: 'Eurowings',
  SWR: 'Swiss', AUA: 'Austrian', FIN: 'Finnair', IBE: 'Iberia', THY: 'Turkish Airlines',
  DAL: 'Delta', UAE: 'Emirates', CLH: 'Lufthansa CityLine', BEL: 'Brussels Airlines', RAM: 'Royal Air Maroc',
}

// Landing/takeoff heuristic: airborne, within 20 NM of EHAM, below 6000 ft, climbing/descending >= 300 ft/min.
export function phase(ac) {
  if (ac.onGround || ac.alt == null || ac.vrate == null || ac.dist == null) return null
  if (ac.dist > 20 || ac.alt > 6000 || Math.abs(ac.vrate) < 300) return null
  return ac.vrate < 0 ? 'landing' : 'takeoff'
}

export const DEFAULT_FILTERS = { minAlt: 0, maxAlt: MAX_ALT, phaseOnly: false, airlines: [] }

export function matches(ac, f) {
  // EHAM lies below sea level, so taxiing/landing traffic reports e.g. -75 ft; min 0 must not hide it.
  if (ac.alt != null && ((f.minAlt > 0 && ac.alt < f.minAlt) || ac.alt > f.maxAlt)) return false
  if (f.phaseOnly && !phase(ac)) return false
  if (f.airlines.length && !f.airlines.includes(airline(ac.callsign))) return false
  return true
}
