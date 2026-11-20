// CORS proxy + short cache in front of opendata.adsb.fi (which sends no CORS headers).
// No dependencies: runs on any Node >= 18 host, e.g. the Pterodactyl "node.js generic" egg.
import http from 'node:http'
import { pathToFileURL } from 'node:url'

const UPSTREAM = 'https://opendata.adsb.fi'
const CACHE_MS = 2000 // all visitors share one upstream call per 2 s; adsb.fi allows ~1 req/s per IP
const ALLOWED = /^\/api\/v2\/lat\/-?\d+(\.\d+)?\/lon\/-?\d+(\.\d+)?\/dist\/\d{1,3}$/

export function createServer({ origins = ['*'], fetchImpl = fetch } = {}) {
  const cache = new Map() // path -> { at, status, body, pending }

  async function load(path) {
    const hit = cache.get(path)
    if (hit?.pending) return hit.pending
    if (hit && Date.now() - hit.at < CACHE_MS) return hit
    const pending = fetchImpl(UPSTREAM + path, { signal: AbortSignal.timeout(8000) })
      .then(async (res) => ({ at: Date.now(), status: res.status, body: await res.text() }))
      .then((fresh) => {
        // On upstream errors (e.g. 429) keep serving the last good answer instead of failing the map.
        const entry = fresh.status !== 200 && hit?.status === 200 ? { ...hit, at: Date.now() } : fresh
        cache.set(path, entry)
        return entry
      })
      .catch((err) => {
        cache.set(path, hit ?? { at: 0, status: 502, body: JSON.stringify({ error: err.message }) })
        return cache.get(path)
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
    if (req.method !== 'GET' || !ALLOWED.test(path)) return res.writeHead(404, headers).end('{"error":"not found"}')

    const { status, body } = await load(path)
    res.writeHead(status, headers).end(body)
  })
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.SERVER_PORT || process.env.PORT || 8787) // SERVER_PORT is set by Pterodactyl
  const origins = (process.env.ALLOWED_ORIGINS || '*').split(',').map((s) => s.trim())
  createServer({ origins }).listen(port, '0.0.0.0', () => console.log(`adsb proxy on :${port}, origins: ${origins.join(', ')}`))
}
