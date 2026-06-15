const crypto = require('crypto');

// Nequi Push to Pay: genera un QR/deeplink para que el usuario pague desde su app Nequi
// Referencia: https://dev.nequi.co

async function createPayment({ amount, reference, phone, description }) {
  const apiKey    = process.env.NEQUI_API_KEY    || '';
  const apiSecret = process.env.NEQUI_API_SECRET || '';
  const env       = process.env.NEQUI_SANDBOX !== 'false' ? 'sandbox' : 'prod';

  const baseUrl = env === 'sandbox'
    ? 'https://sandbox.nequi.com.co'
    : 'https://api.nequi.com';

  // En sandbox/dev retornamos un link simulado sin llamar a la API
  if (!apiKey || env === 'sandbox') {
    return {
      reference,
      provider:   'nequi',
      // Deeplink Nequi: abre la app con el cobro precargado
      deeplink:   `nequi://cobrar?valor=${amount}&concepto=${encodeURIComponent(description || 'Recarga Lumina')}&referencia=${reference}`,
      qrCode:     null,
      phone:      phone || process.env.NEQUI_PHONE || '3000000000',
      amount,
      status:     'Pending',
    };
  }

  // Llamada real a Nequi Push to Pay (requiere credenciales productivas)
  const token = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
  const resp = await fetch(`${baseUrl}/payments/v2/-services-paymentservice-pushpayment`, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Basic ${token}`,
    },
    body: JSON.stringify({
      RequestMessage: {
        RequestHeader: {
          Channel:   '1',
          RequestDate: new Date().toISOString(),
          MessageID: reference,
          ClientID:  apiKey,
          Destination: { ServiceName: 'PaymentService', ServiceOperation: 'pushPayment', ServiceRegion: 'C001', ServiceVersion: '1.2.0' },
        },
        RequestBody: {
          any: {
            pushPaymentInput: {
              commerceCode: apiKey,
              value:        String(amount),
              phoneNumber:  phone,
              reference,
            },
          },
        },
      },
    }),
  });

  const data = await resp.json();
  const code = data?.ResponseMessage?.ResponseHeader?.ResponseCode?.EntityCode;

  return {
    reference,
    provider: 'nequi',
    deeplink: `nequi://cobrar?valor=${amount}&referencia=${reference}`,
    phone,
    amount,
    status: code === '0' ? 'Pending' : 'Error',
    raw: data,
  };
}

function verifyWebhook(body, signature) {
  if (!process.env.NEQUI_WEBHOOK_SECRET) return true;
  const expected = crypto
    .createHmac('sha256', process.env.NEQUI_WEBHOOK_SECRET)
    .update(JSON.stringify(body))
    .digest('hex');
  return expected === signature;
}

module.exports = { createPayment, verifyWebhook };
