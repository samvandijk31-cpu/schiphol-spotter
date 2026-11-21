import test from 'node:test'
import assert from 'node:assert/strict'
import { greatCircle, project, toRoute } from './route.js'

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`)

test('greatCircle starts and ends at the given points', () => {
  const pts = greatCircle([52.3, 4.76], [40.64, -73.78]) // AMS -> JFK
  assert.equal(pts.length, 65)
  close(pts[0][0], 52.3); close(pts[0][1], 4.76)
  close(pts.at(-1)[0], 40.64); close(pts.at(-1)[1], -73.78)
  assert.ok(Math.max(...pts.map((p) => p[0])) > 52.3, 'AMS-JFK arcs north of both ends')
})

test('greatCircle keeps longitudes continuous across the date line', () => {
  const pts = greatCircle([35.5, 139.8], [37.6, -122.4]) // Tokyo -> San Francisco
  for (let i = 1; i < pts.length; i++) assert.ok(Math.abs(pts[i][1] - pts[i - 1][1]) < 20)
})

test('project moves along the bearing', () => {
  const [lat, lon] = project([52, 4], 0, 60) // 60 NM north ≈ 1°
  close(lat, 53, 0.01); close(lon, 4)
  const [, lonE] = project([0, 0], 90, 60)
  close(lonE, 1, 0.01)
})

test('toRoute maps adsbdb data and ignores unknown routes', () => {
  assert.equal(toRoute(undefined), null)
  const r = toRoute({ origin: { iata_code: 'BIO', icao_code: 'LEBB', name: 'Bilbao Airport', municipality: 'Bilbao', latitude: 43.3, longitude: -2.9 },
    destination: { iata_code: 'AMS', icao_code: 'EHAM', name: 'Amsterdam Airport Schiphol', municipality: 'Amsterdam', latitude: 52.3, longitude: 4.76 } })
  assert.equal(r.destination.iata, 'AMS')
  assert.deepEqual(r.origin.at, [43.3, -2.9])
})
