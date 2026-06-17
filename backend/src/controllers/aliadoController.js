const { pool } = require('../utils/db');

async function list(_req, res) {
  const { rows } = await pool.query('SELECT * FROM aliados ORDER BY razon_social');
  res.json(rows);
}

async function create(req, res) {
  const { razon_social, nit, direccion, ciudad, contacto, email, telefono } = req.body;
  if (!razon_social || !nit) return res.status(400).json({ error: 'razon_social y nit son requeridos' });
  const { rows } = await pool.query(
    `INSERT INTO aliados (razon_social, nit, direccion, ciudad, contacto, email, telefono)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [razon_social, nit, direccion||null, ciudad||null, contacto||null, email||null, telefono||null]
  );
  res.status(201).json(rows[0]);
}

async function update(req, res) {
  const { razon_social, nit, direccion, ciudad, contacto, email, telefono } = req.body;
  const { rows } = await pool.query(
    `UPDATE aliados SET razon_social=$2, nit=$3, direccion=$4, ciudad=$5, contacto=$6, email=$7, telefono=$8
     WHERE id=$1 RETURNING *`,
    [req.params.id, razon_social, nit, direccion||null, ciudad||null, contacto||null, email||null, telefono||null]
  );
  if (!rows.length) return res.status(404).json({ error: 'Aliado no encontrado' });
  res.json(rows[0]);
}

async function remove(req, res) {
  await pool.query('DELETE FROM aliados WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
}

// Actualizar configuración financiera de una estación
async function updateStationFinancial(req, res) {
  const { aliado_id, cost_per_kwh, commission_pct } = req.body;
  const { rows } = await pool.query(
    `UPDATE stations SET
       aliado_id      = $2,
       cost_per_kwh   = $3,
       commission_pct = $4
     WHERE id=$1 RETURNING id, name, aliado_id, cost_per_kwh, commission_pct`,
    [req.params.stationId, aliado_id||null, parseFloat(cost_per_kwh)||800, parseFloat(commission_pct)||5]
  );
  if (!rows.length) return res.status(404).json({ error: 'Estación no encontrada' });
  res.json(rows[0]);
}

// Reporte de liquidación mensual
async function liquidacion(req, res) {
  const { desde, hasta, aliado_id } = req.query;
  const from = desde || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0,10);
  const to   = hasta || new Date(new Date().getFullYear(), new Date().getMonth()+1, 0).toISOString().slice(0,10);

  const { rows } = await pool.query(`
    SELECT
      st.id                                    AS station_id,
      st.name                                  AS station_name,
      st.city,
      st.price_per_kwh,
      st.cost_per_kwh,
      st.commission_pct,
      al.id                                    AS aliado_id,
      al.razon_social,
      al.nit,
      al.email                                 AS aliado_email,
      al.contacto                              AS aliado_contacto,
      COALESCE(SUM(s.kwh_used), 0)::numeric    AS kwh_total,
      COUNT(s.id)::int                         AS sesiones,
      COALESCE(SUM(s.cost), 0)::numeric        AS venta_bruta
    FROM stations st
    LEFT JOIN aliados al ON al.id = st.aliado_id
    LEFT JOIN sessions s ON s.station_id = st.id
      AND s.status = 'Completed'
      AND s.started_at::date BETWEEN $1 AND $2
    WHERE ($3::uuid IS NULL OR al.id = $3::uuid)
    GROUP BY st.id, al.id
    ORDER BY st.name
  `, [from, to, aliado_id || null]);

  const result = rows.map(r => {
    const kwh          = parseFloat(r.kwh_total)    || 0;
    const ventaBruta   = parseFloat(r.venta_bruta)  || 0;
    const costoPorKwh  = parseFloat(r.cost_per_kwh) || 800;
    const pct          = parseFloat(r.commission_pct)|| 5;
    const costoEnergia = Math.round(kwh * costoPorKwh);
    const comision     = Math.round(ventaBruta * pct / 100);
    const totalAliado  = costoEnergia + comision;
    const netoLumina   = Math.round(ventaBruta - totalAliado);
    return {
      ...r,
      kwh_total:     parseFloat(kwh.toFixed(3)),
      venta_bruta:   Math.round(ventaBruta),
      costo_energia: costoEnergia,
      comision,
      total_aliado:  totalAliado,
      neto_lumina:   netoLumina,
      periodo_desde: from,
      periodo_hasta: to,
    };
  });

  res.json(result);
}

module.exports = { list, create, update, remove, updateStationFinancial, liquidacion };
