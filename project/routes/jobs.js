const express = require('express');
const { fetchJoobleJobs } = require('../services/joobleService');
const { geocodeJobs } = require('../services/geocodeService');
const { sanitizeJob, writeJson, writeJobsCsv, readJson } = require('../services/fileService');

const router = express.Router();

function normalizeJobs(rawData) {
  const sourceJobs = Array.isArray(rawData?.jobs) ? rawData.jobs : [];

  return sourceJobs.map((job, index) =>
    sanitizeJob({
      id: job.id || job._id || `${Date.now()}-${index}`,
      title: job.title,
      company: job.company,
      location: job.location,
      snippet: job.snippet,
      salary: job.salary,
      source: job.source,
      type: job.type,
      link: job.link,
      updated: job.updated
    })
  );
}

router.get('/search', async (req, res, next) => {
  try {
    const { keywords = 'it', location = 'Berlin', radius = '25', page = '1', ResultOnPage = '20' } = req.query;

    const rawData = await fetchJoobleJobs({
      keywords,
      location,
      radius,
      page,
      resultOnPage: ResultOnPage,
      companysearch: false
    });

    await writeJson('jobs-raw.json', rawData);
    console.log('[jobs/search] Salvato file data/jobs-raw.json');

    res.json(rawData);
  } catch (error) {
    next(error);
  }
});

router.get('/import', async (req, res, next) => {
  try {
    const { keywords = 'it', location = 'Berlin', radius = '25', page = '1', ResultOnPage = '20' } = req.query;

    const rawData = await fetchJoobleJobs({
      keywords,
      location,
      radius,
      page,
      resultOnPage: ResultOnPage,
      companysearch: false
    });

    await writeJson('jobs-raw.json', rawData);

    const normalizedJobs = normalizeJobs(rawData);
    await writeJson('jobs.json', normalizedJobs);
    await writeJobsCsv('jobs.csv', normalizedJobs);
    console.log('[jobs/import] Salvati jobs.json e jobs.csv');

    const geocoded = await geocodeJobs(normalizedJobs);
    await writeJson('jobs-geocoded.json', geocoded.jobs);
    await writeJobsCsv('jobs-geocoded.csv', geocoded.jobs);
    console.log('[jobs/import] Salvati jobs-geocoded.json e jobs-geocoded.csv');

    res.json({
      totalJobs: normalizedJobs.length,
      geocoded: geocoded.geocodedCount,
      failed: geocoded.failedCount
    });
  } catch (error) {
    next(error);
  }
});

router.get('/map-data', async (req, res, next) => {
  try {
    const jobs = await readJson('jobs-geocoded.json', []);

    const mapData = (Array.isArray(jobs) ? jobs : []).filter(
      (job) => Number.isFinite(Number(job.lat)) && Number.isFinite(Number(job.lon))
    );

    res.json(mapData);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
