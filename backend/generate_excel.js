require('dotenv').config();
const XLSX  = require('xlsx');
const path  = require('path');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const SERVER   = 'api.lumina.69.62.64.153.nip.io';
const ADMIN    = `https://${SERVER}/admin`;
const APP_LINK = 'https://expo.dev/artifacts/eas/V0Zcg54y5-vmWeCV4MJjlkET_zZ1_9iL2IQaJ04LeGA.apk';

async function run() {
  const { rows } = await pool.query(
    `SELECT charge_point_id, model, max_power_kw, ocpp_password
     FROM chargers
     WHERE charge_point_id LIKE 'LUM22KW%'
     ORDER BY charge_point_id`
  );
  await pool.end();

  const wb = XLSX.utils.book_new();

  // ─── Sheet 1: OCPP Configuration ──────────────────────────────────────────
  const configRows = [[
    '#', 'ChargePoint ID', 'Password', 'Model', 'Power',
    'Central System URL (with credentials)', 'Protocol', 'Status',
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
      `wss://${cpId}:${pwd}@${SERVER}/ocpp/${cpId}`,
      'OCPP 1.6J',
      'Pre-configured – Awaiting installation',
    ]);
  });

  const ws1 = XLSX.utils.aoa_to_sheet(configRows);
  ws1['!cols'] = [
    { wch: 4 }, { wch: 14 }, { wch: 18 }, { wch: 18 },
    { wch: 10 }, { wch: 82 }, { wch: 12 }, { wch: 36 },
  ];
  XLSX.utils.book_append_sheet(wb, ws1, 'OCPP Configuration');

  // ─── Sheet 2: Setup Instructions ──────────────────────────────────────────
  const exampleCp  = rows[0]?.charge_point_id || 'LUM22KW01';
  const examplePwd = rows[0]?.ocpp_password   || 'XXXX';

  const instructions = [
    ['LUMINA ELECTROLINERAS — OCPP SETUP INSTRUCTIONS'],
    [''],
    ['OVERVIEW'],
    ['Each charging unit must be configured to connect to the Lumina Central System'],
    ['using OCPP 1.6J over a secure encrypted WebSocket (WSS) with Basic Authentication.'],
    [''],
    ['CONNECTION PARAMETERS'],
    ['Parameter',          'Value'],
    ['Protocol',           'OCPP 1.6J (WebSocket Secure)'],
    ['Connection type',    'wss:// (TLS encrypted WebSocket)'],
    ['Port',               '443'],
    ['Heartbeat interval', '60 seconds'],
    ['Authentication',     'HTTP Basic Auth — Username = ChargePoint ID, Password = see column C'],
    [''],
    ['URL FORMAT'],
    ['  wss://{ChargePointID}:{Password}@' + SERVER + '/ocpp/{ChargePointID}'],
    [''],
    [`  Example for unit ${exampleCp}:`],
    [`  wss://${exampleCp}:${examplePwd}@${SERVER}/ocpp/${exampleCp}`],
    [''],
    ['HOW TO CONFIGURE EACH UNIT'],
    [''],
    ['Step 1 — Identify the unit'],
    ['   Each charger has a unique ChargePoint ID and Password in the "OCPP Configuration" sheet.'],
    [''],
    ['Step 2 — Access the charger configuration'],
    ['   Connect via the local web interface or the Hengtong configuration tool.'],
    [''],
    ['Step 3 — Set the Central System URL'],
    ['   Go to: OCPP Settings → Central System URL (or Backend URL)'],
    ['   Enter the full URL from column F for this specific unit:'],
    ['   wss://{ChargePointID}:{Password}@' + SERVER + '/ocpp/{ChargePointID}'],
    [''],
    ['   If the charger has SEPARATE fields for server / username / password:'],
    ['     Server address:  ' + SERVER],
    ['     Path:            /ocpp/{ChargePointID}'],
    ['     Username:        {ChargePoint ID}   (column B)'],
    ['     Password:        {Password}          (column C)'],
    [''],
    ['Step 4 — Set ChargePoint Identity'],
    ['   Enter the ChargePoint ID (column B) in the "ChargePoint Identity" or "Station ID" field.'],
    [''],
    ['Step 5 — OCPP Protocol version'],
    ['   Select: OCPP 1.6J  or  OCPP 1.6 JSON'],
    ['   Do NOT use OCPP 1.5 SOAP or OCPP 2.0.'],
    [''],
    ['Step 6 — Heartbeat interval'],
    ['   Set to 60 seconds.'],
    [''],
    ['Step 7 — Save and reboot'],
    ['   The charger will connect and send a BootNotification.'],
    ['   Status will change to "Available" when successfully registered.'],
    [''],
    ['VERIFICATION'],
    ['   The Lumina admin panel shows each unit as "● OCPP Connected" (green).'],
    ['   Admin panel: ' + ADMIN],
    [''],
    ['USER MOBILE APP'],
    ['   Android APK (v1.0 — production): ' + APP_LINK],
    ['   Download, install and register to test the full charging flow.'],
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
  ws2['!cols'] = [{ wch: 78 }, { wch: 82 }];
  XLSX.utils.book_append_sheet(wb, ws2, 'Setup Instructions');

  // ─── Save ─────────────────────────────────────────────────────────────────
  const outPath = path.join(__dirname, 'Lumina_OCPP_Configuration.xlsx');
  XLSX.writeFile(wb, outPath);
  console.log(`\n✅ Excel generado: ${outPath}\n`);
}

run().catch(err => { console.error(err); process.exit(1); });
