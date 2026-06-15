require('dotenv').config();
const { pool } = require('./src/utils/db');

async function run() {
  const userId = 'dba7cd95-6981-4a76-a8e5-f6c9fc58883b';
  const cpId   = 'CP-BAQ-BV-01';
  const txId   = 9999;

  await pool.query('DELETE FROM sessions WHERE transaction_id = $1', [txId]);
  await pool.query("UPDATE chargers SET status = 'Charging' WHERE charge_point_id = $1", [cpId]);

  const st = await pool.query('SELECT station_id FROM chargers WHERE charge_point_id = $1', [cpId]);
  const stationId = st.rows[0]?.station_id;

  await pool.query(
    `INSERT INTO sessions (user_id, charge_point_id, station_id, transaction_id, status, kwh_used, cost, started_at)
     VALUES ($1,$2,$3,$4,'Active',0,0,NOW())`,
    [userId, cpId, stationId, txId]
  );

  console.log('✅ Sesión iniciada | TX:', txId, '| Estación:', stationId);

  let kwh = 0, tick = 0;
  const iv = setInterval(async () => {
    tick++;
    kwh += 0.0097;
    const cost = Math.round(kwh * 1800);
    await pool.query(
      'UPDATE sessions SET kwh_used=$1, cost=$2 WHERE transaction_id=$3',
      [parseFloat(kwh.toFixed(4)), cost, txId]
    );
    console.log(`⚡ tick ${String(tick).padStart(2)} | ${kwh.toFixed(4)} kWh | $${cost.toLocaleString('es-CO')} COP`);
    if (tick >= 24) {
      clearInterval(iv);
      await pool.query("UPDATE chargers SET status='Available' WHERE charge_point_id=$1", [cpId]);
      await pool.query("UPDATE sessions SET status='Completed', ended_at=NOW() WHERE transaction_id=$1", [txId]);
      console.log('✅ Simulación terminada');
      process.exit(0);
    }
  }, 5000);
}
run().catch(e => { console.error(e.message); process.exit(1); });
