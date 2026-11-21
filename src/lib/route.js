// Where an aircraft is going: route by callsign from adsbdb.com (free, CORS-enabled), plus geometry for the map line.
// shortcut: adsbdb routes come from a callsign database and can be outdated for a given flight; shown as "volgens adsbdb".

const cache = new Map() // callsign -> Promise<route|null>; routes don't change during a session

export function fetchRoute(callsign) {
  if (!cache.has(callsign)) {
    cache.set(callsign, fetch(`https://api.adsbdb.com/v0/callsign/${encodeURIComponent(callsign)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((j) => toRoute(j?.response?.flightroute))
      .catch(() => { cache.delete(callsign); return null })) // network error: allow a retry later
  }
  return cache.get(callsign)
}

const airport = (a) => a && { iata: a.iata_code, icao: a.icao_code, name: a.name, city: a.municipality, at: [a.latitude, a.longitude] }
export const toRoute = (r) => (r?.destination ? { origin: airport(r.origin), destination: airport(r.destination) } : null)

const RAD = Math.PI / 180
const EARTH_NM = 3440.065

// Points along the great circle from a to b ([lat, lon]), so long-haul lines curve like real routes.
export function greatCircle([lat1, lon1], [lat2, lon2], n = 64) {
  const [p1, l1, p2, l2] = [lat1 * RAD, lon1 * RAD, lat2 * RAD, lon2 * RAD]
  const d = 2 * Math.asin(Math.sqrt(Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin((l2 - l1) / 2) ** 2))
  if (d < 1e-9) return [[lat1, lon1], [lat2, lon2]]
  let prevLon = lon1
  return Array.from({ length: n + 1 }, (_, i) => {
    const f = i / n
    const A = Math.sin((1 - f) * d) / Math.sin(d)
    const B = Math.sin(f * d) / Math.sin(d)
    const x = A * Math.cos(p1) * Math.cos(l1) + B * Math.cos(p2) * Math.cos(l2)
    const y = A * Math.cos(p1) * Math.sin(l1) + B * Math.cos(p2) * Math.sin(l2)
    const z = A * Math.sin(p1) + B * Math.sin(p2)
    let lon = Math.atan2(y, x) / RAD
    lon += Math.round((prevLon - lon) / 360) * 360 // keep longitudes continuous across the date line
    prevLon = lon
    return [Math.atan2(z, Math.hypot(x, y)) / RAD, lon]
  })
}

// Point reached from [lat, lon] after distNm along bearing (degrees).
export function project([lat, lon], bearing, distNm) {
  const d = distNm / EARTH_NM
  const t = bearing * RAD
  const p1 = lat * RAD
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(t))
  const l2 = lon * RAD + Math.atan2(Math.sin(t) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2))
  return [p2 / RAD, l2 / RAD]
}
