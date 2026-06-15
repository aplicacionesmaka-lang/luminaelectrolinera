const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const { pool } = require('../utils/db');
const { createInvoice } = require('../services/siigo');

const connections = new Map();
const pending     = new Map();

function initOcppServer(httpServer) {
  const wss = new WebSocket.Server({
    server: httpServer,
    handleProtocols: () => 'ocpp1.6',
    path: '/ocpp',
  });

  wss.on('connection', async (ws, req) => {
    const cpId = decodeURIComponent(req.url.replace(/^\/ocpp\/?/, ''));
    if (!cpId) { ws.close(1008, 'Missing ChargePoint ID'); return; }

    // Basic Auth validation
    const authHeader = req.headers['authorization'] || '';
    if (authHeader.startsWith('Basic ')) {
      const decoded = Buffer.from(authHeader.slice(6), 'base64').toString();
      const [user, pass] = decoded.split(':');
      const { rows } = await pool.query(
        'SELECT ocpp_password FROM chargers WHERE charge_point_id=$1', [cpId]
      );
      const expected = rows[0]?.ocpp_password;
      if (!expected || pass !== expected || user !== cpId) {
        console.warn(`🚫 OCPP AUTH FAILED  ${cpId}`);
        ws.close(1008, 'Unauthorized');
        return;
      }
    }
    // Si no envían Basic Auth se acepta igualmente (compatibilidad equipos sin auth config)

    console.log(`🔌 OCPP CONNECT  ${cpId}`);
    connections.set(cpId, ws);
    setChargerField(cpId, { status: 'Connected' });
    ws.on('message', raw => onMessage(cpId, ws, String(raw)));
    ws.on('close',   ()  => onClose(cpId));
    ws.on('error',   err => console.error(`OCPP ERR ${cpId}:`, err.message));
  });

  console.log('⚡ OCPP 1.6J activo en ws://…/ocpp/{chargePointId}');
  return wss;
}

async function onMessage(cpId, ws, raw) {
  let frame;
  try { frame = JSON.parse(raw); } catch { return; }
  const [type, callId, ...rest] = frame;
  if (type === 3) { pending.get(callId)?.resolve(rest[0]); pending.delete(callId); return; }
  if (type === 4) { pending.get(callId)?.reject(new Error(rest[1])); pending.delete(callId); return; }
  if (type !== 2) return;
  const [action, payload] = rest;
  let result = {};
  try {
    switch (action) {
      case 'BootNotification':   result = await onBoot(cpId, payload);        break;
      case 'Heartbeat':          result = onHeartbeat(cpId);                  break;
      case 'Authorize':          result = await onAuthorize(cpId, payload);   break;
      case 'StatusNotification': result = await onStatus(cpId, payload);      break;
      case 'MeterValues':        result = await onMeterValues(cpId, payload); break;
      case 'StartTransaction':   result = await onStartTx(cpId, payload);     break;
      case 'StopTransaction':    result = await onStopTx(cpId, payload);      break;
      default: console.warn(`OCPP unknown action: ${action}`);
    }
  } catch (err) {
    console.error(`OCPP handler error [${action}]:`, err.message);
    send(ws, [4, callId, 'InternalError', err.message, {}]);
    return;
  }
  send(ws, [3, callId, result]);
}

function onClose(cpId) {
  console.log(`🔴 OCPP DISCONNECT ${cpId}`);
  connections.delete(cpId);
  setChargerField(cpId, { status: 'Unavailable' });
}

async function onBoot(cpId, p) {
  const model  = p.chargePointModel  || 'Unknown';
  const vendor = p.chargePointVendor || 'Unknown';
  const { rows } = await pool.query('SELECT id FROM chargers WHERE charge_point_id=$1', [cpId]);
  if (!rows.length) {
    // Auto-registrar equipo nuevo sin estación asignada
    const { v4: uuidv4 } = require('uuid');
    await pool.query(
      `INSERT INTO chargers (id, charge_point_id, model, status, connectors, connector_type, charger_type, max_power_kw)
       VALUES ($1,$2,$3,'Available',1,'CCS2','DC',0) ON CONFLICT (charge_point_id) DO NOTHING`,
      [uuidv4(), cpId, `${vendor} ${model}`.trim()]
    );
    console.log(`🆕 Nuevo equipo detectado y registrado: ${cpId} (${vendor} ${model})`);
  } else {
    await pool.query("UPDATE chargers SET status='Available', model=$2 WHERE charge_point_id=$1", [cpId, `${vendor} ${model}`.trim()]);
  }
  return { status: 'Accepted', currentTime: new Date().toISOString(), interval: 60 };
}

function onHeartbeat() {
  return { currentTime: new Date().toISOString() };
}

async function onAuthorize(_cpId, { idTag }) {
  const user = await findUserByIdTag(idTag);
  if (!user) return { idTagInfo: { status: 'Invalid' } };
  const status = parseFloat(user.balance || 0) >= Number(process.env.MIN_BALANCE || 500) ? 'Accepted' : 'Blocked';
  return { idTagInfo: { status } };
}

