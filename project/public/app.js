const form = document.getElementById('import-form');
const loadMapButton = document.getElementById('load-map');
const statusEl = document.getElementById('status');
const jobsListEl = document.getElementById('jobs-list');

const map = L.map('map').setView([52.52, 13.405], 5);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

let markers = [];

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle('error', isError);
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function clearMarkers() {
  markers.forEach(({ marker }) => marker.remove());
  markers = [];
  jobsListEl.innerHTML = '';
}

function renderJobs(data) {
  clearMarkers();

  if (!Array.isArray(data) || data.length === 0) {
    setStatus('Nessun marker disponibile: importa dati o verifica la geocodifica.');
    return;
  }

  const bounds = L.latLngBounds();

  data.forEach((job, index) => {
    const lat = Number(job.lat);
    const lon = Number(job.lon);

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return;
    }

    const marker = L.marker([lat, lon]).addTo(map);
    marker.bindPopup(`
      <strong>${escapeHtml(job.title || 'Senza titolo')}</strong><br>
      <b>Azienda:</b> ${escapeHtml(job.company || 'N/D')}<br>
      <b>Location:</b> ${escapeHtml(job.location || 'N/D')}<br>
      <b>Salary:</b> ${escapeHtml(job.salary || 'N/D')}<br>
      <b>Tipo:</b> ${escapeHtml(job.type || 'N/D')}<br>
      <b>Source:</b> ${escapeHtml(job.source || 'N/D')}<br>
      <a href="${escapeHtml(job.link || '#')}" target="_blank" rel="noopener noreferrer">Apri annuncio</a>
    `);

    bounds.extend([lat, lon]);

    const li = document.createElement('li');
    li.innerHTML = `
      <button type="button" data-index="${index}">
        <span class="title">${escapeHtml(job.title || 'Senza titolo')}</span>
        <span>${escapeHtml(job.company || 'N/D')} - ${escapeHtml(job.location || 'N/D')}</span>
      </button>
    `;

    li.querySelector('button').addEventListener('click', () => {
      map.setView([lat, lon], 12);
      marker.openPopup();
    });

    jobsListEl.appendChild(li);
    markers.push({ marker, job });
  });

  if (markers.length === 0) {
    setStatus('Dati caricati, ma nessun record con coordinate valide.');
    return;
  }

  map.fitBounds(bounds.pad(0.2));
  setStatus(`Marker caricati: ${markers.length}`);
}

async function loadMapData() {
  setStatus('Caricamento dati mappa...');
  try {
    const response = await fetch('/api/jobs/map-data');
    if (!response.ok) {
      throw new Error(`Errore HTTP ${response.status}`);
    }

    const data = await response.json();
    renderJobs(data);
  } catch (error) {
    setStatus(`Errore caricamento mappa: ${error.message}`, true);
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const formData = new FormData(form);
  const params = new URLSearchParams({
    keywords: formData.get('keywords') || 'it',
    location: formData.get('location') || 'Berlin',
    radius: formData.get('radius') || '25',
    ResultOnPage: formData.get('ResultOnPage') || '20'
  });

  setStatus('Import in corso...');

  try {
    const response = await fetch(`/api/jobs/import?${params.toString()}`);
    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      throw new Error(errBody.error || `Errore HTTP ${response.status}`);
    }

    const summary = await response.json();
    setStatus(
      `Import completato. Totale: ${summary.totalJobs}, geocodificati: ${summary.geocoded}, falliti: ${summary.failed}`
    );

    await loadMapData();
  } catch (error) {
    setStatus(`Errore import: ${error.message}`, true);
  }
});

loadMapButton.addEventListener('click', loadMapData);
