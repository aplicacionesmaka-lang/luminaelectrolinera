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

    try {
      const result = await ocpp.remoteStart(chargers[0].charge_point_id, connectorId, user.id_tag);
      res.json({ ok: true, result });
    } catch (ocppErr) {
      // Modo demo: cargador sin conexión OCPP — crear sesión directamente en DB
      const { v4: uuidv4 } = require('uuid');
      const txId = Math.floor(Math.random() * 900000) + 100000;
      await pool.query(
        `INSERT INTO sessions (id, user_id, charge_point_id, station_id, transaction_id, status, kwh_used, cost, started_at)
         VALUES ($1,$2,$3,$4,$5,'Active',0,0,NOW())`,
        [uuidv4(), req.user.uid, chargers[0].charge_point_id, chargers[0].station_id, txId]
      );
      await pool.query("UPDATE chargers SET status='Charging' WHERE id=$1", [req.params.id]);
      res.json({ ok: true, demo: true, transactionId: txId });
    }
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

    try {
      const result = await ocpp.remoteStop(rows[0].charge_point_id, transactionId);
      res.json({ ok: true, result });
    } catch {
      // Modo demo: finalizar sesión directamente en DB
      await pool.query("UPDATE sessions SET status='Completed', ended_at=NOW() WHERE transaction_id=$1", [transactionId]);
      await pool.query("UPDATE chargers SET status='Available' WHERE id=$1", [req.params.id]);
      res.json({ ok: true, demo: true });
    }
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

async function listUnassigned(_req, res) {
  const { rows } = await pool.query(
    "SELECT * FROM chargers WHERE station_id IS NULL ORDER BY created_at DESC"
  );
  const conns = ocpp.getConnections();
  res.json(rows.map(c => ({ ...c, chargePointId: c.charge_point_id, online: !!conns[c.charge_point_id] })));
}

async function assignStation(req, res) {
  try {
    const { stationId, model, maxPowerKw, connectorType, chargerType, connectors } = req.body;
    if (!stationId) return res.status(400).json({ error: 'stationId requerido' });
    const { rows } = await pool.query(
      `UPDATE chargers SET
         station_id        = $2,
         model             = COALESCE(NULLIF($3,''), model),
         max_power_kw      = COALESCE($4::numeric, max_power_kw),
         connector_type    = COALESCE(NULLIF($5,''), connector_type),
         charger_type      = COALESCE(NULLIF($6,''), charger_type),
         connectors        = COALESCE($7::int, connectors)
       WHERE id=$1 RETURNING *`,
      [req.params.id, stationId, model||'', maxPowerKw||null, connectorType||'', chargerType||'', connectors||null]
    );
    if (!rows.length) return res.status(404).json({ error: 'Cargador no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function resetCharger(req, res) {
  try {
    await pool.query("UPDATE chargers SET status='Available' WHERE id=$1", [req.params.id]);
    await pool.query("UPDATE sessions SET status='Completed', ended_at=NOW() WHERE charge_point_id=$1 AND status='Active'", [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { list, getById, create, remoteStart, remoteStop, activeSession, resetCharger, listUnassigned, assignStation };
