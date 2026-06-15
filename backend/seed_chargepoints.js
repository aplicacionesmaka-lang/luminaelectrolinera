require('dotenv').config();
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function seed() {
  const model         = 'HT-EA-022-C-D';
  const maxPowerKw    = 22;
  const connectors    = 1;
  const connectorType = 'Type 2';
  const chargerType   = 'AC';

  console.log('Insertando 42 ChargePoints...\n');

  for (let i = 1; i <= 42; i++) {
    const cpId = `LUM22KW${String(i).padStart(2, '0')}`;
    try {
      await pool.query(
        `INSERT INTO chargers (id, charge_point_id, model, status, connectors, connector_type, charger_type, max_power_kw)
         VALUES ($1, $2, $3, 'Unavailable', $4, $5, $6, $7)
         ON CONFLICT (charge_point_id) DO NOTHING`,
        [uuidv4(), cpId, model, connectors, connectorType, chargerType, maxPowerKw]
      );
      console.log(`✅ ${cpId}  →  ws://api.lumina.69.62.64.153.nip.io/ocpp/${cpId}`);
    } catch (err) {
      console.error(`❌ ${cpId}: ${err.message}`);
    }
  }

  console.log('\n✔ Listo. 42 ChargePoints registrados.');
  await pool.end();
}

seed().catch(err => { console.error(err); process.exit(1); });
