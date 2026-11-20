import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from './index.mjs'

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

test('rejects anything that is not the ADSB.fi point query', async () => {
  await withServer({ fetchImpl: async () => assert.fail('must not call upstream') }, async (base) => {
    for (const p of ['/', '/api/v2/hex/abc', '/api/v2/lat/1/lon/2/dist/60/../../x', '/api/v2/lat/a/lon/2/dist/60']) {
      assert.equal((await fetch(base + p)).status, 404, p)
    }
    assert.equal((await fetch(base + '/health')).status, 200)
  })
})

test('serves last good data when upstream rate-limits', async () => {
  let status = 200
  const fetchImpl = async () => new Response(status === 200 ? '{"aircraft":[1]}' : '', { status })
  await withServer({ fetchImpl }, async (base) => {
    assert.equal(await (await fetch(base + path)).text(), '{"aircraft":[1]}')
    status = 429
    await new Promise((r) => setTimeout(r, 2100))
    const res = await fetch(base + path)
    assert.equal(res.status, 200)
    assert.equal(await res.text(), '{"aircraft":[1]}')
  })
})
