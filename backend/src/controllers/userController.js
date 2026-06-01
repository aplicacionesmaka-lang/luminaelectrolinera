const bcrypt  = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { pool }      = require('../utils/db');
const { signToken } = require('../utils/auth');

async function register(req, res) {
  try {
    const { name, email, password, phone, city } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ error: 'name, email y password son requeridos' });

    const uid   = uuidv4();
    const idTag = `LM-${uid.slice(0, 8).toUpperCase()}`;
    const hash  = await bcrypt.hash(password, 10);

    await pool.query(
      `INSERT INTO users (id, name, email, password_hash, phone, id_tag, balance, role, active, city)
       VALUES ($1,$2,$3,$4,$5,$6,0,'user',true,$7)`,
      [uid, name, email, hash, phone || null, idTag, city || null]
    );

    const token = signToken({ uid, email, role: 'user' });
    res.status(201).json({ token, uid, idTag, name, balance: 0, role: 'user' });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email ya registrado' });
    res.status(500).json({ error: err.message });
  }
}

async function login(req, res) {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: 'email y password requeridos' });

    const { rows } = await pool.query('SELECT * FROM users WHERE email=$1 LIMIT 1', [email]);
    if (!rows.length) return res.status(401).json({ error: 'Credenciales inválidas' });

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid)   return res.status(401).json({ error: 'Credenciales inválidas' });
    if (!user.active) return res.status(403).json({ error: 'Cuenta desactivada' });

    const token = signToken({ uid: user.id, email: user.email, role: user.role });
    res.json({ token, uid: user.id, name: user.name, balance: parseFloat(user.balance), idTag: user.id_tag, role: user.role });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function me(req, res) {
  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE id=$1', [req.user.uid]);
    if (!rows.length) return res.status(404).json({ error: 'Usuario no encontrado' });
    const { password_hash, ...u } = rows[0];
    res.json({ ...u, idTag: u.id_tag });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function getBalance(req, res) {
  const { rows } = await pool.query('SELECT balance FROM users WHERE id=$1', [req.user.uid]);
  res.json({ balance: parseFloat(rows[0]?.balance || 0) });
}

async function listUsers(req, res) {
  const { rows } = await pool.query('SELECT id,name,email,phone,id_tag,balance,role,active,city,created_at FROM users ORDER BY created_at DESC');
  res.json(rows.map(u => ({ ...u, idTag: u.id_tag })));
}

function calcLevel(kwhTotal) {
  if (kwhTotal >= 500) return { level: 'Platino', emoji: '💎', min: 500, next: null };
  if (kwhTotal >= 200) return { level: 'Oro',     emoji: '🥇', min: 200, next: 500 };
  if (kwhTotal >= 50)  return { level: 'Plata',   emoji: '🥈', min: 50,  next: 200 };
  return                      { level: 'Bronce',  emoji: '🥉', min: 0,   next: 50  };
}

async function listUsersWithStats(req, res) {
  try {
    const { rows } = await pool.query(`
      SELECT u.id, u.name, u.email, u.city, u.id_tag as "idTag", u.balance, u.role,
             COUNT(s.id)::int          AS sessions,
             COALESCE(SUM(s.kwh_used),0)::numeric AS "kwhTotal",
             COALESCE(SUM(s.cost),0)::numeric     AS "revenueTotal",
             MAX(s.started_at)         AS "lastSession"
      FROM users u
      LEFT JOIN sessions s ON s.user_id = u.id AND s.status = 'Completed'
      GROUP BY u.id
      ORDER BY "kwhTotal" DESC
    `);

    const result = rows.map(u => {
      const kwh = parseFloat(u.kwhTotal);
      const lvl = calcLevel(kwh);
      return {
        ...u,
        balance:      parseFloat(u.balance),
        kwhTotal:     parseFloat(kwh.toFixed(2)),
        revenueTotal: Math.round(parseFloat(u.revenueTotal)),
        ...lvl,
      };
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { register, login, me, getBalance, listUsers, listUsersWithStats, calcLevel };
