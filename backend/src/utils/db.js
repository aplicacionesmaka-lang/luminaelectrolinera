const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false,
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      email         TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      phone         TEXT,
      id_tag        TEXT UNIQUE,
      balance       NUMERIC DEFAULT 0,
      role          TEXT DEFAULT 'user',
      active        BOOLEAN DEFAULT true,
      city          TEXT,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS stations (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      city          TEXT,
      address       TEXT,
      lat           NUMERIC,
      lng           NUMERIC,
      description   TEXT,
      owner_id      TEXT,
      status        TEXT DEFAULT 'Active',
      price_per_kwh NUMERIC DEFAULT 1200,
      online        BOOLEAN DEFAULT false,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS chargers (
      id             TEXT PRIMARY KEY,
      charge_point_id TEXT UNIQUE NOT NULL,
      station_id     TEXT REFERENCES stations(id),
      model          TEXT,
      connectors     INT DEFAULT 1,
      connector_type TEXT DEFAULT 'CCS2',
      charger_type   TEXT DEFAULT 'DC',
      max_power_kw   NUMERIC DEFAULT 120,
      status         TEXT DEFAULT 'Unavailable',
      current_kwh    NUMERIC DEFAULT 0,
      created_at     TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id              TEXT PRIMARY KEY,
      user_id         TEXT,
      charge_point_id TEXT,
      station_id      TEXT,
      city            TEXT,
      connector_id    INT DEFAULT 1,
      transaction_id  INT,
      status          TEXT DEFAULT 'Active',
      kwh_used        NUMERIC DEFAULT 0,
      cost            NUMERIC DEFAULT 0,
      started_at      TIMESTAMPTZ,
      ended_at        TIMESTAMPTZ
    );
  `);
  console.log('✅ PostgreSQL tables ready');
}

module.exports = { pool, initDb };
