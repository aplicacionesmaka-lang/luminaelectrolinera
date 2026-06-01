const axios = require('axios');

const BASE = 'https://api.siigo.com';
let _token = null;
let _tokenExp = 0;

async function getToken() {
  if (_token && Date.now() < _tokenExp) return _token;
  if (!process.env.SIIGO_USERNAME) return null; // dev: skip

  const res = await axios.post(`${BASE}/auth`, {
    username: process.env.SIIGO_USERNAME,
    access_key: process.env.SIIGO_ACCESS_KEY,
  });
  _token    = res.data.access_token;
  _tokenExp = Date.now() + (res.data.expires_in - 60) * 1000;
  return _token;
}

async function createInvoice({ userId, email, name, amount, reference }) {
  const token = await getToken();
  if (!token) {
    console.log(`[Siigo mock] Invoice for ${email} — $${amount} COP — ref: ${reference}`);
    return { id: `MOCK-${reference}`, status: 'mock' };
  }

  const today = new Date().toISOString().slice(0, 10);
  const payload = {
    document:       { id: parseInt(process.env.SIIGO_DOC_ID || '25398') },
    date:           today,
    customer:       { identification: userId.slice(0, 10), name, address: { city: { country_code: 'Co', state_code: '11', city_code: '11001' } } },
    seller:         parseInt(process.env.SIIGO_SELLER_ID || '629'),
    stamp:          { send: true },
    observations:   `Recarga Lumina — ${reference}`,
    items: [{
      code:        process.env.SIIGO_ITEM_CODE || 'RECARGA',
      description: 'Recarga saldo Lumina EV',
      quantity:    1,
      price:       amount,
      taxes:       [],
    }],
    payments: [{
      id:     parseInt(process.env.SIIGO_PAYMENT_ID || '5765'),
      value:  amount,
      due_date: today,
    }],
  };

  try {
    const res = await axios.post(`${BASE}/v1/invoices`, payload, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    return res.data;
  } catch (err) {
    console.error('[Siigo] Invoice error:', err.response?.data || err.message);
    return null;
  }
}

module.exports = { createInvoice };
