# ✈ Schiphol Spotter

Open-source live flight tracker rond Schiphol (EHAM) met je **eigen spotterfoto's per registratie**.
Draait volledig in de browser: geen account, geen API-key; alleen een mini-proxy als backend.

- Live posities van [ADSB.fi](https://adsb.fi) (60 NM rond Schiphol, elke 5 s ververst)
- Kaart: Leaflet + OpenStreetMap (donker thema)
- Klik op een vliegtuig voor registratie, type, callsign, hoogte (ft), snelheid (kts), vertical rate en squawk
- Upload eigen foto's per registratie; ze worden opgeslagen in IndexedDB van je browser. Komt het toestel later terug, dan staan je foto's er weer. Toestellen waarvan je foto's hebt zijn **cyaan** op de kaart.
- Filters (bewaard in localStorage): hoogte min/max, alleen landend/startend, airlines

## Starten

```bash
npm install
npm run dev     # http://localhost:5173
npm test        # unit tests voor de data/filter-logica
npm run build   # statische build in dist/
```

## Waarom een backend?

`opendata.adsb.fi` stuurt geen CORS-headers, dus de browser mag de API niet direct aanroepen.
Daarom gaat de data via een kleine proxy:

| Omgeving | Proxy |
|---|---|
| `npm run dev` / `npm run preview` | Vite proxy op `/adsb` (`vite.config.js`) |
| Productie (GitHub Pages) | `server/index.mjs`, de URL komt in `VITE_ADSB_BASE` |

### Backend (`server/index.mjs`)

Eén bestand, geen dependencies, Node 18+. Staat alleen het ADSB.fi-puntquery-pad toe, zet CORS-headers
en cachet 2 seconden, zodat alle bezoekers samen hooguit ~1 verzoek per 2 s naar adsb.fi doen.
Bij een 429 van adsb.fi blijft het laatste goede antwoord geserveerd.

```bash
SERVER_PORT=8787 ALLOWED_ORIGINS=https://jouwnaam.github.io node server/index.mjs
```

- `SERVER_PORT` (of `PORT`): poort, op Pterodactyl automatisch gezet.
- `ALLOWED_ORIGINS`: komma-gescheiden lijst van origins die de API vanuit de browser mogen gebruiken (standaard `*`).
- Moet bereikbaar zijn via **HTTPS**: GitHub Pages draait op HTTPS en browsers blokkeren `http://`-verzoeken vanaf een HTTPS-pagina.

Op een Pterodactyl-host (egg "node.js generic"): upload `server/index.mjs`, zet `JS_FILE` op `index.mjs` en
`ALLOWED_ORIGINS` als omgevingsvariabele/startup-variabele.

### Frontend (GitHub Pages)

1. Zet onder *Settings → Secrets and variables → Actions → Variables* de variabele
   `VITE_ADSB_BASE` op de HTTPS-URL van de backend (zonder `/` aan het eind).
2. *Settings → Pages → Source*: **GitHub Actions**. De workflow `.github/workflows/pages.yml` test, bouwt en deployt bij elke push naar `main`.

## Over de foto's

- Foto's worden vóór opslag verkleind naar max. 1600 px (JPEG), want telefoonfoto's lopen anders snel tegen de opslaglimiet van de browser aan.
- Ze staan **alleen in deze browser op dit apparaat**. Browserdata wissen = foto's weg. De app vraagt de browser om de opslag persistent te houden.
- Toestellen die geen registratie uitzenden kun je geen foto geven.

## Landend/startend-filter

Heuristiek: in de lucht, binnen 20 NM van EHAM, onder 6.000 ft en stijgend of dalend met minimaal 300 ft/min.

## Structuur

```
src/
  App.jsx                 polling, selectie, filters
  components/
    FlightMap.jsx         Leaflet-kaart met draaiende vliegtuigiconen
    FilterPanel.jsx       hoogte, landend/startend, airlines
    Sidebar.jsx           details van het geselecteerde toestel
    Photos.jsx            upload/galerij per registratie
  lib/
    adsb.js               API, normalisatie, filters (+ adsb.test.js)
    photos.js             IndexedDB-opslag
server/index.mjs          CORS-proxy + cache (backend, + index.test.mjs)
```

Data: © [adsb.fi](https://adsb.fi) (niet-commercieel gebruik), kaart © OpenStreetMap-bijdragers.
