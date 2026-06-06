require('dotenv').config();
const bcrypt     = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { Pool }   = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false });
const PRICE_KWH  = 1200;
const MASTER_UID = 'dba7cd95-6981-4a76-a8e5-f6c9fc58883b';

const SAMPLE_USERS = [
  { name: 'Ana Gómez',      email: 'ana.gomez@test.com',     password: 'lumina123', targetKwh: 620, city: 'Barranquilla' },
  { name: 'Carlos Peña',    email: 'carlos.pena@test.com',   password: 'lumina123', targetKwh: 510, city: 'Santa Marta' },
  { name: 'Laura Torres',   email: 'laura.torres@test.com',  password: 'lumina123', targetKwh: 340, city: 'Barranquilla' },
  { name: 'Miguel Ramos',   email: 'miguel.ramos@test.com',  password: 'lumina123', targetKwh: 210, city: 'Santa Marta' },
  { name: 'Sofía Vargas',   email: 'sofia.vargas@test.com',  password: 'lumina123', targetKwh: 130, city: 'Barranquilla' },
  { name: 'Juan Martínez',  email: 'juan.martinez@test.com', password: 'lumina123', targetKwh: 80,  city: 'Barranquilla' },
  { name: 'Valentina Cruz', email: 'vale.cruz@test.com',     password: 'lumina123', targetKwh: 55,  city: 'Santa Marta' },
  { name: 'Diego Herrera',  email: 'diego.h@test.com',       password: 'lumina123', targetKwh: 30,  city: 'Barranquilla' },
  { name: 'Isabela Mora',   email: 'isabela.m@test.com',     password: 'lumina123', targetKwh: 18,  city: 'Santa Marta' },
  { name: 'Sebastián Ruiz', email: 'seba.ruiz@test.com',     password: 'lumina123', targetKwh: 8,   city: 'Barranquilla' },
];

// Cada estación tiene exactamente 2 cargadores DC: uno CCS1 y uno CCS2
const EQ = {
  CCS1_120: { model: 'HT-ED-120-CCS1', maxPowerKw: 120, connectors: 1, connectorType: 'CCS1', chargerType: 'DC' },
  CCS2_120: { model: 'HT-ED-120-CCS2', maxPowerKw: 120, connectors: 1, connectorType: 'CCS2', chargerType: 'DC' },
  CCS1_60:  { model: 'HT-ED-060-CCS1', maxPowerKw: 60,  connectors: 1, connectorType: 'CCS1', chargerType: 'DC' },
  CCS2_60:  { model: 'HT-ED-060-CCS2', maxPowerKw: 60,  connectors: 1, connectorType: 'CCS2', chargerType: 'DC' },
};

const OCCUPANCY = {
  DC: { sessionsPerDay: 13, avgMinutes: 35, varianceMin: 10 },
};

const STATIONS = [
  { id: 'baq-buenavista', name: 'C.C. Buenavista',      city: 'Barranquilla', address: 'Cra. 53 #98-99, Barranquilla',       lat: 10.9985, lng: -74.8178,
    chargers: [{ id: 'CP-BAQ-BV-01', ...EQ.CCS1_120 }, { id: 'CP-BAQ-BV-02', ...EQ.CCS2_120 }] },
  { id: 'baq-via40',      name: 'Parque Vía 40',         city: 'Barranquilla', address: 'Vía 40 #36-135, Barranquilla',        lat: 10.9927, lng: -74.8050,
    chargers: [{ id: 'CP-BAQ-V40-01', ...EQ.CCS1_120 }, { id: 'CP-BAQ-V40-02', ...EQ.CCS2_120 }] },
  { id: 'baq-portal',     name: 'Portal del Prado',      city: 'Barranquilla', address: 'Cra. 54 #72-80, Barranquilla',        lat: 10.9830, lng: -74.8109,
    chargers: [{ id: 'CP-BAQ-PP-01', ...EQ.CCS1_60 },  { id: 'CP-BAQ-PP-02', ...EQ.CCS2_60 }] },
  { id: 'smt-arrecifes',  name: 'Playa Arrecifes',       city: 'Santa Marta',  address: 'Parque Tayrona Km 19, Santa Marta',   lat: 11.3230, lng: -74.0580,
    chargers: [{ id: 'CP-SMT-ARR-01', ...EQ.CCS1_60 },  { id: 'CP-SMT-ARR-02', ...EQ.CCS2_60 }] },
  { id: 'smt-oceanmak',   name: 'Ocean Mall',            city: 'Santa Marta',  address: 'Cra. 1C #26-40, Santa Marta',         lat: 11.2408, lng: -74.2119,
    chargers: [{ id: 'CP-SMT-OCM-01', ...EQ.CCS1_120 }, { id: 'CP-SMT-OCM-02', ...EQ.CCS2_120 }] },
  { id: 'smt-rodadero',   name: 'El Rodadero Centro',    city: 'Santa Marta',  address: 'Cra. 2 #6-19, El Rodadero',           lat: 11.2067, lng: -74.2336,
    chargers: [{ id: 'CP-SMT-ROD-01', ...EQ.CCS1_120 }, { id: 'CP-SMT-ROD-02', ...EQ.CCS2_120 }] },
];

