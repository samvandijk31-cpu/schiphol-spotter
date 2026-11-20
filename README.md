# ✈ Schiphol Spotter

Open-source live flight tracker rond Schiphol (EHAM) met je **eigen spotterfoto's per registratie**.
Draait volledig in de browser: geen backend, geen account, geen API-key.

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

## Waarom een proxy?

`opendata.adsb.fi` stuurt geen CORS-headers, dus de browser mag de API niet direct aanroepen.
De app vraagt daarom data op via het eigen pad `/adsb/...`:

| Omgeving | Hoe `/adsb` werkt |
|---|---|
| `npm run dev` / `npm run preview` | Vite proxy (`vite.config.js`) |
| Vercel | rewrite in `vercel.json`, niets te configureren |
| GitHub Pages | kan niet proxyen, zie hieronder |

### Vercel

Importeer de repo in Vercel (framework: Vite); de rewrite in `vercel.json` regelt de proxy.
(Nog niet getest op een echte Vercel-deploy.)

### GitHub Pages

1. Deploy `proxy/worker.js` als (gratis) Cloudflare Worker, bijvoorbeeld `https://adsb-proxy.<jij>.workers.dev`.
2. Zet in je repo onder *Settings → Secrets and variables → Actions → Variables* de variabele
   `VITE_ADSB_BASE` op die Worker-URL (zonder `/` aan het eind).
3. *Settings → Pages → Source*: **GitHub Actions**. De workflow `.github/workflows/pages.yml` bouwt en deployt bij elke push naar `main`.

(Worker en workflow zijn nog niet getest op een echte deploy.)

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
proxy/worker.js           CORS-proxy voor GitHub Pages
```

Data: © [adsb.fi](https://adsb.fi) (niet-commercieel gebruik), kaart © OpenStreetMap-bijdragers.
