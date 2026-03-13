const { readJson, writeJson, sanitizeText } = require('./fileService');

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const GEOCODE_CACHE_FILE = 'geocode-cache.json';
const REQUEST_TIMEOUT_MS = 10000;
const THROTTLE_MS = 1000;
const GEO_PROVIDER = 'nominatim';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeBase(value) {
  return sanitizeText(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeLocation(location) {
  return normalizeBase(location);
}

function normalizeCompany(company) {
  let normalized = normalizeBase(company);
  if (!normalized) {
    return '';
  }

  normalized = normalized
    .replace(/\bgmbh\s+co\s+kg\b/gi, ' ')
    .replace(/\b(gmbh|ag|se|ug|kg|mbh|inc|ltd)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return normalized;
}

function buildCompanyKey(company, location) {
  const normalizedCompany = normalizeCompany(company);
  const normalizedLocation = normalizeLocation(location);

  if (!normalizedCompany || !normalizedLocation) {
    return '';
  }

  return `${normalizedCompany}|${normalizedLocation}`;
}

function buildLocationKey(location) {
  return normalizeLocation(location);
}

function toCacheRecord(result, precision, query) {
  return {
    lat: result.lat,
    lon: result.lon,
    displayName: result.displayName || '',
    provider: GEO_PROVIDER,
    precision,
    query,
    cachedAt: new Date().toISOString()
  };
}

function normalizeLegacyRecord(value) {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const lat = Number(value.lat);
  const lon = Number(value.lon);
  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    return null;
  }

  return {
    lat,
    lon,
    displayName: sanitizeText(value.displayName || ''),
    provider: sanitizeText(value.provider || GEO_PROVIDER) || GEO_PROVIDER,
    precision: sanitizeText(value.precision || 'location') || 'location',
    query: sanitizeText(value.query || ''),
    cachedAt: sanitizeText(value.cachedAt || '') || new Date().toISOString()
  };
}

async function loadGeocodeCache() {
  const rawCache = await readJson(GEOCODE_CACHE_FILE, {});
  const cache = {
    companies: {},
    locations: {}
  };

  if (!rawCache || typeof rawCache !== 'object') {
    return cache;
  }

  const hasStructuredBuckets =
    rawCache.companies && typeof rawCache.companies === 'object' &&
    rawCache.locations && typeof rawCache.locations === 'object';

  if (hasStructuredBuckets) {
    for (const [key, value] of Object.entries(rawCache.companies)) {
      const normalized = normalizeLegacyRecord(value);
      if (normalized && sanitizeText(key)) {
        cache.companies[sanitizeText(key)] = normalized;
      }
    }

    for (const [key, value] of Object.entries(rawCache.locations)) {
      const normalized = normalizeLegacyRecord(value);
      if (normalized && sanitizeText(key)) {
        cache.locations[sanitizeText(key)] = normalized;
      }
    }

    return cache;
  }

  // Compatibilità formato legacy: { "berlin": { lat, lon } }
  for (const [key, value] of Object.entries(rawCache)) {
    const locationKey = buildLocationKey(key);
    const normalized = normalizeLegacyRecord(value);
    if (locationKey && normalized) {
      cache.locations[locationKey] = normalized;
    }
  }

  return cache;
}

async function saveGeocodeCache(cache) {
  await writeJson(GEOCODE_CACHE_FILE, cache);
}

function createThrottle() {
  let lastRequestAt = 0;

  return async () => {
    const now = Date.now();
    const diff = now - lastRequestAt;

    if (diff < THROTTLE_MS) {
      await sleep(THROTTLE_MS - diff);
    }

    lastRequestAt = Date.now();
  };
}

async function searchNominatim(query, throttle) {
  if (!query) {
    return null;
  }

  await throttle();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  const url = new URL(NOMINATIM_URL);
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '1');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('countrycodes', 'de');

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'jooble-jobs-map/1.1 (+https://localhost)',
        'Accept-Language': 'de,en'
      },
      signal: controller.signal
    });

    if (!response.ok) {
      console.warn(`[geocode] Nominatim HTTP ${response.status} su query: ${query}`);
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

    return {
      lat,
      lon,
      displayName: sanitizeText(first.display_name || '')
    };
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

function applyGeocoding(job, record, geoCached) {
  job.lat = record.lat;
  job.lon = record.lon;
  job.geoPrecision = record.precision;
  job.geoQueryUsed = record.query;
  job.geoProvider = record.provider || GEO_PROVIDER;
  job.geoCached = geoCached;
}

function markGeocodingFailed(job) {
  job.lat = null;
  job.lon = null;
  job.geoPrecision = null;
  job.geoQueryUsed = null;
  job.geoProvider = GEO_PROVIDER;
  job.geoCached = false;
}

async function geocodeSingleJob(job, cache, throttle) {
  const company = sanitizeText(job.company);
  const location = sanitizeText(job.location);

  const companyKey = buildCompanyKey(company, location);
  const locationKey = buildLocationKey(location);

  if (companyKey && cache.companies[companyKey]) {
    applyGeocoding(job, cache.companies[companyKey], true);
    return true;
  }

  const locationCacheRecord = locationKey ? cache.locations[locationKey] : null;
  const normalizedCompany = normalizeCompany(company);

  if (normalizedCompany && location) {
    const companyQueries = [
      `${company}, ${location}, Germany`,
      `${company}, ${location}`
    ];

    for (const query of companyQueries) {
      const result = await searchNominatim(query, throttle);
      if (result) {
        const record = toCacheRecord(result, 'company+location', query);
        cache.companies[companyKey] = record;
        applyGeocoding(job, record, false);
        return true;
      }
    }
  }

  if (locationCacheRecord) {
    applyGeocoding(job, locationCacheRecord, true);
    return true;
  }

  if (!location) {
    console.warn(`[geocode] Job senza location geocodificabile: ${job.id || job.title || 'unknown-job'}`);
    markGeocodingFailed(job);
    return false;
  }

  const locationQueries = [`${location}, Germany`, location];

  for (const query of locationQueries) {
    const result = await searchNominatim(query, throttle);
    if (result) {
      const record = toCacheRecord(result, 'location', query);
      cache.locations[locationKey] = record;
      applyGeocoding(job, record, false);
      return true;
    }
  }

  console.warn(`[geocode] Nessun risultato per job: ${job.id || job.title || 'unknown-job'} (company="${company}", location="${location}")`);
  markGeocodingFailed(job);
  return false;
}

async function geocodeJobs(jobs) {
  const cache = await loadGeocodeCache();
  const throttle = createThrottle();

  let geocodedCount = 0;
  let failedCount = 0;

  for (const job of jobs) {
    const geocoded = await geocodeSingleJob(job, cache, throttle);

    if (geocoded) {
      geocodedCount += 1;
    } else {
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
  normalizeCompany,
  normalizeLocation,
  buildCompanyKey,
  buildLocationKey,
  searchNominatim,
  loadGeocodeCache,
  saveGeocodeCache,
  geocodeSingleJob,
  geocodeJobs
};