const rnd    = (a, b) => Math.random() * (b - a) + a;
const rndInt = (a, b) => Math.floor(rnd(a, b + 1));

function buildSlots(count, day) {
  return Array.from({ length: count }, () => {
    const r = Math.random();
    const hour = r < 0.35 ? rndInt(11, 14) : r < 0.70 ? rndInt(17, 20) : rndInt(7, 22);
    const d = new Date(day);
    d.setHours(hour, rndInt(0, 59), 0, 0);
    return d;
  });
}

function generateSessions(charger, stationId, city) {
  const sessions = [];
  const occ = OCCUPANCY[charger.chargerType];
  const now = new Date();
  const cursor = new Date(now); cursor.setMonth(cursor.getMonth() - 3); cursor.setHours(0,0,0,0);

  while (cursor < now) {
    const dow = cursor.getDay();
    const factor = (dow === 0 || dow === 6) ? 1.2 : (dow === 1 ? 0.85 : 1.0);
    const count = Math.round(occ.sessionsPerDay * factor * rnd(0.85, 1.15));
    for (const startedAt of buildSlots(count, cursor)) {
      const durMin  = Math.max(10, occ.avgMinutes + rndInt(-occ.varianceMin, occ.varianceMin));
      const endedAt = new Date(startedAt.getTime() + durMin * 60000);
      if (endedAt > now) continue;
      const kwhUsed = parseFloat((charger.maxPowerKw * (durMin / 60) * rnd(0.80, 0.95)).toFixed(2));
      sessions.push({ chargePointId: charger.id, stationId, city, userId: MASTER_UID, kwhUsed, cost: Math.round(kwhUsed * PRICE_KWH), startedAt: startedAt.toISOString(), endedAt: endedAt.toISOString() });
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return sessions;
}

function generateUserSessions(uid, targetKwh, allChargers) {
  const sessions = [];
  let accumulated = 0;
  const now = new Date();
  const start = new Date(now); start.setMonth(start.getMonth() - 3);

  while (accumulated < targetKwh) {
    const ch = allChargers[Math.floor(Math.random() * allChargers.length)];
    const occ = OCCUPANCY[ch.chargerType];
    const durMin = Math.max(10, occ.avgMinutes + rndInt(-occ.varianceMin, occ.varianceMin));
    const kwhUsed = parseFloat((ch.maxPowerKw * (durMin / 60) * rnd(0.80, 0.95)).toFixed(2));
    const startedAt = new Date(start.getTime() + Math.random() * (now - start));
    const endedAt   = new Date(startedAt.getTime() + durMin * 60000);
    if (endedAt > now) continue;
    sessions.push({ chargePointId: ch.id, stationId: ch.stationId, city: ch.city, userId: uid, kwhUsed, cost: Math.round(kwhUsed * PRICE_KWH), startedAt: startedAt.toISOString(), endedAt: endedAt.toISOString() });
    accumulated += kwhUsed;
  }
  return sessions;
}

async function insertSessions(sessions) {
  for (let i = 0; i < sessions.length; i += 100) {
    const chunk = sessions.slice(i, i + 100);
    const values = chunk.map((s, j) => {
      const base = j * 7;
      return `($${base+1},$${base+2},$${base+3},$${base+4},$${base+5},'Completed',$${base+6},$${base+7})`;
    }).join(',');
    const params = chunk.flatMap(s => [uuidv4(), s.userId, s.chargePointId, s.stationId, s.city, s.kwhUsed, s.cost]);
    // Add timestamps separately
    const valuesWithTs = chunk.map((s, j) => {
      const base = j * 9;
      return `($${base+1},$${base+2},$${base+3},$${base+4},$${base+5},'Completed',$${base+6},$${base+7},$${base+8},$${base+9})`;
    }).join(',');
    const paramsWithTs = chunk.flatMap(s => [uuidv4(), s.userId, s.chargePointId, s.stationId, s.city, s.kwhUsed, s.cost, s.startedAt, s.endedAt]);
    await pool.query(
      `INSERT INTO sessions (id, user_id, charge_point_id, station_id, city, status, kwh_used, cost, started_at, ended_at) VALUES ${valuesWithTs}`,
      paramsWithTs
    );
  }
}

async function seed() {
  console.log('🌱 Seed Lumina (PostgreSQL)\n');

  // Limpiar
  await pool.query('TRUNCATE reservations, sessions, chargers, stations, users RESTART IDENTITY CASCADE');
  console.log('🗑  Tablas limpias');

  // Admin user
  const adminHash = await bcrypt.hash('Qcute.2070*', 10);
  await pool.query(
    `INSERT INTO users (id, name, email, password_hash, id_tag, balance, role, active, city) VALUES ($1,$2,$3,$4,$5,0,'admin',true,'Barranquilla')`,
    [MASTER_UID, 'Master Maka', 'master@maka.com', adminHash, 'LM-DBA7CD95']
  );
  console.log('✅ Admin master@maka.com creado');

  // Usuarios de ejemplo
  const hash = await bcrypt.hash('lumina123', 10);
  const userIds = [];
  for (const u of SAMPLE_USERS) {
    const uid   = uuidv4();
    const idTag = `LM-${uid.slice(0, 8).toUpperCase()}`;
    await pool.query(
      `INSERT INTO users (id, name, email, password_hash, id_tag, balance, role, active, city) VALUES ($1,$2,$3,$4,$5,5000,'user',true,$6)`,
      [uid, u.name, u.email, hash, idTag, u.city]
    );
    userIds.push({ uid, ...u });
  }
  console.log(`✅ ${SAMPLE_USERS.length} usuarios demo creados`);

  // Estaciones y cargadores
  let totSess = 0, totKwh = 0, totRev = 0;
  const allChargers = [];

  for (const st of STATIONS) {
    await pool.query(
      `INSERT INTO stations (id, name, city, address, lat, lng, price_per_kwh) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [st.id, st.name, st.city, st.address, st.lat, st.lng, PRICE_KWH]
    );
    for (const ch of st.chargers) {
      await pool.query(
        `INSERT INTO chargers (id, charge_point_id, station_id, model, connectors, connector_type, charger_type, max_power_kw, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'Available')`,
        [ch.id, ch.id, st.id, ch.model, ch.connectors, ch.connectorType, ch.chargerType, ch.maxPowerKw]
      );
      allChargers.push({ ...ch, stationId: st.id, city: st.city });

      const sessions = generateSessions(ch, st.id, st.city);
      await insertSessions(sessions);
      const skwh = sessions.reduce((s, x) => s + x.kwhUsed, 0);
      const srev = sessions.reduce((s, x) => s + x.cost, 0);
      totKwh += skwh; totRev += srev; totSess += sessions.length;
      console.log(`  ⚡ ${ch.id.padEnd(20)} ${sessions.length.toString().padStart(4)} sesiones | ${skwh.toFixed(0).padStart(7)} kWh`);
    }
  }

  // Sesiones por usuario
  console.log('\n🎯 Generando historial por cliente...');
  for (const u of userIds) {
    const sess = generateUserSessions(u.uid, u.targetKwh, allChargers);
    await insertSessions(sess);
    totSess += sess.length;
    const lvl = u.targetKwh >= 500 ? '💎' : u.targetKwh >= 200 ? '🥇' : u.targetKwh >= 50 ? '🥈' : '🥉';
    console.log(`  ${lvl.padEnd(12)} ${u.name.padEnd(20)} ~${u.targetKwh} kWh → ${sess.length} sesiones`);
  }

  console.log('\n─────────────────────────────────────────────────');
  console.log(`✅ Sesiones totales : ${totSess}`);
  console.log(`⚡ Total kWh        : ${totKwh.toFixed(0)}`);
  console.log(`💰 Ingresos         : $${totRev.toLocaleString('es-CO')} COP`);
  console.log('─────────────────────────────────────────────────');
  console.log('\n🎉 Seed completado.');
  await pool.end();
}

seed().catch(err => { console.error('❌', err.message); process.exit(1); });
