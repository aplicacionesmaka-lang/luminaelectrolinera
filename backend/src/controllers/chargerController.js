const { pool } = require('../utils/db');
const ocpp     = require('../ocpp/server');

async function list(_req, res) {
  const { rows } = await pool.query('SELECT * FROM chargers ORDER BY created_at');
  const conns = ocpp.getConnections();
  res.json(rows.map(c => ({ ...c, chargePointId: c.charge_point_id, maxPowerKw: c.max_power_kw, online: !!conns[c.charge_point_id] })));
}

async function getById(req, res) {
  const { rows } = await pool.query('SELECT * FROM chargers WHERE id=$1', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Cargador no encontrado' });
  const conns = ocpp.getConnections();
  const c = rows[0];
  res.json({ ...c, chargePointId: c.charge_point_id, maxPowerKw: c.max_power_kw, online: !!conns[c.charge_point_id] });
}

async function create(req, res) {
  try {
    const { stationId, chargePointId, connectors = 1, maxPowerKw = 120, model = '', connectorType = 'CCS2', chargerType = 'DC' } = req.body;
    if (!stationId || !chargePointId)
      return res.status(400).json({ error: 'stationId y chargePointId son requeridos' });

    const { rows } = await pool.query(
      `INSERT INTO chargers (id, charge_point_id, station_id, model, connectors, connector_type, charger_type, max_power_kw, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'Unavailable') RETURNING *`,
      [chargePointId, chargePointId, stationId, model, parseInt(connectors), connectorType, chargerType, parseFloat(maxPowerKw)]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'chargePointId ya existe' });
    res.status(500).json({ error: err.message });
  }
}

async function remoteStart(req, res) {
  try {
    const { connectorId = 1 } = req.body;
    const { rows: chargers } = await pool.query('SELECT * FROM chargers WHERE id=$1', [req.params.id]);
    if (!chargers.length) return res.status(404).json({ error: 'Cargador no encontrado' });

    const { rows: users } = await pool.query('SELECT * FROM users WHERE id=$1', [req.user.uid]);
    const user = users[0];
    if ((parseFloat(user?.balance) || 0) < Number(process.env.MIN_BALANCE || 500))
      return res.status(402).json({ error: 'Saldo insuficiente. Recarga tu cuenta.' });

    const result = await ocpp.remoteStart(chargers[0].charge_point_id, connectorId, user.id_tag);
    res.json({ ok: true, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function remoteStop(req, res) {
  try {
    const { transactionId } = req.body;
    if (!transactionId) return res.status(400).json({ error: 'transactionId requerido' });

    const { rows } = await pool.query('SELECT * FROM chargers WHERE id=$1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Cargador no encontrado' });

    const result = await ocpp.remoteStop(rows[0].charge_point_id, transactionId);
    res.json({ ok: true, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function activeSession(req, res) {
  const { rows } = await pool.query(
    `SELECT * FROM sessions WHERE charge_point_id=$1 AND status='Active' LIMIT 1`,
    [req.params.id]
  );
  res.json(rows.length ? rows[0] : null);
}

module.exports = { list, getById, create, remoteStart, remoteStop, activeSession };
