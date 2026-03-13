const path = require('path');
const express = require('express');
const dotenv = require('dotenv');

dotenv.config();

const jobsRouter = require('./routes/jobs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use('/api/jobs', jobsRouter);
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

app.use((err, req, res, next) => {
  console.error('[server] Errore non gestito:', err);
  const status = err.status || 500;
  res.status(status).json({
    error: err.message || 'Errore interno del server'
  });
});

app.listen(PORT, () => {
  console.log(`[server] Avvio completato su http://localhost:${PORT}`);
});
