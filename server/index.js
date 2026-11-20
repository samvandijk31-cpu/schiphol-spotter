// CORS proxy + short cache in front of opendata.adsb.fi (which sends no CORS headers).
// No dependencies: runs on any Node >= 18 host, e.g. the Pterodactyl "node.js generic" egg.
import http from 'node:http'
import { pathToFileURL } from 'node:url'

const UPSTREAM = 'https://opendata.adsb.fi'
const CACHE_MS = 2000 // all visitors share one upstream call per 2 s; adsb.fi allows ~1 req/s per IP
const STALE_MS = 30000 // on upstream errors keep serving the last good data this long, then report the error
// Only the exact query the frontend sends (src/lib/adsb.js), so nobody can use this host to burn the adsb.fi rate limit.
const ALLOWED = new Set(['/api/v2/lat/52.3105/lon/4.7683/dist/60'])

export function createServer({ origins = ['*'], fetchImpl = fetch, cacheMs = CACHE_MS, staleMs = STALE_MS } = {}) {
  const cache = new Map() // path -> { at, status, body, pending }

  async function load(path) {
    const hit = cache.get(path)
    if (hit?.pending) return hit.pending
    if (hit && Date.now() - hit.at < cacheMs) return hit
    const pending = fetchImpl(UPSTREAM + path, { signal: AbortSignal.timeout(8000) })
      .then(async (res) => ({ status: res.status, body: await res.text() }))
      .catch((err) => ({ status: 502, body: JSON.stringify({ error: err.message }) }))
      .then((fresh) => {
        const now = Date.now()
        const stale = fresh.status !== 200 && hit?.status === 200 && now - hit.goodAt < staleMs
        const entry = stale ? { ...hit, at: now, pending: undefined } : { ...fresh, at: now, goodAt: now }
        cache.set(path, entry)
        return entry
      })
    cache.set(path, { ...hit, pending })
    return pending
  }

  return http.createServer(async (req, res) => {
    const origin = req.headers.origin
    const allowOrigin = origins.includes('*') ? '*' : origins.includes(origin) ? origin : null
    const headers = { 'content-type': 'application/json', 'cache-control': 'no-store', vary: 'Origin' }
    if (allowOrigin) headers['access-control-allow-origin'] = allowOrigin

    const path = new URL(req.url, 'http://x').pathname
    if (req.method === 'OPTIONS') return res.writeHead(204, { ...headers, 'access-control-allow-methods': 'GET' }).end()
    if (path === '/health') return res.writeHead(200, headers).end('{"ok":true}')
    if (req.method !== 'GET' || !ALLOWED.has(path)) return res.writeHead(404, headers).end('{"error":"not found"}')

    const { status, body } = await load(path)
    res.writeHead(status, headers).end(body)
  })
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.SERVER_PORT || process.env.PORT || 8787) // SERVER_PORT is set by Pterodactyl
  const origins = (process.env.ALLOWED_ORIGINS || '*').split(',').map((s) => s.trim())
  createServer({ origins }).listen(port, '0.0.0.0', () => console.log(`adsb proxy on :${port}, origins: ${origins.join(', ')}`))
}
