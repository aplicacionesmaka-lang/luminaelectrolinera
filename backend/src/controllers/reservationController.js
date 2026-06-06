const { v4: uuidv4 } = require('uuid');
const { pool } = require('../utils/db');

async function create(req, res) {
  try {
    const { stationId, chargePointId, reservedDate, timeSlot, durationHours = 1 } = req.body;
    if (!stationId || !chargePointId || !reservedDate || timeSlot == null)
      return res.status(400).json({ error: 'stationId, chargePointId, reservedDate y timeSlot son requeridos' });

    // Check availability for requested slots
    const slots = [];
    for (let h = 0; h < durationHours; h++) slots.push((timeSlot + h) % 24);

    const { rows: conflicts } = await pool.query(
      `SELECT time_slot FROM reservations
       WHERE charge_point_id=$1 AND reserved_date=$2 AND time_slot=ANY($3) AND status!='Cancelled'`,
      [chargePointId, reservedDate, slots]
    );
    if (conflicts.length > 0) {
      return res.status(409).json({ error: `Franja ${conflicts.map(c => c.time_slot + ':00').join(', ')} ya reservada` });
    }

    const id = uuidv4();
    await pool.query(
      `INSERT INTO reservations (id, user_id, station_id, charge_point_id, reserved_date, time_slot, duration_hours)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [id, req.user.uid, stationId, chargePointId, reservedDate, parseInt(timeSlot), parseInt(durationHours)]
    );

    // Get station name for response
    const { rows: st } = await pool.query('SELECT name, city FROM stations WHERE id=$1', [stationId]);
    res.status(201).json({
      id, stationId, chargePointId, reservedDate, timeSlot, durationHours,
      stationName: st[0]?.name, city: st[0]?.city, status: 'Confirmed',
    });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Franja ya reservada' });
    res.status(500).json({ error: err.message });
  }
}

async function myReservations(req, res) {
  try {
    const { rows } = await pool.query(`
      SELECT r.*, s.name as station_name, s.city, s.address
      FROM reservations r
      LEFT JOIN stations s ON s.id = r.station_id
      WHERE r.user_id=$1 AND r.reserved_date >= CURRENT_DATE
      ORDER BY r.reserved_date, r.time_slot
    `, [req.user.uid]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function cancel(req, res) {
  try {
    const { rows } = await pool.query('SELECT * FROM reservations WHERE id=$1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Reserva no encontrada' });
    if (rows[0].user_id !== req.user.uid && req.user.role !== 'admin')
      return res.status(403).json({ error: 'Sin permisos' });

    await pool.query("UPDATE reservations SET status='Cancelled' WHERE id=$1", [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function availability(req, res) {
  try {
    const { chargePointId, date } = req.query;
    if (!chargePointId || !date) return res.status(400).json({ error: 'chargePointId y date requeridos' });

    const { rows } = await pool.query(
      `SELECT time_slot, duration_hours FROM reservations
       WHERE charge_point_id=$1 AND reserved_date=$2 AND status!='Cancelled'`,
      [chargePointId, date]
    );

    const occupied = new Set();
    rows.forEach(r => {
      for (let h = 0; h < r.duration_hours; h++) occupied.add((r.time_slot + h) % 24);
    });

    const slots = Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      label: `${String(h).padStart(2, '0')}:00`,
      available: !occupied.has(h),
    }));

    res.json(slots);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { create, myReservations, cancel, availability };