async function onStatus(cpId, { status }) {
  await setChargerField(cpId, { status });
  return {};
}

async function onMeterValues(_cpId, { transactionId, meterValue = [] }) {
  const values = {};
  for (const mv of meterValue)
    for (const sv of mv.sampledValue || [])
      values[sv.measurand || 'Energy.Active.Import.Register'] = parseFloat(sv.value);
  const kwh = values['Energy.Active.Import.Register'] ?? values['Energy.Active.Import.Interval'];
  if (transactionId != null && kwh != null)
    await pool.query('UPDATE sessions SET kwh_used=$1 WHERE id=$2', [kwh, String(transactionId)]);
  return {};
}

async function onStartTx(cpId, { connectorId, idTag, meterStart, timestamp }) {
  const user = await findUserByIdTag(idTag);
  if (!user) return { transactionId: 0, idTagInfo: { status: 'Invalid' } };
  if (parseFloat(user.balance || 0) < Number(process.env.MIN_BALANCE || 500))
    return { transactionId: 0, idTagInfo: { status: 'Blocked' } };

  const transactionId = Date.now();
  const { rows: chargers } = await pool.query('SELECT station_id FROM chargers WHERE charge_point_id=$1', [cpId]);
  const stationId = chargers[0]?.station_id || null;

  await pool.query(
    `INSERT INTO sessions (id, user_id, charge_point_id, station_id, connector_id, transaction_id, status, kwh_used, cost, started_at)
     VALUES ($1,$2,$3,$4,$5,$6,'Active',0,0,$7)`,
    [String(transactionId), user.id, cpId, stationId, parseInt(connectorId), transactionId, timestamp || new Date().toISOString()]
  );
  await setChargerField(cpId, { status: 'Charging' });
  return { transactionId, idTagInfo: { status: 'Accepted' } };
}

async function onStopTx(cpId, { transactionId, meterStop, timestamp }) {
  const { rows } = await pool.query('SELECT * FROM sessions WHERE id=$1', [String(transactionId)]);
  if (!rows.length) return { idTagInfo: { status: 'Invalid' } };

  const session  = rows[0];
  const kwhUsed  = Math.max(0, parseFloat(meterStop) - (parseFloat(session.meter_start) || 0));
  const priceKwh = Number(process.env.PRICE_PER_KWH || 1200);
  const cost     = Math.round(kwhUsed * priceKwh);

  await pool.query(
    `UPDATE sessions SET kwh_used=$1, cost=$2, status='Completed', ended_at=$3 WHERE id=$4`,
    [kwhUsed, cost, timestamp || new Date().toISOString(), String(transactionId)]
  );
  await pool.query('UPDATE users SET balance=GREATEST(0,balance-$1) WHERE id=$2', [cost, session.user_id]);
  await setChargerField(cpId, { status: 'Available' });

  createInvoice({ reference: transactionId, userId: session.user_id, amount: cost, name: '', email: '' })
    .catch(err => console.error('Siigo invoice error:', err.message));

  return { idTagInfo: { status: 'Accepted' } };
}

function remoteStart(chargePointId, connectorId, idTag) {
  return call(chargePointId, 'RemoteStartTransaction', { connectorId: parseInt(connectorId), idTag });
}

function remoteStop(chargePointId, transactionId) {
  return call(chargePointId, 'RemoteStopTransaction', { transactionId: parseInt(transactionId) });
}

function call(chargePointId, action, payload) {
  return new Promise((resolve, reject) => {
    const ws = connections.get(chargePointId);
    if (!ws || ws.readyState !== WebSocket.OPEN)
      return reject(new Error(`Cargador ${chargePointId} no conectado`));
    const callId = uuidv4();
    pending.set(callId, { resolve, reject });
    send(ws, [2, callId, action, payload]);
    setTimeout(() => { if (pending.has(callId)) { pending.delete(callId); reject(new Error(`Timeout ${chargePointId}`)); } }, 30_000);
  });
}

function send(ws, data) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
}

async function setChargerField(cpId, fields) {
  try {
    const sets = Object.entries(fields).map(([k, v], i) => `${k === 'status' ? 'status' : k}=$${i + 2}`).join(',');
    const vals = Object.values(fields);
    if (fields.status !== undefined)
      await pool.query(`UPDATE chargers SET status=$2 WHERE charge_point_id=$1`, [cpId, fields.status]);
  } catch {}
}

async function findUserByIdTag(idTag) {
  const { rows } = await pool.query('SELECT * FROM users WHERE id_tag=$1 LIMIT 1', [idTag]);
  return rows[0] || null;
}

function getConnections() {
  return [...connections.keys()].reduce((acc, id) => { acc[id] = 'Connected'; return acc; }, {});
}

module.exports = { initOcppServer, remoteStart, remoteStop, getConnections };
