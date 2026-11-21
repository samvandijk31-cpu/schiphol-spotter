import { AIRLINES, airline, phase, regKey } from '../lib/adsb.js'
import Photos from './Photos.jsx'

const nl = (n) => Math.round(n).toLocaleString('nl-NL')
const EMERGENCY = { 7500: 'kaping', 7600: 'radio-uitval', 7700: 'noodgeval' }

export default function Sidebar({ ac, onClose, onPhotosChange }) {
  const code = airline(ac.callsign)
  const p = phase(ac)
  const rows = [
    ['Registratie', ac.reg],
    ['Type', [ac.type, ac.desc].filter(Boolean).join(' · ')],
    ['Callsign', ac.callsign],
    ['Hoogte', ac.onGround ? 'Op de grond' : ac.alt != null && `${nl(ac.alt)} ft`],
    ['Snelheid', ac.speed != null && `${nl(ac.speed)} kts`],
    ['Vertical rate', ac.vrate != null && `${ac.vrate > 0 ? '▲ +' : ac.vrate < 0 ? '▼ ' : ''}${nl(ac.vrate)} ft/min`],
    ['Squawk', ac.squawk && (EMERGENCY[ac.squawk]
      ? <span className="font-bold text-rose-400">{ac.squawk} · {EMERGENCY[ac.squawk]}</span>
      : ac.squawk)],
    ['Koers', ac.track != null && `${nl(ac.track)}°`],
    ['Afstand EHAM', ac.dist != null && `${ac.dist.toFixed(1)} NM`],
    ['ICAO hex', ac.hex],
  ]

  return (
    <aside className="absolute inset-x-0 bottom-0 z-[1000] max-h-[65dvh] overflow-y-auto rounded-t-xl border-t border-zinc-800 bg-zinc-900 shadow-2xl md:inset-y-0 md:left-auto md:right-0 md:max-h-none md:w-96 md:rounded-none md:border-l md:border-t-0">
      <header className="sticky top-0 flex items-start justify-between gap-2 border-b border-zinc-800 bg-zinc-900 px-4 py-3">
        <div>
          <h2 className="text-xl font-bold">{ac.callsign ?? ac.reg ?? ac.hex}</h2>
          <p className="text-sm text-zinc-400">
            {[AIRLINES[code] ?? code, p === 'landing' ? 'landend' : p === 'takeoff' ? 'startend' : null].filter(Boolean).join(' · ')}
          </p>
          {ac.offline && <p className="mt-1 text-xs text-amber-400">Nu niet op de radar: je kunt wel foto's toevoegen</p>}
          {ac.lost && <p className="mt-1 text-xs text-amber-400">Niet meer in ontvangst: laatst bekende gegevens</p>}
        </div>
        <button type="button" onClick={onClose} aria-label="Sluiten"
          className="rounded p-1 text-2xl leading-none text-zinc-400 hover:bg-zinc-800 hover:text-white">×</button>
      </header>

      {!ac.offline && <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 px-4 py-3 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-zinc-400">{label}</dt>
            <dd className="tabular-nums">{value || '—'}</dd>
          </div>
        ))}
      </dl>}

      <section className="border-t border-zinc-800 px-4 py-3">
        <h3 className="mb-2 font-semibold">Mijn foto's</h3>
        {ac.reg ? (
          <Photos key={regKey(ac.reg)} reg={ac.reg} onChange={onPhotosChange} />
        ) : (
          <p className="text-sm text-zinc-500">Dit toestel zendt geen registratie uit; foto's worden per registratie opgeslagen.</p>
        )}
      </section>
    </aside>
  )
}
