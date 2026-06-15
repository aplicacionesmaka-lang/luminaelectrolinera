require('dotenv').config();
const XLSX  = require('xlsx');
const path  = require('path');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const { rows } = await pool.query(
    `SELECT charge_point_id, model, max_power_kw, ocpp_password
     FROM chargers
     WHERE charge_point_id LIKE 'LUM22KW%'
     ORDER BY charge_point_id`
  );
  await pool.end();

  const wb = XLSX.utils.book_new();

  // ─── Sheet 1: OCPP Configuration ─────────────────────────────────────────
  const configRows = [[
    '#', 'ChargePoint ID', 'Password', 'Model', 'Power',
    'Central System URL (with credentials)',
    'Protocol', 'Status',
  ]];

  rows.forEach((r, i) => {
    const cpId = r.charge_point_id;
    const pwd  = r.ocpp_password;
    configRows.push([
      i + 1,
      cpId,
      pwd,
      r.model || 'HT-EA-022-C-D',
      `${r.max_power_kw || 22} kW AC`,
      `ws://${cpId}:${pwd}@api.lumina.69.62.64.153.nip.io/ocpp/${cpId}`,
      'OCPP 1.6J',
      'Pre-configured – Awaiting installation',
    ]);
  });

  const ws1 = XLSX.utils.aoa_to_sheet(configRows);
  ws1['!cols'] = [
    { wch: 4 },   // #
    { wch: 14 },  // ChargePoint ID
    { wch: 18 },  // Password
    { wch: 18 },  // Model
    { wch: 10 },  // Power
    { wch: 80 },  // URL
    { wch: 12 },  // Protocol
    { wch: 36 },  // Status
  ];
  XLSX.utils.book_append_sheet(wb, ws1, 'OCPP Configuration');

  // ─── Sheet 2: Setup Instructions ─────────────────────────────────────────
  const instructions = [
    ['LUMINA ELECTROLINERAS — OCPP SETUP INSTRUCTIONS'],
    [''],
    ['OVERVIEW'],
    ['Each charging unit must be configured to connect to the Lumina Central System'],
    ['using the OCPP 1.6J protocol over a secure WebSocket connection with Basic Authentication.'],
    [''],
    ['CONNECTION PARAMETERS'],
    ['Parameter', 'Value'],
    ['Protocol', 'OCPP 1.6J (WebSocket)'],
    ['Connection type', 'ws:// with Basic Authentication'],
    ['Port', '80'],
    ['Heartbeat interval', '60 seconds'],
    ['Authentication', 'HTTP Basic Auth (Username = ChargePoint ID, Password = assigned per unit)'],
    [''],
    ['URL FORMAT'],
    ['  ws://{ChargePointID}:{Password}@api.lumina.69.62.64.153.nip.io/ocpp/{ChargePointID}'],
    [''],
    ['  Example for unit LUM22KW01:'],
    ['  ws://LUM22KW01:CBAD97A0A15AD341@api.lumina.69.62.64.153.nip.io/ocpp/LUM22KW01'],
    [''],
    ['HOW TO CONFIGURE EACH UNIT'],
    [''],
    ['Step 1 — Identify the unit number'],
    ['   Find the unit number in the "OCPP Configuration" sheet.'],
    ['   Each unit has a unique ChargePoint ID and Password assigned.'],
    [''],
    ['Step 2 — Access the charger configuration interface'],
    ['   Connect to the charger via its local web interface or'],
    ['   the Hengtong manufacturer configuration tool.'],
    [''],
    ['Step 3 — Set the Central System URL'],
    ['   Navigate to: OCPP Settings → Central System URL (or Backend URL)'],
    ['   Enter the full URL from column F of the configuration sheet.'],
    ['   The URL already includes the credentials embedded:'],
    ['   ws://{ChargePointID}:{Password}@api.lumina.69.62.64.153.nip.io/ocpp/{ChargePointID}'],
    [''],
    ['   NOTE: Some charger interfaces have separate fields for:'],
    ['     - Server address:  api.lumina.69.62.64.153.nip.io'],
    ['     - Path:            /ocpp/{ChargePointID}'],
    ['     - Username:        {ChargePoint ID}  (same as the ID)'],
    ['     - Password:        {Password from column C}'],
    [''],
    ['Step 4 — Set the ChargePoint Identity / Station ID'],
    ['   Enter the ChargePoint ID (column B) in the "ChargePoint Identity" field.'],
    ['   Example: LUM22KW01'],
    [''],
    ['Step 5 — Set the OCPP protocol version'],
    ['   Select: OCPP 1.6J  or  OCPP 1.6 JSON (WebSocket)'],
    ['   Do NOT select OCPP 1.5 SOAP or OCPP 2.0.'],
    [''],
    ['Step 6 — Set the Heartbeat interval'],
    ['   Set the heartbeat interval to 60 seconds.'],
    [''],
    ['Step 7 — Save and reboot'],
    ['   Save the configuration and restart the unit.'],
    ['   The charger will send a BootNotification to the Central System.'],
    ['   A successful connection will be confirmed by the Lumina admin panel.'],
    [''],
    ['VERIFICATION'],
    ['   After connection, the Lumina admin panel shows the unit as'],
    ['   "OCPP Connected" with a green indicator.'],
    ['   Admin panel: http://api.lumina.69.62.64.153.nip.io/admin'],
    [''],
    ['SECURITY NOTICE'],
    ['   Each unit has a unique password. Do not share passwords between units.'],
    ['   Keep this document confidential.'],
    [''],
    ['SUPPORT'],
    ['   Technical contact: aplicacionesmaka@gmail.com'],
    ['   Platform: Lumina Electrolineras — www.luminaelectrolineras.com'],
  ];

  const ws2 = XLSX.utils.aoa_to_sheet(instructions);
  ws2['!cols'] = [{ wch: 78 }, { wch: 78 }];
  XLSX.utils.book_append_sheet(wb, ws2, 'Setup Instructions');

  // ─── Save ─────────────────────────────────────────────────────────────────
  const outPath = path.join(__dirname, 'Lumina_OCPP_Configuration.xlsx');
  XLSX.writeFile(wb, outPath);
  console.log(`\n✅ Excel generado: ${outPath}\n`);
}

run().catch(err => { console.error(err); process.exit(1); });
