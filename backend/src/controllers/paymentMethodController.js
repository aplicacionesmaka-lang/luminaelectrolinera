const { v4: uuidv4 } = require('uuid');
const { pool } = require('../utils/db');

async function list(req, res) {
  const { rows } = await pool.query(
    'SELECT * FROM payment_methods WHERE user_id=$1 ORDER BY is_favorite DESC, created_at DESC',
    [req.user.uid]
  );
  res.json(rows);
}

async function add(req, res) {
  try {
    const { type, franchise, lastFour, holderName, expMonth, expYear } = req.body;
    if (!type || !franchise || !lastFour)
      return res.status(400).json({ error: 'type, franchise y lastFour son requeridos' });

    // First card becomes favorite automatically
    const { rows: existing } = await pool.query(
      'SELECT COUNT(*) as cnt FROM payment_methods WHERE user_id=$1 AND active=true', [req.user.uid]
    );
    const isFav = parseInt(existing[0].cnt) === 0;

    const id = uuidv4();
    const { rows } = await pool.query(
      `INSERT INTO payment_methods (id, user_id, type, franchise, last_four, holder_name, exp_month, exp_year, is_favorite)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [id, req.user.uid, type, franchise, lastFour, holderName || null, expMonth || null, expYear || null, isFav]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function setFavorite(req, res) {
  try {
    const { rows } = await pool.query('SELECT * FROM payment_methods WHERE id=$1 AND user_id=$2', [req.params.id, req.user.uid]);
    if (!rows.length) return res.status(404).json({ error: 'Medio no encontrado' });
    await pool.query('UPDATE payment_methods SET is_favorite=false WHERE user_id=$1', [req.user.uid]);
    await pool.query('UPDATE payment_methods SET is_favorite=true  WHERE id=$1',      [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function toggle(req, res) {
  try {
    const { rows } = await pool.query('SELECT * FROM payment_methods WHERE id=$1 AND user_id=$2', [req.params.id, req.user.uid]);
    if (!rows.length) return res.status(404).json({ error: 'Medio no encontrado' });
    await pool.query('UPDATE payment_methods SET active=$1 WHERE id=$2', [!rows[0].active, req.params.id]);
    res.json({ ok: true, active: !rows[0].active });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function remove(req, res) {
  try {
    const { rows } = await pool.query('SELECT * FROM payment_methods WHERE id=$1 AND user_id=$2', [req.params.id, req.user.uid]);
    if (!rows.length) return res.status(404).json({ error: 'Medio no encontrado' });
    await pool.query('DELETE FROM payment_methods WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { list, add, setFavorite, toggle, remove };
