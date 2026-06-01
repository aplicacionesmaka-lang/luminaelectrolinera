const { v4: uuidv4 } = require('uuid');
const { pool }       = require('../utils/db');
const { getConnections } = require('../ocpp/server');

async function list(req, res) {
  try {
    const { rows: stations } = await pool.query('SELECT * FROM stations ORDER BY created_at DESC');
    const { rows: chargers } = await pool.query('SELECT * FROM chargers');
    const conns = getConnections();

    const result = stations.map(st => ({
      ...st,
      chargers: chargers
        .filter(c => c.station_id === st.id)
        .map(c => ({ ...c, chargePointId: c.charge_point_id, maxPowerKw: c.max_power_kw, connectorType: c.connector_type, online: !!conns[c.charge_point_id] })),
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function getById(req, res) {
  try {
    const { rows } = await pool.query('SELECT * FROM stations WHERE id=$1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Estación no encontrada' });

    const { rows: chargers } = await pool.query('SELECT * FROM chargers WHERE station_id=$1', [req.params.id]);
    res.json({
      ...rows[0],
      chargers: chargers.map(c => ({ ...c, chargePointId: c.charge_point_id, maxPowerKw: c.max_power_kw, connectorType: c.connector_type })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function create(req, res) {
  try {
    const { name, address, city, lat, lng, description } = req.body;
    if (!name || !address || lat == null || lng == null)
      return res.status(400).json({ error: 'name, address, lat y lng son requeridos' });

    const id = uuidv4();
    const { rows } = await pool.query(
      `INSERT INTO stations (id, name, city, address, lat, lng, description, price_per_kwh)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [id, name, city || 'Colombia', address, parseFloat(lat), parseFloat(lng), description || null, parseFloat(process.env.PRICE_PER_KWH || 1200)]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function update(req, res) {
  try {
    await pool.query('UPDATE stations SET name=$1, city=$2, address=$3 WHERE id=$4',
      [req.body.name, req.body.city, req.body.address, req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { list, getById, create, update };
