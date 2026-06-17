const { pool } = require('../utils/db');

const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

async function getAnalytics(req, res) {
  try {
    const { stationId, desde, hasta, agrupacion } = req.query;

    // Período por defecto: mes actual
    const now   = new Date();
    const defDesde = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
    const defHasta = new Date(now.getFullYear(), now.getMonth()+1, 0).toISOString().slice(0,10);
    const dateFrom = desde || defDesde;
    const dateTo   = hasta || defHasta;

    const stFilter = stationId ? `AND s.station_id = $3` : '';
    const params   = stationId ? [dateFrom, dateTo, stationId] : [dateFrom, dateTo];

    const [sessRes, chRes, stRes] = await Promise.all([
      pool.query(`
        SELECT
          s.id, s.charge_point_id, s.station_id, s.started_at, s.ended_at,
          COALESCE(s.kwh_used, 0)::numeric                        AS kwh_used,
          COALESCE(s.kwh_used * st.price_per_kwh, 0)::numeric     AS revenue,
          st.name  AS station_name,
          st.city  AS station_city,
          st.price_per_kwh
        FROM sessions s
        LEFT JOIN stations st ON st.id = s.station_id
        WHERE s.status = 'Completed'
          AND s.started_at::date BETWEEN $1 AND $2
          ${stFilter}
        ORDER BY s.started_at
      `, params),
      pool.query('SELECT * FROM chargers'),
      pool.query('SELECT * FROM stations'),
    ]);

    const sessions = sessRes.rows;
    const chargers = chRes.rows;
    const stations = stRes.rows;

    // ── Por mes ────────────────────────────────────────────────────────────────
    // Generar todos los meses del rango para no tener huecos
    const startM = new Date(dateFrom.slice(0,7)+'-01');
    const endM   = new Date(dateTo.slice(0,7)+'-01');
    const byMonth = {};
    for (let d = new Date(startM); d <= endM; d.setMonth(d.getMonth()+1)) {
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      const label = `${MESES[d.getMonth()]} ${d.getFullYear()}`;
      byMonth[key] = { key, label, sessions: 0, kwh: 0, revenue: 0 };
    }
    sessions.forEach(s => {
      const key = (s.started_at||'').toString().slice(0,7);
      if (byMonth[key]) {
        byMonth[key].sessions++;
        byMonth[key].kwh     += parseFloat(s.kwh_used) || 0;
        byMonth[key].revenue += parseFloat(s.revenue)  || 0;
      }
    });
    const monthData = Object.values(byMonth)
      .map(m => ({ ...m, kwh: parseFloat(m.kwh.toFixed(1)), revenue: Math.round(m.revenue) }));

    // ── Por día — TODOS los días del rango (sin huecos) ────────────────────────
    const byDay = {};
    const startD = new Date(dateFrom);
    const endD   = new Date(dateTo);
    for (let d = new Date(startD); d <= endD; d.setDate(d.getDate()+1)) {
      const key   = d.toISOString().slice(0,10);
      const label = String(d.getDate()); // solo el número del día
      byDay[key]  = { key, label, sessions: 0, kwh: 0, revenue: 0 };
    }
    sessions.forEach(s => {
      const key = (s.started_at||'').toString().slice(0,10);
      if (byDay[key]) {
        byDay[key].sessions++;
        byDay[key].kwh     += parseFloat(s.kwh_used) || 0;
        byDay[key].revenue += parseFloat(s.revenue)  || 0;
      }
    });
    const dayData = Object.values(byDay)
      .map(d => ({ ...d, kwh: parseFloat(d.kwh.toFixed(1)), revenue: Math.round(d.revenue) }));

    // ── Por estación ───────────────────────────────────────────────────────────
    const bySt = {};
    sessions.forEach(s => {
      const sid = s.station_id || 'desconocido';
      if (!bySt[sid]) bySt[sid] = { stationId: sid, name: s.station_name || sid, city: s.station_city || '', sessions: 0, kwh: 0, revenue: 0 };
      bySt[sid].sessions++;
      bySt[sid].kwh     += parseFloat(s.kwh_used) || 0;
      bySt[sid].revenue += parseFloat(s.revenue)  || 0;
    });
    const stationData = Object.values(bySt)
      .sort((a, b) => b.revenue - a.revenue)
      .map(s => ({ ...s, kwh: parseFloat(s.kwh.toFixed(1)), revenue: Math.round(s.revenue) }));

    // ── Por cargador ───────────────────────────────────────────────────────────
    const byCh = {};
    sessions.forEach(s => {
      const cid = s.charge_point_id || 'desconocido';
      if (!byCh[cid]) byCh[cid] = { chargePointId: cid, model: '', powerKw: 0, sessions: 0, kwh: 0, revenue: 0, totalMinutes: 0 };
      byCh[cid].sessions++;
      byCh[cid].kwh     += parseFloat(s.kwh_used) || 0;
      byCh[cid].revenue += parseFloat(s.revenue)  || 0;
      if (s.started_at && s.ended_at)
        byCh[cid].totalMinutes += (new Date(s.ended_at) - new Date(s.started_at)) / 60000;
    });
    chargers.forEach(ch => {
      if (byCh[ch.charge_point_id]) {
        byCh[ch.charge_point_id].model   = ch.model || '';
        byCh[ch.charge_point_id].powerKw = parseFloat(ch.max_power_kw) || 0;
      }
    });

    const diffDays = Math.max(1, Math.round((endD - startD) / 86400000) + 1);
    const OP_MINUTES_TOTAL = diffDays * 16 * 60;

    const chargerTime = Object.values(byCh).map(ch => {
      const activeMin = parseFloat(ch.totalMinutes.toFixed(0));
      const idleMin   = Math.max(0, OP_MINUTES_TOTAL - activeMin);
      const utilPct   = parseFloat(((activeMin / OP_MINUTES_TOTAL) * 100).toFixed(1));
      return { ...ch, kwh: parseFloat(ch.kwh.toFixed(1)), revenue: Math.round(ch.revenue), activeMin, idleMin, utilPct, activeHrs: parseFloat((activeMin/60).toFixed(1)), idleHrs: parseFloat((idleMin/60).toFixed(1)) };
    }).sort((a, b) => b.revenue - a.revenue);

    const totals = {
      sessions: sessions.length,
      kwh:      parseFloat(sessions.reduce((s, x) => s + (parseFloat(x.kwh_used) || 0), 0).toFixed(1)),
      revenue:  Math.round(sessions.reduce((s, x) => s + (parseFloat(x.revenue)  || 0), 0)),
    };

    res.json({ totals, monthData, dayData, stationData, chargerTime, stations, chargers, dateFrom, dateTo });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}

module.exports = { getAnalytics };
