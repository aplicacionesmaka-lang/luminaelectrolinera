const db = require("../models/db");
const fetch = require("node-fetch");

/**
 * Envía un mensaje de texto via Meta WhatsApp Business Cloud API
 * Docs: https://developers.facebook.com/docs/whatsapp/cloud-api/messages/text-messages
 */
async function enviarMensajeReal(telefono, mensaje) {
  const token   = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;

  if (!token || !phoneId) {
    // Sin credenciales → simular
    console.log(`\n📱 [WHATSAPP SIMULADO] Para: ${telefono}\n${mensaje}\n─────────────────`);
    return null;
  }

  // Limpiar número: solo dígitos, sin "whatsapp:" ni "+"
  const to = telefono.replace(/\D/g, "");

  const res = await fetch(`https://graph.facebook.com/v19.0/${phoneId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: mensaje },
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Meta API error: ${JSON.stringify(data)}`);
  }

  const msgId = data.messages?.[0]?.id;
  console.log(`📤 WhatsApp enviado a ${to} — ID: ${msgId}`);
  return msgId;
}

/**
 * Descarga un archivo multimedia de Meta usando su media_id
 */
async function descargarMedia(mediaId) {
  const token = process.env.WHATSAPP_TOKEN;

  // 1. Obtener URL del media
  const urlRes = await fetch(`https://graph.facebook.com/v19.0/${mediaId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const urlData = await urlRes.json();
  if (!urlData.url) throw new Error("No se pudo obtener URL del media");

  // 2. Descargar el archivo
  const fileRes = await fetch(urlData.url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const buffer = await fileRes.buffer();
  return { buffer, mimeType: urlData.mime_type };
}

/**
 * Compatibilidad: envío con registro en BD (usado por /mensajes/generar)
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
        proveedor_nit: item.proveedor_nit,
        proveedor_nombre: item.proveedor_nombre,
        estado: "sin_telefono",
        mensaje: "Proveedor sin número de teléfono registrado",
      });
      continue;
    }

    try {
      const msgId = await enviarMensajeReal(item.telefono, item.mensaje);

      // Enviar también al segundo teléfono si existe
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
      resultados.push({
        proveedor_nit: item.proveedor_nit,
        proveedor_nombre: item.proveedor_nombre,
        telefono: item.telefono,
        telefono2: item.telefono2 || null,
        estado: "enviado",
        simulado: !process.env.WHATSAPP_TOKEN,
        meta_msg_id: msgId,
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

module.exports = { enviarMensajeReal, descargarMedia, enviarMensajesLote, getHistorialConversaciones };
