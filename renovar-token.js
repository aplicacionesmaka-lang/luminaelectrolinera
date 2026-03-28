/**
 * renovar-token.js
 * Renueva el token de WhatsApp automáticamente.
 * Ejecutar con: node C:\makabot\renovar-token.js
 * Programado cada 50 días via Task Scheduler de Windows.
 */
const https = require('https');
const fs = require('fs');
const path = require('path');

const APP_ID     = '2135420447233351';
const APP_SECRET = '8aa89102558ff38ed85770ca14717f9e';
const ECO_PATH   = 'C:\\makabot\\ecosystem.config.js';

function getCurrentToken() {
  const eco = fs.readFileSync(ECO_PATH, 'utf8');
  const match = eco.match(/WHATSAPP_TOKEN:\s*'([^']+)'/);
  return match ? match[1] : null;
}

function updateToken(newToken) {
  let eco = fs.readFileSync(ECO_PATH, 'utf8');
  eco = eco.replace(/WHATSAPP_TOKEN:\s*'[^']+'/, `WHATSAPP_TOKEN: '${newToken}'`);
  fs.writeFileSync(ECO_PATH, eco, 'utf8');
}

function renewToken(currentToken) {
  return new Promise((resolve, reject) => {
    const url = `/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${APP_ID}&client_secret=${APP_SECRET}&fb_exchange_token=${currentToken}`;
    const options = { hostname: 'graph.facebook.com', path: url, method: 'GET' };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.access_token) resolve(json);
          else reject(new Error(JSON.stringify(json)));
        } catch(e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  console.log('[' + new Date().toISOString() + '] Iniciando renovación de token WhatsApp...');
  const currentToken = getCurrentToken();
  if (!currentToken) { console.error('No se encontró el token en ecosystem.config.js'); process.exit(1); }

  const result = await renewToken(currentToken);
  const newToken = result.access_token;
  const diasRestantes = Math.floor((result.expires_in || 0) / 86400);

  updateToken(newToken);
  console.log('✅ Token renovado exitosamente');
  console.log('   Expira en: ' + diasRestantes + ' días');
  console.log('   Token (primeros 20 chars): ' + newToken.substring(0, 20) + '...');

  // Reiniciar PM2
  const { execSync } = require('child_process');
  execSync('pm2 restart makabot --update-env', { stdio: 'inherit' });
  console.log('✅ PM2 reiniciado con nuevo token');
}

main().catch(e => { console.error('❌ Error:', e.message); process.exit(1); });
