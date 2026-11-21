import test from 'node:test'
import assert from 'node:assert/strict'
import { normalize, airline, phase, matches, regKey, DEFAULT_FILTERS } from './adsb.js'

test('regKey ignores case, spaces and hyphens', () => {
  for (const s of ['PH-BXA', 'ph-bxa', 'PHBXA', ' ph bxa ']) assert.equal(regKey(s), 'PHBXA')
  assert.equal(regKey('CN-MAY'), regKey('cnmay'))
  assert.equal(regKey(null), '')
})

test('normalize handles ground, padding and missing fields', () => {
  assert.equal(normalize({ hex: 'abc' }), null)
  const a = normalize({ hex: 'abc', r: ' ph-bxa ', flight: 'KLM1234 ', alt_baro: 'ground', lat: 52, lon: 4 })
  assert.equal(a.reg, 'PH-BXA')
  assert.equal(a.callsign, 'KLM1234')
  assert.equal(a.alt, 0)
  assert.equal(a.onGround, true)
  const b = normalize({ hex: 'def', flight: '        ', true_heading: 90, geom_rate: -640, lat: 52, lon: 4 })
  assert.equal(b.reg, null)
  assert.equal(b.callsign, null)
  assert.equal(b.track, 90)
  assert.equal(b.vrate, -640)
})

test('airline prefix only for ICAO callsigns', () => {
  assert.equal(airline('KLM1234'), 'KLM')
  assert.equal(airline('TRA9Q'), 'TRA')
  assert.equal(airline('PHABC'), null)
  assert.equal(airline(null), null)
})

test('phase heuristic', () => {
  const base = { onGround: false, alt: 2000, dist: 8 }
  assert.equal(phase({ ...base, vrate: -800 }), 'landing')
  assert.equal(phase({ ...base, vrate: 2500 }), 'takeoff')
  assert.equal(phase({ ...base, vrate: 0 }), null)
  assert.equal(phase({ ...base, vrate: -800, dist: 40 }), null)
  assert.equal(phase({ ...base, vrate: -800, alt: 30000 }), null)
  assert.equal(phase({ onGround: true, alt: 0, dist: 1, vrate: 0 }), null)
})

test('filters', () => {
  const ac = { alt: 0, onGround: true, callsign: 'KLM12', vrate: 0, dist: 1 }
  assert.ok(matches(ac, DEFAULT_FILTERS), 'ground traffic visible by default')
  assert.ok(!matches(ac, { ...DEFAULT_FILTERS, minAlt: 1000 }))
  assert.ok(!matches(ac, { ...DEFAULT_FILTERS, phaseOnly: true }))
  assert.ok(matches(ac, { ...DEFAULT_FILTERS, airlines: ['KLM'] }))
  assert.ok(!matches(ac, { ...DEFAULT_FILTERS, airlines: ['TRA'] }))
  assert.ok(matches({ ...ac, alt: null }, { ...DEFAULT_FILTERS, minAlt: 1000 }), 'unknown altitude stays visible')
  assert.ok(matches({ ...ac, alt: -75, onGround: false }, DEFAULT_FILTERS), 'below-sea-level altitude at EHAM visible by default')
  assert.ok(!matches({ ...ac, alt: -75 }, { ...DEFAULT_FILTERS, minAlt: 500 }))
})
