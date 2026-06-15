require('dotenv').config();
const { Pool } = require('pg');
const crypto = require('crypto');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  // 1. Agregar columna ocpp_password si no existe
  await pool.query(`
    ALTER TABLE chargers ADD COLUMN IF NOT EXISTS ocpp_password TEXT;
  `);

  // 2. Generar contraseña para cada cargador que no tenga
  const { rows } = await pool.query(`SELECT id, charge_point_id FROM chargers ORDER BY charge_point_id`);

  console.log('Generando contraseñas OCPP...\n');
  for (const c of rows) {
    const pwd = crypto.randomBytes(8).toString('hex').toUpperCase(); // 16 chars hex
    await pool.query(`UPDATE chargers SET ocpp_password=$1 WHERE id=$2`, [pwd, c.id]);
    console.log(`${c.charge_point_id}  →  ${pwd}`);
  }

  console.log('\n✔ Contraseñas generadas.');
  await pool.end();
}

run().catch(err => { console.error(err); process.exit(1); });
