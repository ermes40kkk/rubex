const { readJson, writeJson, sanitizeText } = require('./fileService');

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const GEOCODE_CACHE_FILE = 'geocode-cache.json';
const REQUEST_TIMEOUT_MS = 10000;
const THROTTLE_MS = 1100;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildFallbackQuery(job) {
  return sanitizeText([job.title, job.location, job.company].filter(Boolean).join(', '));
}

async function loadGeocodeCache() {
  const cache = await readJson(GEOCODE_CACHE_FILE, {});
  return cache || {};
}

async function saveGeocodeCache(cache) {
  await writeJson(GEOCODE_CACHE_FILE, cache);
}

async function requestNominatim(query) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  const url = new URL(NOMINATIM_URL);
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '1');

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'jooble-jobs-map/1.0 (local-development)'
      },
      signal: controller.signal
    });

    if (!response.ok) {
      return null;
    }

    const results = await response.json();
    if (!Array.isArray(results) || results.length === 0) {
      return null;
    }

    const first = results[0];
    const lat = Number(first.lat);
    const lon = Number(first.lon);
    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      return null;
    }

    return { lat, lon };
  } catch (error) {
    if (error.name === 'AbortError') {
      console.warn(`[geocode] Timeout su query: ${query}`);
      return null;
    }
    console.warn(`[geocode] Errore Nominatim: ${error.message}`);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function geocodeJobs(jobs) {
  const cache = await loadGeocodeCache();
  let geocodedCount = 0;
  let failedCount = 0;

  for (const job of jobs) {
    const location = sanitizeText(job.location);
    const fallback = buildFallbackQuery(job);
    let coords = null;

    if (location && cache[location]) {
      coords = cache[location];
    } else if (location) {
      console.log(`[geocode] Geocodifica location: ${location}`);
      coords = await requestNominatim(location);
      await sleep(THROTTLE_MS);

      if (!coords && fallback && fallback !== location) {
        console.log(`[geocode] Fallback geocodifica: ${fallback}`);
        coords = await requestNominatim(fallback);
        await sleep(THROTTLE_MS);
      }

      if (coords) {
        cache[location] = coords;
      }
    }

    if (coords) {
      job.lat = coords.lat;
      job.lon = coords.lon;
      geocodedCount += 1;
    } else {
      job.lat = null;
      job.lon = null;
      failedCount += 1;
    }
  }

  await saveGeocodeCache(cache);

  return {
    jobs,
    geocodedCount,
    failedCount
  };
}

module.exports = {
  geocodeJobs
};
