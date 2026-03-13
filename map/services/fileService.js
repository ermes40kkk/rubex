const fs = require('fs/promises');
const path = require('path');
const { Parser } = require('json2csv');

const dataDir = path.join(__dirname, '..', 'data');

async function ensureDataDir() {
  await fs.mkdir(dataDir, { recursive: true });
}

function sanitizeText(value) {
  if (typeof value !== 'string') {
    return value == null ? '' : String(value);
  }

  return value
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sanitizeJob(job) {
  return {
    id: sanitizeText(job.id || job._id || ''),
    title: sanitizeText(job.title),
    company: sanitizeText(job.company),
    location: sanitizeText(job.location),
    snippet: sanitizeText(job.snippet),
    salary: sanitizeText(job.salary),
    source: sanitizeText(job.source),
    type: sanitizeText(job.type),
    link: sanitizeText(job.link),
    updated: sanitizeText(job.updated),
    lat: job.lat ? Number(job.lat) : null,
    lon: job.lon ? Number(job.lon) : null
  };
}

async function writeJson(filename, data) {
  await ensureDataDir();
  const fullPath = path.join(dataDir, filename);
  await fs.writeFile(fullPath, JSON.stringify(data, null, 2), 'utf-8');
  return fullPath;
}

async function readJson(filename, fallback = null) {
  try {
    const fullPath = path.join(dataDir, filename);
    const content = await fs.readFile(fullPath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return fallback;
    }
    throw error;
  }
}

async function writeJobsCsv(filename, jobs) {
  await ensureDataDir();
  const fields = [
    'id',
    'title',
    'company',
    'location',
    'snippet',
    'salary',
    'source',
    'type',
    'link',
    'updated',
    'lat',
    'lon'
  ];

  const parser = new Parser({ fields, quote: '"' });
  const csv = parser.parse(jobs);

  const fullPath = path.join(dataDir, filename);
  await fs.writeFile(fullPath, csv, 'utf-8');
  return fullPath;
}

module.exports = {
  sanitizeText,
  sanitizeJob,
  writeJson,
  readJson,
  writeJobsCsv
};
