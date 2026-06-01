const { getDb }  = require('../utils/firebase');
const wompi      = require('../services/wompi');
const stripeService = require('../services/stripeService');

async function topup(req, res) {
  try {
    const { amount, provider = 'wompi', returnUrl } = req.body;
    if (!amount || amount < 5000) {
      return res.status(400).json({ error: 'Monto mínimo: $5.000 COP' });
    }

    const db   = getDb();
    const user = (await db.collection('users').doc(req.user.uid).get()).data();
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    let data;
    if (provider === 'stripe') {
      data = await stripeService.createPayment({ amount, userId: req.user.uid, email: user.email });
    } else {
      data = await wompi.createPayment({
        amount,
        userId:    req.user.uid,
        email:     user.email,
        fullName:  user.name,
        phone:     user.phone || '3000000000',
        returnUrl: returnUrl || 'lumina://payment/result',
      });
    }

    // Registrar pago pendiente
    await db.collection('payments').add({
      userId:    req.user.uid,
      amount,
      provider,
      status:    'Pending',
      reference: data.reference,
      createdAt: new Date().toISOString(),
    });

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function wompiWebhook(req, res) {
  try {
    const valid = wompi.verifyWebhook(req.body, req.headers['x-event-checksum']);
    if (!valid) return res.status(400).json({ error: 'Firma inválida' });

    const tx = req.body?.data?.transaction;
    if (tx?.status === 'APPROVED') {
      const amount = Math.round(tx.amount_in_cents / 100);
      const db     = getDb();

      const snap = await db.collection('payments')
        .where('reference', '==', tx.reference).limit(1).get();

      if (!snap.empty) {
        const payDoc = snap.docs[0];
        if (payDoc.data().status !== 'Approved') {
          const userRef = db.collection('users').doc(payDoc.data().userId);
          const balance = (await userRef.get()).data()?.balance || 0;
          await userRef.update({ balance: balance + amount });
          await payDoc.ref.update({ status: 'Approved', amountPaid: amount, paidAt: new Date().toISOString() });
          console.log(`💳 Recarga aprobada: ${payDoc.data().userId} +$${amount}`);
        }
      }
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('Wompi webhook error:', err);
    res.status(500).json({ error: err.message });
  }
}

async function stripeWebhook(req, res) {
  try {
    const event = stripeService.verifyWebhook(req.body, req.headers['stripe-signature']);
    if (event.type === 'payment_intent.succeeded') {
      const pi      = event.data.object;
      const userId  = pi.metadata.userId;
      const amount  = Math.round(pi.amount_received / 100);
      const db      = getDb();
      const userRef = db.collection('users').doc(userId);
      const balance = (await userRef.get()).data()?.balance || 0;
      await userRef.update({ balance: balance + amount });
    }
    res.json({ received: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

async function history(req, res) {
  const db   = getDb();
  const snap = await db.collection('payments')
    .where('userId', '==', req.user.uid)
    .orderBy('createdAt', 'desc')
    .limit(30).get();
  res.json(snap.docs.map(d => ({ ...d.data(), id: d.id })));
}

module.exports = { topup, wompiWebhook, stripeWebhook, history };
