import L from 'leaflet'
import { useEffect } from 'react'
import { MapContainer, TileLayer, Marker, ZoomControl, useMap } from 'react-leaflet'
import { SCHIPHOL, regKey } from '../lib/adsb.js'

const PLANE = 'M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z'
const icons = new Map()

// Icons are cached per 5° heading + colour so 5-second refreshes don't rebuild hundreds of DOM icons.
function planeIcon(track, color) {
  const deg = Math.round((track ?? 0) / 5) * 5
  const key = `${deg}|${color}`
  if (!icons.has(key)) {
    icons.set(key, L.divIcon({
      className: 'plane-icon',
      iconSize: [26, 26],
      iconAnchor: [13, 13],
      html: `<svg viewBox="0 0 24 24" width="26" height="26" style="transform:rotate(${deg}deg)"><path d="${PLANE}" fill="${color}" stroke="#000" stroke-width="0.7"/></svg>`,
    }))
  }
  return icons.get(key)
}

function colorFor(ac, selected, hasPhotos) {
  if (selected) return '#f43f5e'
  if (hasPhotos) return '#22d3ee'
  return ac.onGround ? '#a1a1aa' : '#facc15'
}

// Pans to an aircraft found via the registration search.
function FlyTo({ focus }) {
  const map = useMap()
  useEffect(() => { if (focus) map.flyTo(focus.at, Math.max(map.getZoom(), 11)) }, [focus, map])
  return null
}

export default function FlightMap({ aircraft, selectedHex, photoRegs, onSelect, focus }) {
  return (
    <MapContainer center={SCHIPHOL} zoom={10} zoomControl={false} className="h-full w-full">
      <TileLayer
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · data <a href="https://adsb.fi">adsb.fi</a>'
        maxZoom={18}
      />
      <ZoomControl position="bottomleft" />
      <FlyTo focus={focus} />
      {aircraft.map((ac) => {
        const selected = ac.hex === selectedHex
        return (
          <Marker
            key={ac.hex}
            position={[ac.lat, ac.lon]}
            icon={planeIcon(ac.track, colorFor(ac, selected, photoRegs.has(regKey(ac.reg))))}
            title={ac.callsign ?? ac.reg ?? ac.hex}
            zIndexOffset={selected ? 1000 : 0}
            eventHandlers={{ click: () => onSelect(ac) }}
          />
        )
      })}
    </MapContainer>
  )
}
