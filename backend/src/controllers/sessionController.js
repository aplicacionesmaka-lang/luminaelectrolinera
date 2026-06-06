const { pool } = require('../utils/db');

async function myHistory(req, res) {
  try {
    const { from, to } = req.query;
    let q = `SELECT s.*, st.name as station_name, st.city as station_city, st.address as station_address
             FROM sessions s
             LEFT JOIN stations st ON st.id = s.station_id
             WHERE s.user_id=$1 AND s.status='Completed'`;
    const params = [req.user.uid];
    if (from) { params.push(from); q += ` AND s.started_at >= $${params.length}`; }
    if (to)   { params.push(to);   q += ` AND s.started_at <= $${params.length}`; }
    q += ' ORDER BY s.started_at DESC LIMIT 200';
    const { rows } = await pool.query(q, params);
    res.json(rows.map(s => ({
      ...s,
      kwh_used: parseFloat(s.kwh_used),
      cost:     parseFloat(s.cost),
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function myStats(req, res) {
  try {
    // Por mes
    const { rows: monthly } = await pool.query(`
      SELECT TO_CHAR(started_at,'YYYY-MM') as month,
             COUNT(*)::int                as sessions,
             COALESCE(SUM(kwh_used),0)::numeric as kwh,
             COALESCE(SUM(cost),0)::numeric     as cost
      FROM sessions
      WHERE user_id=$1 AND status='Completed'
      GROUP BY month ORDER BY month DESC LIMIT 12
    `, [req.user.uid]);

    // Por estación
    const { rows: byStation } = await pool.query(`
      SELECT st.name as station_name, st.city,
             COUNT(s.id)::int                as sessions,
             COALESCE(SUM(s.kwh_used),0)::numeric as kwh,
             COALESCE(SUM(s.cost),0)::numeric     as cost
      FROM sessions s
      LEFT JOIN stations st ON st.id = s.station_id
      WHERE s.user_id=$1 AND s.status='Completed'
      GROUP BY st.name, st.city
      ORDER BY sessions DESC LIMIT 6
    `, [req.user.uid]);

    // Totales
    const { rows: totals } = await pool.query(`
      SELECT COUNT(*)::int as sessions,
             COALESCE(SUM(kwh_used),0)::numeric as kwh,
             COALESCE(SUM(cost),0)::numeric     as cost,
             COALESCE(AVG(EXTRACT(EPOCH FROM (ended_at - started_at))/60),0)::numeric as avg_minutes
      FROM sessions WHERE user_id=$1 AND status='Completed'
    `, [req.user.uid]);

    res.json({
      monthly: monthly.map(m => ({ ...m, kwh: parseFloat(m.kwh), cost: parseFloat(m.cost) })),
      byStation: byStation.map(s => ({ ...s, kwh: parseFloat(s.kwh), cost: parseFloat(s.cost) })),
      totals: { ...totals[0], kwh: parseFloat(totals[0].kwh), cost: parseFloat(totals[0].cost), avg_minutes: parseFloat(totals[0].avg_minutes) },
    });
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

module.exports = { myHistory, myStats, getById, listAll, summary };
