# Jooble Jobs Map (Node.js + Express + Leaflet)

Progetto minimale per:
- interrogare la Jooble REST API con una chiamata POST server-side,
- salvare i risultati in JSON e CSV,
- geocodificare le location via Nominatim (OpenStreetMap),
- visualizzare i job su una mappa Leaflet.

## Requisiti

- Node.js 18+ (per `fetch` nativo lato server)
- Una API key Jooble valida

## Installazione

```bash
cd project
npm install
```

## Configurazione `.env`

Copia il file di esempio e inserisci la tua chiave:

```bash
cp .env.example .env
```

Modifica `.env`:

```env
JOOBLE_API_KEY=la_tua_chiave
PORT=3000
```

> Non hardcodare mai la chiave nel codice.

## Avvio

Sviluppo (nodemon):

```bash
npm run dev
```

Produzione:

```bash
npm start
```

Apri: `http://localhost:3000`

## Endpoint API

### 1) Search raw

`GET /api/jobs/search?keywords=it&location=Berlin&radius=25&ResultOnPage=20`

- Esegue POST verso Jooble.
- Salva la risposta raw in `data/jobs-raw.json`.
- Ritorna il JSON di Jooble.

### 2) Import + normalize + geocode

`GET /api/jobs/import?keywords=it&location=Berlin&radius=25&ResultOnPage=20`

Flusso:
1. Chiama Jooble.
2. Normalizza i campi (`id, title, company, location, snippet, salary, source, type, link, updated`).
3. Salva:
   - `data/jobs.json`
   - `data/jobs.csv`
4. Geocodifica con Nominatim (throttling + fallback query + cache).
5. Salva:
   - `data/jobs-geocoded.json`
   - `data/jobs-geocoded.csv`
   - `data/geocode-cache.json`
6. Ritorna riepilogo: totale/geocodificati/falliti.

### 3) Dati mappa

`GET /api/jobs/map-data`

- Legge `data/jobs-geocoded.json`
- Restituisce solo record con `lat` e `lon` validi.

## Frontend

- Form con `keywords`, `location`, `radius`, `ResultOnPage`
- Bottone **Importa lavori**
- Bottone **Carica dati mappa**
- Mappa Leaflet con tile OpenStreetMap
- Lista risultati cliccabile per centrare marker
- `fitBounds` automatico se marker presenti

## Note geocodifica (Nominatim)

- È presente una pausa (`throttling`) tra richieste per non sovraccaricare il servizio.
- Se una `location` è già in cache, viene riutilizzata.
- Se query location fallisce, viene provata una fallback query: `titolo + location + company`.
- Se non trova coordinate, il job resta nel dataset ma senza `lat/lon`.

## Gestione errori

La chiamata Jooble gestisce esplicitamente:
- HTTP `403`
- HTTP `404`
- timeout (`504`)

Inoltre sono presenti log console per le fasi principali (import, salvataggio, geocodifica).

## Esempi chiamate rapide

```bash
curl "http://localhost:3000/api/jobs/search?keywords=it&location=Berlin"
curl "http://localhost:3000/api/jobs/import?keywords=it&location=Berlin"
curl "http://localhost:3000/api/jobs/map-data"
```

## Esempio reverse proxy Nginx minimale

```nginx
server {
    listen 80;
    server_name esempio.tld;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Cambio endpoint Jooble per altro paese

Nel file `services/joobleService.js`, aggiorna la costante:

```js
const JOOBLE_BASE = 'https://de.jooble.org/api';
```

Esempio per un altro dominio locale Jooble: sostituisci `de.jooble.org` con il dominio paese desiderato.
