/**
 * whatsappClient.js — Singleton de whatsapp-web.js
 * Sin Meta Developers. Solo escanear QR con el celular.
 */
const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");
const qrcode = require("qrcode");

let _qrBase64   = null;   // QR actual en base64 para mostrar en UI
let _status     = "disconnected"; // disconnected | qr_ready | connected
let _client     = null;
let _onMessage  = null;   // callback que registra el webhook handler

function getClient()  { return _client; }
function getStatus()  { return _status; }
function getQR()      { return _qrBase64; }
function onMessage(fn){ _onMessage = fn; }

async function iniciarCliente() {
  if (_client) return;

  _client = new Client({
    authStrategy: new LocalAuth({ dataPath: "C:/makabot/.wwebjs_auth" }),
    puppeteer: {
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    },
  });

  _client.on("qr", async (qr) => {
    _status   = "qr_ready";
    _qrBase64 = await qrcode.toDataURL(qr);
    console.log("📱 QR generado — abre el panel para escanear");
  });

  _client.on("authenticated", () => {
    console.log("🔐 WhatsApp autenticado");
    _status = "authenticated";

    // Si en 90 segundos no llega el evento "ready", reiniciar el cliente
    setTimeout(async () => {
      if (_status === "authenticated") {
        console.warn("⚠️  'ready' no llegó en 90s — reiniciando cliente WhatsApp...");
        try { await _client.destroy(); } catch(_) {}
        _client = null;
        _status = "disconnected";
        setTimeout(iniciarCliente, 3000);
      }
    }, 90000);
  });

  _client.on("ready", () => {
    _status   = "connected";
    _qrBase64 = null;
    console.log("✅ WhatsApp conectado y listo");
  });

  _client.on("disconnected", (reason) => {
    _status = "disconnected";
    _qrBase64 = null;
    _client   = null;
    console.log("⚠️  WhatsApp desconectado:", reason);
    // Reconectar automáticamente en 10 segundos
    setTimeout(iniciarCliente, 10000);
  });

  _client.on("message", async (msg) => {
    if (_onMessage) {
      try { await _onMessage(msg); }
      catch(e) { console.error("Error procesando mensaje WA:", e.message); }
    }
  });

  await _client.initialize();
}

module.exports = { iniciarCliente, getClient, getStatus, getQR, onMessage };
