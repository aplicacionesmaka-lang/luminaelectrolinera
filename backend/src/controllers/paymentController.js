const { pool }  = require('../utils/db');
const { v4: uuid } = require('uuid');
const wompi     = require('../services/wompi');
const payu      = require('../services/payu');
const nequi     = require('../services/nequi');

const API_URL   = process.env.API_URL || 'http://localhost:3001';

// ── helpers ──────────────────────────────────────────────────────────────────

async function creditBalance(userId, amount, paymentId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      'UPDATE users SET balance = balance + $1 WHERE id = $2',
      [amount, userId]
    );
    await client.query(
      "UPDATE payments SET status = 'Approved', updated_at = NOW() WHERE id = $1",
      [paymentId]
    );
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function createPendingPayment({ userId, amount, provider, reference, metadata }) {
  const id = uuid();
  await pool.query(
    `INSERT INTO payments (id, user_id, amount, provider, status, reference, metadata)
     VALUES ($1,$2,$3,$4,'Pending',$5,$6)`,
    [id, userId, amount, provider, reference, JSON.stringify(metadata || {})]
  );
  return id;
}

// ── POST /api/payments/topup ─────────────────────────────────────────────────
async function topup(req, res) {
  try {
    const { amount, provider = 'wompi', returnUrl } = req.body;
    if (!amount || amount < 5000)
      return res.status(400).json({ error: 'Monto mínimo: $5.000 COP' });

    const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    const user = rows[0];
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    const base  = `LM-${req.user.id.slice(0, 8).toUpperCase()}`;
    const ref   = `${base}-${Date.now()}`;
    let data;

    if (provider === 'wompi') {
      data = wompi.createPayment({
        amount,
        userId:    req.user.id,
        email:     user.email,
        fullName:  user.name,
        phone:     user.phone || '3000000000',
        returnUrl: returnUrl || 'lumina://payment/result',
      });

    } else if (provider === 'payu') {
      data = payu.createPayment({
        amount,
        reference:       ref,
        email:           user.email,
        fullName:        user.name,
        phone:           user.phone || '3000000000',
        description:     'Recarga saldo Lumina',
        returnUrl:       returnUrl || 'lumina://payment/result',
        confirmationUrl: `${API_URL}/api/payments/payu/webhook`,
      });

    } else if (provider === 'nequi') {
      data = await nequi.createPayment({
        amount,
        reference: ref,
        phone:     user.phone || '3000000000',
        description: 'Recarga saldo Lumina',
      });

    } else {
      return res.status(400).json({ error: 'Pasarela no soportada. Usa: wompi, payu, nequi' });
    }

    await createPendingPayment({
      userId:    req.user.id,
      amount,
      provider,
      reference: data.reference || ref,
      metadata:  data,
    });

    res.json(data);
  } catch (err) {
    console.error('topup error:', err);
    res.status(500).json({ error: err.message });
  }
}

// ── POST /api/payments/wompi/webhook ─────────────────────────────────────────
async function wompiWebhook(req, res) {
  try {
    const checksum = req.headers['x-event-checksum'];
    if (!wompi.verifyWebhook(req.body, checksum))
      return res.status(400).json({ error: 'Firma inválida' });

    const tx = req.body?.data?.transaction;
    if (tx?.status !== 'APPROVED') return res.json({ ok: true });

    const amount = Math.round(tx.amount_in_cents / 100);
    const { rows } = await pool.query(
      "SELECT * FROM payments WHERE reference = $1 AND status = 'Pending' LIMIT 1",
      [tx.reference]
    );
    if (!rows.length) return res.json({ ok: true });

    const payment = rows[0];
    await pool.query(
      "UPDATE payments SET gateway_ref = $1, updated_at = NOW() WHERE id = $2",
      [tx.id, payment.id]
    );
    await creditBalance(payment.user_id, amount, payment.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('wompi webhook error:', err);
    res.status(500).json({ error: err.message });
  }
}

// ── POST /api/payments/payu/webhook ──────────────────────────────────────────
async function payuWebhook(req, res) {
  try {
    if (!payu.verifyWebhook(req.body))
      return res.status(400).json({ error: 'Firma inválida' });

    if (!payu.isApproved(req.body.transactionState)) return res.json({ ok: true });

    const reference = req.body.referenceCode;
    const amount    = parseFloat(req.body.TX_VALUE);

    const { rows } = await pool.query(
      "SELECT * FROM payments WHERE reference = $1 AND status = 'Pending' LIMIT 1",
      [reference]
    );
    if (!rows.length) return res.json({ ok: true });

    const payment = rows[0];
    await pool.query(
      "UPDATE payments SET gateway_ref = $1, updated_at = NOW() WHERE id = $2",
      [req.body.transactionId || reference, payment.id]
    );
    await creditBalance(payment.user_id, amount, payment.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('payu webhook error:', err);
    res.status(500).json({ error: err.message });
  }
}

// ── POST /api/payments/nequi/webhook ─────────────────────────────────────────
async function nequiWebhook(req, res) {
  try {
    const sig = req.headers['x-nequi-signature'] || req.headers['x-hub-signature-256'];
    if (!nequi.verifyWebhook(req.body, sig))
      return res.status(400).json({ error: 'Firma inválida' });

    const code = req.body?.ResponseMessage?.ResponseHeader?.ResponseCode?.EntityCode;
    if (code !== '0') return res.json({ ok: true });

    const reference = req.body?.ResponseMessage?.ResponseBody?.any?.pushPaymentOutput?.transactionCode
      || req.body?.reference;
    if (!reference) return res.json({ ok: true });

    const { rows } = await pool.query(
      "SELECT * FROM payments WHERE reference = $1 AND status = 'Pending' LIMIT 1",
      [reference]
    );
    if (!rows.length) return res.json({ ok: true });

    await creditBalance(rows[0].user_id, rows[0].amount, rows[0].id);
    res.json({ ok: true });
  } catch (err) {
    console.error('nequi webhook error:', err);
    res.status(500).json({ error: err.message });
  }
}

// ── GET /api/payments/history ─────────────────────────────────────────────────
async function history(req, res) {
  try {
    const { rows } = await pool.query(
      `SELECT id, amount, provider, status, reference, created_at
       FROM payments WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ── GET /api/payments/status/:reference ──────────────────────────────────────
async function checkStatus(req, res) {
  try {
    const { rows } = await pool.query(
      'SELECT id, amount, provider, status, reference, created_at FROM payments WHERE reference = $1 AND user_id = $2',
      [req.params.reference, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Pago no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { topup, wompiWebhook, payuWebhook, nequiWebhook, history, checkStatus };
