import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer, allowed } from './index.js'

async function withServer(opts, fn) {
  const server = createServer(opts).listen(0)
  await new Promise((r) => server.once('listening', r))
  try {
    await fn(`http://127.0.0.1:${server.address().port}`)
  } finally {
    server.close()
  }
}

const path = '/api/v2/lat/52.3105/lon/4.7683/dist/60'

test('proxies allowed paths, caches and coalesces upstream calls', async () => {
  let calls = 0
  const fetchImpl = async () => { calls++; return new Response('{"aircraft":[]}', { status: 200 }) }
  await withServer({ origins: ['https://a.example'], fetchImpl }, async (base) => {
    const [r1, r2] = await Promise.all([1, 2].map(() => fetch(base + path, { headers: { origin: 'https://a.example' } })))
    assert.equal(r1.status, 200)
    assert.equal(await r2.text(), '{"aircraft":[]}')
    assert.equal(r1.headers.get('access-control-allow-origin'), 'https://a.example')
    assert.equal(calls, 1, 'concurrent and cached requests share one upstream call')
    const other = await fetch(base + path, { headers: { origin: 'https://evil.example' } })
    assert.equal(other.headers.get('access-control-allow-origin'), null)
  })
})

test('allows point queries anywhere and registration lookups, nothing else', () => {
  for (const p of [path, '/api/v2/lat/52.5/lon/5/dist/75', '/api/v2/lat/-34/lon/151.5/dist/250', '/api/v2/lat/0/lon/-170/dist/1',
    '/api/v2/registration/PH-BXA', '/api/v2/registration/CNMAY,C-NMAY,CN-MAY']) assert.ok(allowed(p), p)
  const tooMany = Array.from({ length: 151 }, (_, i) => 'PH-' + i).join(',')
  for (const p of ['/api/v2/lat/52.5/lon/5/dist/251', '/api/v2/lat/52.5/lon/5/dist/0', '/api/v2/lat/abc/lon/5/dist/60',
    '/api/v2/registration/ph-bxa', '/api/v2/registration/PH BXA', '/api/v2/registration/' + tooMany, '/api/v2/hex/abc']) assert.ok(!allowed(p), p)
})

test('rejects anything that is not an allowed query', async () => {
  await withServer({ fetchImpl: async () => assert.fail('must not call upstream') }, async (base) => {
    for (const p of ['/', '/api/v2/hex/abc', '/api/v2/lat/52.5/lon/5/dist/251', '/api/v2/sqk/7700']) {
      assert.equal((await fetch(base + p)).status, 404, p)
    }
    assert.equal((await fetch(base + '/health')).status, 200)
  })
})

test('serves last good data briefly when upstream fails, then passes the error on', async () => {
  let status = 200
  const fetchImpl = async () => new Response(status === 200 ? '{"aircraft":[1]}' : '', { status })
  await withServer({ fetchImpl, cacheMs: 0, staleMs: 300, gapMs: 0 }, async (base) => {
    assert.equal(await (await fetch(base + path)).text(), '{"aircraft":[1]}')
    status = 429
    const stale = await fetch(base + path)
    assert.equal(stale.status, 200)
    assert.equal(await stale.text(), '{"aircraft":[1]}')
    await new Promise((r) => setTimeout(r, 350))
    assert.equal((await fetch(base + path)).status, 429, 'no frozen map after the stale window')
    status = 200
    assert.equal((await fetch(base + path)).status, 200, 'recovers')
  })
})

test('spaces upstream calls and answers 429 when the queue is too long', async () => {
  const times = []
  const fetchImpl = async () => { times.push(Date.now()); return new Response('{"aircraft":[]}', { status: 200 }) }
  await withServer({ fetchImpl, gapMs: 100, maxWaitMs: 250 }, async (base) => {
    const paths = [1, 2, 3, 4].map((i) => `/api/v2/lat/${i}/lon/0/dist/50`)
    const statuses = await Promise.all(paths.map((p) => fetch(base + p).then((r) => r.status)))
    assert.deepEqual(statuses, [200, 200, 200, 429], 'fourth caller would wait 300 ms > 250 ms')
    for (let i = 1; i < times.length; i++) assert.ok(times[i] - times[i - 1] >= 90, 'upstream calls at least gapMs apart')
  })
})
