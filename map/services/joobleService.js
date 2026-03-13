const { sanitizeText } = require('./fileService');

const JOOBLE_BASE = 'https://de.jooble.org/api';
const REQUEST_TIMEOUT_MS = 12000;

function createHttpError(status, message, details = null) {
  const error = new Error(message);
  error.status = status;
  if (details) {
    error.details = details;
  }
  return error;
}

async function fetchJoobleJobs({
  keywords = '',
  location = '',
  radius = '25',
  page = '1',
  resultOnPage = '20',
  companysearch = false
}) {
  const apiKey = process.env.JOOBLE_API_KEY;
  if (!apiKey) {
    throw createHttpError(500, 'Variabile JOOBLE_API_KEY mancante nel file .env');
  }

  const endpoint = `${JOOBLE_BASE}/${apiKey}`;
  const payload = {
    keywords: sanitizeText(keywords),
    location: sanitizeText(location),
    radius: String(radius || '25'),
    page: String(page || '1'),
    ResultOnPage: String(resultOnPage || '20'),
    companysearch: Boolean(companysearch)
  };

  console.log('[jooble] Invio richiesta POST verso Jooble API');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      throw createHttpError(504, 'Timeout durante la chiamata alla Jooble API');
    }
    throw createHttpError(502, 'Errore di rete verso Jooble API', error.message);
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    if (response.status === 403) {
      throw createHttpError(403, 'Accesso negato da Jooble API (403)');
    }
    if (response.status === 404) {
      throw createHttpError(404, 'Endpoint Jooble non trovato (404)');
    }

    const bodyText = await response.text();
    throw createHttpError(response.status, `Errore Jooble API (${response.status})`, bodyText);
  }

  const data = await response.json();
  console.log('[jooble] Risposta ricevuta con successo');
  return data;
}

module.exports = {
  fetchJoobleJobs
};
