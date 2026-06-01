const { pool } = require('../utils/db');

async function getAnalytics(req, res) {
  try {
    const { stationId } = req.query;
    const filter = stationId ? `AND s.station_id='${stationId}'` : '';

    const [sessRes, chRes, stRes] = await Promise.all([
      pool.query(`SELECT s.*, st.name as station_name, st.city as station_city FROM sessions s LEFT JOIN stations st ON st.id=s.station_id WHERE s.status='Completed' ${filter}`),
      pool.query('SELECT * FROM chargers'),
      pool.query('SELECT * FROM stations'),
    ]);

    const sessions = sessRes.rows;
    const chargers = chRes.rows;
    const stations = stRes.rows;

    // Por mes
    const byMonth = {};
    sessions.forEach(s => {
      const m = (s.started_at || '').toString().slice(0, 7);
      if (!m) return;
      if (!byMonth[m]) byMonth[m] = { month: m, sessions: 0, kwh: 0, revenue: 0 };
      byMonth[m].sessions++;
      byMonth[m].kwh     += parseFloat(s.kwh_used) || 0;
      byMonth[m].revenue += parseFloat(s.cost) || 0;
    });
    const monthData = Object.values(byMonth)
      .sort((a, b) => a.month.localeCompare(b.month))
      .map(m => ({ ...m, kwh: parseFloat(m.kwh.toFixed(1)), revenue: Math.round(m.revenue) }));

    // Por día (últimos 30)
    const byDay = {};
    sessions.forEach(s => {
      const d = (s.started_at || '').toString().slice(0, 10);
      if (!d) return;
      if (!byDay[d]) byDay[d] = { day: d, sessions: 0, kwh: 0, revenue: 0 };
      byDay[d].sessions++;
      byDay[d].kwh     += parseFloat(s.kwh_used) || 0;
      byDay[d].revenue += parseFloat(s.cost) || 0;
    });
    const dayData = Object.values(byDay)
      .sort((a, b) => a.day.localeCompare(b.day))
      .slice(-30)
      .map(d => ({ ...d, kwh: parseFloat(d.kwh.toFixed(1)), revenue: Math.round(d.revenue) }));

    // Por estación
    const bySt = {};
    sessions.forEach(s => {
      const sid = s.station_id || 'desconocido';
      if (!bySt[sid]) bySt[sid] = { stationId: sid, name: s.station_name || sid, city: s.station_city || '', sessions: 0, kwh: 0, revenue: 0 };
      bySt[sid].sessions++;
      bySt[sid].kwh     += parseFloat(s.kwh_used) || 0;
      bySt[sid].revenue += parseFloat(s.cost) || 0;
    });
    const stationData = Object.values(bySt)
      .sort((a, b) => b.revenue - a.revenue)
      .map(s => ({ ...s, kwh: parseFloat(s.kwh.toFixed(1)), revenue: Math.round(s.revenue) }));

    // Por cargador
    const byCh = {};
    sessions.forEach(s => {
      const cid = s.charge_point_id || 'desconocido';
      if (!byCh[cid]) byCh[cid] = { chargePointId: cid, model: '', powerKw: 0, sessions: 0, kwh: 0, revenue: 0, totalMinutes: 0 };
      byCh[cid].sessions++;
      byCh[cid].kwh     += parseFloat(s.kwh_used) || 0;
      byCh[cid].revenue += parseFloat(s.cost) || 0;
      if (s.started_at && s.ended_at)
        byCh[cid].totalMinutes += (new Date(s.ended_at) - new Date(s.started_at)) / 60000;
    });
    chargers.forEach(ch => {
      if (byCh[ch.charge_point_id]) {
        byCh[ch.charge_point_id].model   = ch.model || '';
        byCh[ch.charge_point_id].powerKw = parseFloat(ch.max_power_kw) || 0;
      }
    });

    const DAYS_IN_RANGE    = 90;
    const OP_HOURS_PER_DAY = 16;
    const OP_MINUTES_TOTAL = DAYS_IN_RANGE * OP_HOURS_PER_DAY * 60;

    const chargerTime = Object.values(byCh).map(ch => {
      const activeMin = parseFloat(ch.totalMinutes.toFixed(0));
      const idleMin   = Math.max(0, OP_MINUTES_TOTAL - activeMin);
      const utilPct   = parseFloat(((activeMin / OP_MINUTES_TOTAL) * 100).toFixed(1));
      return { ...ch, kwh: parseFloat(ch.kwh.toFixed(1)), revenue: Math.round(ch.revenue), activeMin, idleMin, utilPct, activeHrs: parseFloat((activeMin / 60).toFixed(1)), idleHrs: parseFloat((idleMin / 60).toFixed(1)) };
    }).sort((a, b) => b.revenue - a.revenue);

    const totals = {
      sessions: sessions.length,
      kwh:      parseFloat(sessions.reduce((s, x) => s + (parseFloat(x.kwh_used) || 0), 0).toFixed(1)),
      revenue:  Math.round(sessions.reduce((s, x) => s + (parseFloat(x.cost) || 0), 0)),
    };

    res.json({ totals, monthData, dayData, stationData, chargerTime, stations, chargers });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}

module.exports = { getAnalytics };
