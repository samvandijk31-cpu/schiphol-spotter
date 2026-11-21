// CORS proxy + short cache in front of opendata.adsb.fi (which sends no CORS headers).
// No dependencies: runs on any Node >= 18 host, e.g. the Pterodactyl "node.js generic" egg.
import http from 'node:http'
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const UPSTREAM = 'https://opendata.adsb.fi'
const CLOUDFLARED_VERSION = '2026.11.1'
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

  // Optional Cloudflare Tunnel: HTTPS without port forwarding. Put the tunnel token in .tunnel-token (or TUNNEL_TOKEN).
  const token = process.env.TUNNEL_TOKEN || (existsSync('.tunnel-token') && readFileSync('.tunnel-token', 'utf8').trim())
  if (token) startTunnel(token).catch((err) => { console.error('tunnel failed:', err.message); process.exit(1) })
}

async function startTunnel(token) {
  const name = { 'win32-x64': 'windows-amd64.exe', 'linux-x64': 'linux-amd64', 'linux-arm64': 'linux-arm64' }[`${process.platform}-${process.arch}`]
  if (!name) throw new Error(`no cloudflared build for ${process.platform}-${process.arch}`)
  const bin = `./cloudflared-${name}`
  if (!existsSync(bin)) {
    console.log('downloading cloudflared…')
    // Pinned release (no silent upgrades of a binary we execute); bump CLOUDFLARED_VERSION deliberately.
    const res = await fetch(`https://github.com/cloudflare/cloudflared/releases/download/${CLOUDFLARED_VERSION}/cloudflared-${name}`)
    if (!res.ok) throw new Error(`cloudflared download: HTTP ${res.status}`)
    writeFileSync(bin, Buffer.from(await res.arrayBuffer()), { mode: 0o755 })
  }
  const child = spawn(bin, ['tunnel', '--no-autoupdate', 'run'], { env: { ...process.env, TUNNEL_TOKEN: token }, stdio: 'inherit' })
  // Without the tunnel the site is unreachable, so let the host's crash detection restart everything.
  child.on('exit', (code) => { console.error(`cloudflared exited (${code})`); process.exit(1) })
}
