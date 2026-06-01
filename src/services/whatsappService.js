const db = require("../models/db");
const { getClient, getStatus } = require("./whatsappClient");
const { MessageMedia } = require("whatsapp-web.js");
const fetch = require("node-fetch");
const { registrarNotificacion } = require("./recordatorioService");

// Formatea número al chatId de whatsapp-web.js: "573001234567@c.us"
function formatChatId(telefono) {
  let digits = telefono.replace(/\D/g, "");
  // Agregar código de país Colombia (+57) si no lo tiene
  if (digits.length === 10 && digits.startsWith("3")) {
    digits = "57" + digits;
  }
  return `${digits}@c.us`;
}

/**
 * Envía un mensaje de texto
 */
async function enviarMensajeReal(telefono, mensaje) {
  const client = getClient();

  if (!client || getStatus() !== "connected") {
    console.log(`\n📱 [WHATSAPP SIMULADO - no conectado] Para: ${telefono}\n${mensaje}\n─────────────────`);
    return null;
  }

  const chatId = formatChatId(telefono);
  const digits  = chatId.replace("@c.us", "");

  // Intentar hasta 3 formatos de ID para compatibilidad con números migrados a LID
  const intentos = [
    async () => {
      const numberId = await client.getNumberId(digits);
      const id = numberId ? numberId._serialized : chatId;
      return client.sendMessage(id, mensaje);
    },
    async () => client.sendMessage(chatId, mensaje),
    async () => {
      // Buscar en los chats abiertos por número (para números con @lid)
      const chats = await client.getChats();
      const match = chats.find(c => c.id.user === digits || c.id._serialized.includes(digits));
      if (!match) throw new Error("Número no encontrado en chats");
      return client.sendMessage(match.id._serialized, mensaje);
    },
  ];

  let lastErr;
  for (const intento of intentos) {
    try {
      const result = await intento();
      console.log(`📤 WhatsApp enviado a ${chatId}`);
      return result.id._serialized;
    } catch (err) {
      lastErr = err;
      if (!err.message?.includes("LID") && !err.message?.includes("lid")) throw err; // error diferente → no reintentar
    }
  }
  throw lastErr;
}

/**
 * Envía un archivo (imagen/PDF) desde una URL pública o ruta local
 * Usa el mismo mecanismo de fallback LID que enviarMensajeReal.
 */
async function enviarDocumento(telefono, urlArchivo, nombreArchivo, mimeType = "image/jpeg") {
  const client = getClient();

  if (!client || getStatus() !== "connected") {
    console.log(`\n📎 [WA SIMULADO] Documento para ${telefono}: ${urlArchivo}\n─────────────────`);
    return null;
  }

  const chatId = formatChatId(telefono);
  const digits  = chatId.replace("@c.us", "");

  let media;
  if (urlArchivo.startsWith("http")) {
    const res    = await fetch(urlArchivo);
    const buffer = await res.buffer();
    const base64 = buffer.toString("base64");
    media = new MessageMedia(mimeType, base64, nombreArchivo);
  } else {
    media = MessageMedia.fromFilePath(urlArchivo);
  }

  const intentos = [
    async () => {
      const numberId = await client.getNumberId(digits);
      const id = numberId ? numberId._serialized : chatId;
      return client.sendMessage(id, media, { caption: nombreArchivo });
    },
    async () => client.sendMessage(chatId, media, { caption: nombreArchivo }),
    async () => {
      const chats = await client.getChats();
      const match = chats.find(c => c.id.user === digits || c.id._serialized.includes(digits));
      if (!match) throw new Error("Número no encontrado en chats");
      return client.sendMessage(match.id._serialized, media, { caption: nombreArchivo });
    },
  ];

  let lastErr;
  for (const intento of intentos) {
    try {
      const result = await intento();
      console.log(`📎 Documento enviado a ${chatId}`);
      return result.id._serialized;
    } catch (err) {
      lastErr = err;
      if (!err.message?.includes("LID") && !err.message?.includes("lid")) throw err;
    }
  }
  throw lastErr;
}

/**
 * Descarga media de un mensaje entrante de whatsapp-web.js
 */
async function descargarMedia(msg) {
  const media = await msg.downloadMedia();
  if (!media) throw new Error("No se pudo descargar el media");
  return {
    buffer:   Buffer.from(media.data, "base64"),
    mimeType: media.mimetype,
  };
}

/**
 * Envío en lote con registro en BD
 */
async function enviarMensajesLote(mensajes) {
  const resultados = [];

  for (const item of mensajes) {
    if (!item.exito) {
      resultados.push({ proveedor_nit: item.proveedor_nit, estado: "error", error: item.error });
      continue;
    }

    if (!item.telefono) {
      db.prepare(
        "INSERT INTO conversaciones (proveedor_nit, mensaje_enviado, estado) VALUES (?, ?, 'sin_telefono')"
      ).run(item.proveedor_nit, item.mensaje);
      resultados.push({
        proveedor_nit:    item.proveedor_nit,
        proveedor_nombre: item.proveedor_nombre,
        estado:           "sin_telefono",
        mensaje:          "Proveedor sin número de teléfono registrado",
      });
      continue;
    }

    try {
      const msgId = await enviarMensajeReal(item.telefono, item.mensaje);

      if (item.telefono2) {
        try {
          await enviarMensajeReal(item.telefono2, item.mensaje);
          console.log(`📤 Mensaje también enviado a telefono2: ${item.telefono2}`);
        } catch (err2) {
          console.error(`⚠️ Error enviando a telefono2 ${item.telefono2}:`, err2.message);
        }
      }

      db.prepare(
        "INSERT INTO conversaciones (proveedor_nit, mensaje_enviado, estado) VALUES (?, ?, 'enviado')"
      ).run(item.proveedor_nit, item.mensaje);

      // Registrar para recordatorio automático en 24h
      registrarNotificacion({
        proveedor_nit:    item.proveedor_nit,
        proveedor_nombre: item.proveedor_nombre,
        telefono:         item.telefono,
        facturas:         item.facturas || "",
        total:            item.total || 0,
      });

      resultados.push({
        proveedor_nit:    item.proveedor_nit,
        proveedor_nombre: item.proveedor_nombre,
        telefono:         item.telefono,
        estado:           "enviado",
        simulado:         getStatus() !== "connected",
        wa_msg_id:        msgId,
      });
    } catch (err) {
      resultados.push({ proveedor_nit: item.proveedor_nit, estado: "error", error: err.message });
    }
  }

  return resultados;
}

function getHistorialConversaciones(proveedorNit = null) {
  if (proveedorNit) {
    return db.prepare(
      "SELECT * FROM conversaciones WHERE proveedor_nit = ? ORDER BY created_at DESC"
    ).all(proveedorNit);
  }
  return db.prepare("SELECT * FROM conversaciones ORDER BY created_at DESC").all();
}

module.exports = {
  enviarMensajeReal,
  descargarMedia,
  enviarMensajesLote,
  getHistorialConversaciones,
  enviarDocumento,
};
