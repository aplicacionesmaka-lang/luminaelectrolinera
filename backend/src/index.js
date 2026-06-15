require('dotenv').config();
const http    = require('http');
const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const morgan  = require('morgan');
const rateLimit = require('express-rate-limit');

const { initDb } = require('./utils/db');
const { initOcppServer } = require('./ocpp/server');

const app = express();

app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(rateLimit({ windowMs: 60_000, max: 100, standardHeaders: true, legacyHeaders: false }));

app.use(express.json());

app.use('/api/users',    require('./routes/users'));
app.use('/api/stations', require('./routes/stations'));
app.use('/api/chargers', require('./routes/chargers'));
app.use('/api/sessions', require('./routes/sessions'));
app.use('/api/payments',     require('./routes/payments'));
app.use('/api/reservations',     require('./routes/reservations'));
app.use('/api/payment-methods', require('./routes/paymentMethods'));

app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

const PORT   = process.env.PORT || 4000;
const server = http.createServer(app);

initOcppServer(server);

initDb().then(() => {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`🔌 Lumina backend running on port ${PORT}`);
    console.log(`⚡ OCPP endpoint: ws://localhost:${PORT}/ocpp/{chargePointId}`);
  });
}).catch(err => {
  console.error('❌ DB init failed:', err.message);
  process.exit(1);
});
