const crypto = require('crypto');

const BASE_URL = process.env.PAYU_SANDBOX === 'false'
  ? 'https://checkout.payulatam.com/ppp-web-gateway-payu'
  : 'https://sandbox.checkout.payulatam.com/ppp-web-gateway-payu';

function md5(str) {
  return crypto.createHash('md5').update(str).digest('hex');
}

function createPayment({ amount, reference, email, fullName, phone, description, returnUrl, confirmationUrl }) {
  const merchantId  = process.env.PAYU_MERCHANT_ID || 'TEST';
  const accountId   = process.env.PAYU_ACCOUNT_ID  || 'TEST';
  const apiKey      = process.env.PAYU_API_KEY      || 'TEST';
  const currency    = 'COP';
  const taxBase     = Math.round(amount / 1.19);
  const tax         = amount - taxBase;

  // Firma: apiKey~merchantId~reference~amount~currency
  const sigStr  = `${apiKey}~${merchantId}~${reference}~${amount}~${currency}`;
  const signature = md5(sigStr);

  return {
    reference,
    provider:    'payu',
    checkoutUrl: BASE_URL,
    formData: {
      merchantId,
      accountId,
      description:       description || 'Recarga saldo Lumina',
      referenceCode:     reference,
      amount:            String(amount),
      tax:               String(tax),
      taxReturnBase:     String(taxBase),
      currency,
      signature,
      test:              process.env.PAYU_SANDBOX !== 'false' ? '1' : '0',
      buyerEmail:        email,
      buyerFullName:     fullName,
      buyerPhone:        phone || '3000000000',
      responseUrl:       returnUrl,
      confirmationUrl:   confirmationUrl || `${process.env.API_URL}/api/payments/payu/webhook`,
    },
  };
}

function verifyWebhook({ merchantId, referenceCode, TX_VALUE, currency, transactionState, sign }) {
  const apiKey = process.env.PAYU_API_KEY || 'TEST';
  // ~state_pol~risk_index si aplica — usamos la firma básica
  const expected = md5(`${apiKey}~${merchantId}~${referenceCode}~${TX_VALUE}~${currency}~${transactionState}`);
  return expected === sign;
}

// transactionState: 4=Aprobada, 6=Declinada, 104=Error, 7=Pendiente
function isApproved(transactionState) {
  return String(transactionState) === '4';
}

module.exports = { createPayment, verifyWebhook, isApproved };
