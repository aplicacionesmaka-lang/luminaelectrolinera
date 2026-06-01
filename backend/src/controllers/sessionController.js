const { pool } = require('../utils/db');

async function myHistory(req, res) {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM sessions WHERE user_id=$1 ORDER BY started_at DESC LIMIT 50`,
      [req.user.uid]
    );
    res.json(rows.map(s => ({ ...s, chargePointId: s.charge_point_id, kwhUsed: parseFloat(s.kwh_used), cost: parseFloat(s.cost), startedAt: s.started_at, endedAt: s.ended_at })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function getById(req, res) {
  const { rows } = await pool.query('SELECT * FROM sessions WHERE id=$1', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Sesión no encontrada' });
  const s = rows[0];
  if (s.user_id !== req.user.uid && req.user.role !== 'admin')
    return res.status(403).json({ error: 'Sin permisos' });
  res.json({ ...s, chargePointId: s.charge_point_id, kwhUsed: parseFloat(s.kwh_used), cost: parseFloat(s.cost) });
}

async function listAll(req, res) {
  try {
    const { status, limit = 200 } = req.query;
    let q = 'SELECT s.*, st.city FROM sessions s LEFT JOIN chargers c ON c.charge_point_id=s.charge_point_id LEFT JOIN stations st ON st.id=s.station_id';
    const params = [];
    if (status) { q += ' WHERE s.status=$1'; params.push(status); }
    q += ` ORDER BY s.started_at DESC LIMIT ${parseInt(limit)}`;
    const { rows } = await pool.query(q, params);
    res.json(rows.map(s => ({ ...s, chargePointId: s.charge_point_id, kwhUsed: parseFloat(s.kwh_used), cost: parseFloat(s.cost), startedAt: s.started_at, endedAt: s.ended_at })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function summary(_req, res) {
  try {
    const { rows } = await pool.query(`SELECT COUNT(*)::int as sessions, COALESCE(SUM(kwh_used),0) as kwh, COALESCE(SUM(cost),0) as revenue FROM sessions WHERE status='Completed'`);
    const r = rows[0];
    res.json({ totalSessions: r.sessions, totalKwh: parseFloat(r.kwh), totalRevenue: parseFloat(r.revenue) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { myHistory, getById, listAll, summary };
