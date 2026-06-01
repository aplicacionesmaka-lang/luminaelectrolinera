const crypto = require('crypto');

function createPayment({ amount, userId, email, fullName, phone, returnUrl }) {
  const reference   = `LM-${userId.slice(0, 8).toUpperCase()}-${Date.now()}`;
  const amountCents = amount * 100;

  const integrityChain = `${reference}${amountCents}COP${process.env.WOMPI_PRIVATE_KEY}`;
  const integrityHash  = crypto.createHash('sha256').update(integrityChain).digest('hex');

  const params = new URLSearchParams({
    'public-key':                  process.env.WOMPI_PUBLIC_KEY || 'pub_test_DEMO',
    currency:                      'COP',
    'amount-in-cents':             String(amountCents),
    reference,
    'redirect-url':                returnUrl,
    'signature:integrity':         integrityHash,
    'customer-data:email':         email,
    'customer-data:full-name':     fullName,
    'customer-data:phone-number':  phone,
  });

  return {
    reference,
    provider:     'wompi',
    amountCents,
    checkoutUrl:  `https://checkout.wompi.co/p/?${params.toString()}`,
  };
}

function verifyWebhook(event, checksum) {
  if (!process.env.WOMPI_EVENTS_SECRET) return true; // dev: skip
  const tx = event?.data?.transaction || {};
  const chain = `${tx.id}${tx.status}${tx.amount_in_cents}${tx.currency}${tx.payment_method_type}${tx.reference}${process.env.WOMPI_EVENTS_SECRET}`;
  return crypto.createHash('sha256').update(chain).digest('hex') === checksum;
}

module.exports = { createPayment, verifyWebhook };
