/**
 * Colecciones Firestore y helpers de acceso
 *
 * Colecciones:
 *   users       — usuarios de la app
 *   stations    — estaciones de carga
 *   chargers    — cargadores físicos (1 station → N chargers)
 *   sessions    — sesiones de carga (transacciones OCPP)
 *   payments    — pagos / recargas de saldo
 *   metrics     — métricas agregadas (kWh, ingresos)
 */

const { getDb } = require('../utils/firebase');

// ─── Esquemas de referencia ────────────────────────────────────────────────

const SCHEMAS = {
  user: {
    uid: '', name: '', email: '', phone: null,
    passwordHash: '', idTag: '',
    balance: 0, role: 'user', active: true,
    createdAt: '',
  },
  station: {
    id: '', name: '', address: '', city: '',
    location: { lat: 0, lng: 0 },
    status: 'Active', pricePerKwh: 1200,
    ownerId: null, createdAt: '',
  },
  charger: {
    chargePointId: '', stationId: '',
    model: '', vendor: '', firmwareVersion: null,
    connectors: 1, maxPowerKw: 120,
    status: 'Unavailable', currentKwh: 0,
    connectorId: null, errorCode: null,
    lastBoot: null, updatedAt: '',
  },
  session: {
    transactionId: 0, chargePointId: '', connectorId: 1,
    userId: '', idTag: '',
    meterStart: 0, meterStop: null,
    currentKwh: 0, kwhUsed: null, cost: null,
    status: 'Active',            // Active | Completed | Error
    reason: null,
    startedAt: '', stoppedAt: null, updatedAt: '',
  },
  payment: {
    userId: '', amount: 0, provider: 'wompi',
    status: 'Pending',           // Pending | Approved | Failed
    reference: '', amountPaid: null,
    createdAt: '', paidAt: null,
  },
};

// ─── Helpers CRUD ─────────────────────────────────────────────────────────

const col = (name) => getDb().collection(name);

async function findOne(collection, field, value) {
  const snap = await col(collection).where(field, '==', value).limit(1).get();
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() };
}

async function findById(collection, id) {
  const snap = await col(collection).doc(id).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() };
}

async function create(collection, id, data) {
  await col(collection).doc(id).set({ ...data, createdAt: new Date().toISOString() });
  return data;
}

async function update(collection, id, data) {
  await col(collection).doc(id).update({ ...data, updatedAt: new Date().toISOString() });
}

async function list(collection, { where: filters = [], orderBy = null, limit = 100 } = {}) {
  let q = col(collection);
  for (const [field, op, val] of filters) q = q.where(field, op, val);
  if (orderBy) q = q.orderBy(orderBy[0], orderBy[1] || 'asc');
  q = q.limit(limit);
  const snap = await q.get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

module.exports = { col, findOne, findById, create, update, list, SCHEMAS };
