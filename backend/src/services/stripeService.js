const Stripe = require('stripe');
let _s;
const get = () => _s || (_s = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_'));

async function createPayment({ amount, userId, email }) {
  const pi = await get().paymentIntents.create({
    amount:        amount * 100,
    currency:      'cop',
    metadata:      { userId },
    receipt_email: email,
  });
  return { reference: pi.id, clientSecret: pi.client_secret, provider: 'stripe' };
}

function verifyWebhook(rawBody, sig) {
  return get().webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET || '');
}

module.exports = { createPayment, verifyWebhook };
