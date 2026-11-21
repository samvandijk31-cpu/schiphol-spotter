export const SCHIPHOL = [52.3105, 4.7683]
export const MAX_RADIUS_NM = 250 // largest radius ADSB.fi answers for one point query
export const REFRESH_MS = 5000
export const MAX_ALT = 50000
export const MAX_PHOTO_REGS = 50 // shortcut: one registration query per poll; chunk it when someone has more

// Dev: same-origin '/adsb' via the Vite proxy. Production: VITE_ADSB_BASE = URL of server/index.js.
const BASE = import.meta.env?.VITE_ADSB_BASE || '/adsb'

async function get(path, signal) {
  const res = await fetch(`${BASE}/api/v2/${path}`, { signal })
  if (!res.ok) throw new Error(res.status === 429 ? 'te veel verzoeken (429)' : `HTTP ${res.status}`)
  const data = await res.json()
  return (data.aircraft ?? data.ac ?? []).map(normalize).filter(Boolean)
}

// Aircraft around a map view anywhere in the world.
export const fetchArea = ({ lat, lon, dist }, signal) => get(`lat/${lat}/lon/${lon}/dist/${dist}`, signal)

// Aircraft with these registrations, wherever they are.
export const fetchRegs = (regs, signal) => (regs.length ? get(`registration/${regs.join(',')}`, signal) : Promise.resolve([]))

// Point query for a map view: centre rounded to 0.5° (shared cache on the server), radius covering the view
// plus the rounding error, capped at what ADSB.fi allows. `limited` = the view is larger than one query covers.
export function areaQuery(center, viewRadiusNm) {
  const lat = Math.round(center[0] * 2) / 2
  const lon = Math.round((((center[1] + 540) % 360) - 180) * 2) / 2
  const want = Math.ceil((viewRadiusNm + 25) / 25) * 25
  return { lat, lon, dist: Math.min(MAX_RADIUS_NM, want), limited: want > MAX_RADIUS_NM }
}

// ADS-B needs the hyphen ("CN-MAY"), but photos may be stored as typed ("CNMAY"): also try the usual hyphen spots.
export function regCandidates(reg) {
  const r = (reg ?? '').toUpperCase().replace(/\s+/g, '')
  if (r.includes('-') || r.length < 3) return [r]
  return [r, `${r.slice(0, 1)}-${r.slice(1)}`, `${r.slice(0, 2)}-${r.slice(2)}`]
}

// Great-circle distance in NM.
export function distNm([lat1, lon1], [lat2, lon2]) {
  const r = Math.PI / 180
  const h = Math.sin(((lat2 - lat1) * r) / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2
  return 2 * 3440.065 * Math.asin(Math.sqrt(h))
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
    dist: distNm(SCHIPHOL, [a.lat, a.lon]), // to EHAM; ADSB.fi's dst is relative to the query point, which now moves
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

export const DEFAULT_FILTERS = { minAlt: 0, maxAlt: MAX_ALT, phaseOnly: false, airlines: [], photosOnly: false }

export function matches(ac, f, photoKeys) {
  if (f.photosOnly && !photoKeys?.has(regKey(ac.reg))) return false
  // EHAM lies below sea level, so taxiing/landing traffic reports e.g. -75 ft; min 0 must not hide it.
  if (ac.alt != null && ((f.minAlt > 0 && ac.alt < f.minAlt) || ac.alt > f.maxAlt)) return false
  if (f.phaseOnly && !phase(ac)) return false
  if (f.airlines.length && !f.airlines.includes(airline(ac.callsign))) return false
  return true
}
