const express = require("express");
const router = express.Router();
const db = require("../models/db");
const { responderProveedor, analizarImagenProveedor, extraerDatosCuenta, extraerDatosCuentaImagen } = require("../services/claudeService");
const { enviarMensajeReal, descargarMedia } = require("../services/whatsappService");

const CAMPOS_CUENTA = ["banco", "tipo_cuenta", "numero_cuenta", "titular_nombre", "titular_id"];
const LABEL_CAMPOS = {
  banco: "nombre del banco",
  tipo_cuenta: "tipo de cuenta (Ahorros o Corriente)",
  numero_cuenta: "número de cuenta",
  titular_nombre: "nombre completo del titular",
  titular_id: "número de cédula o NIT del titular",
};

/**
 * GET /webhook/whatsapp
 */
router.get("/whatsapp", (req, res) => {
  const mode      = req.query["hub.mode"];
  const token     = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log("✅ Webhook de WhatsApp verificado por Meta");
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

/**
 * POST /webhook/whatsapp
 */
router.post("/whatsapp", express.json(), async (req, res) => {
  res.sendStatus(200);
  try {
    const entry   = req.body?.entry?.[0];
    const changes = entry?.changes?.[0]?.value;
    if (!changes?.messages?.length) return;

    const msg     = changes.messages[0];
    const from    = msg.from;
    const msgType = msg.type;

    console.log(`\n📥 WhatsApp de +${from} — tipo: ${msgType}`);

    const proveedor = buscarProveedorPorTelefono(from);
    if (!proveedor) {
      console.log(`⚠️  Proveedor no encontrado para +${from}`);
      await enviarMensajeReal(from, `Hola 👋 No encontramos un proveedor registrado con este número. Por favor contáctenos directamente.\n\n_MakaBot - Tesorería MAKA QCUTE SAS_`);
      return;
    }

    console.log(`✅ Proveedor: ${proveedor.nombre} (NIT: ${proveedor.nit})`);

    const estadoConv = db.prepare("SELECT * FROM estados_conversacion WHERE proveedor_nit = ?").get(proveedor.nit);

    // Si está en flujo de captura de cuenta bancaria
    if (estadoConv?.estado === "capturando_cuenta") {
      if (msgType === "image") {
        const { buffer, mimeType: tipo } = await descargarMedia(msg.image.id);
        const base64 = buffer.toString("base64");
        const datos = await extraerDatosCuentaImagen(base64, tipo || msg.image.mime_type);
        await procesarDatosCuenta(from, proveedor, datos, estadoConv);
      } else {
        const texto = msg.text?.body || "";
        const datos = await extraerDatosCuenta(texto);
        await procesarDatosCuenta(from, proveedor, datos, estadoConv);
      }
      return;
    }

    // Flujo normal — detectar si contiene datos de cuenta
    if (msgType === "image") {
      const { buffer, mimeType: tipo } = await descargarMedia(msg.image.id);
      const base64 = buffer.toString("base64");

      // Intentar extraer cuenta primero
      const datosCuenta = await extraerDatosCuentaImagen(base64, tipo || msg.image.mime_type);
      if (datosCuenta.contiene_cuenta) {
        await iniciarCapturaCuenta(from, proveedor, datosCuenta);
        return;
      }

      // Si no tiene datos de cuenta, procesar como liquidación de factura
      await manejarImagen(from, proveedor, base64, tipo || msg.image.mime_type);
      return;
    }

    const texto = msg.text?.body || "";

    // Detectar si el texto contiene datos de cuenta
    const datosCuenta = await extraerDatosCuenta(texto);
    if (datosCuenta.contiene_cuenta) {
      await iniciarCapturaCuenta(from, proveedor, datosCuenta);
      return;
    }

    // Flujo normal de facturas
    await manejarTexto(from, proveedor, texto);

  } catch (err) {
    console.error("❌ Error en webhook WhatsApp:", err.message);
  }
});

/* ── Iniciar captura de cuenta bancaria ── */
async function iniciarCapturaCuenta(from, proveedor, datos) {
  const numeroCuenta = (db.prepare("SELECT COUNT(*) as c FROM cuentas_bancarias WHERE proveedor_nit = ?").get(proveedor.nit)?.c || 0) + 1;
  if (numeroCuenta > 3) {
    await enviarMensajeReal(from, `${proveedor.nombre}, ya tienes 3 cuentas registradas que es el máximo permitido. Si necesitas actualizarlas contáctanos. ¡Bendiciones! 🙏\n\n_MakaBot - Tesorería MAKA QCUTE SAS_`);
    return;
  }
  await procesarDatosCuenta(from, proveedor, datos, { numero_cuenta: numeroCuenta, datos_parciales: null });
}

/* ── Procesar y validar datos de cuenta bancaria ── */
async function procesarDatosCuenta(from, proveedor, datos, estadoConv) {
  // Mezclar con datos parciales anteriores
  let parciales = {};
  try { parciales = estadoConv?.datos_parciales ? JSON.parse(estadoConv.datos_parciales) : {}; } catch(e) {}

  const merged = { ...parciales };
  for (const campo of CAMPOS_CUENTA) {
    if (datos[campo]) merged[campo] = datos[campo];
  }
  if (datos.valor_asignado) merged.valor_asignado = datos.valor_asignado;

  const faltantes = CAMPOS_CUENTA.filter(c => !merged[c]);

  if (faltantes.length === 0) {
    // Todos los datos completos — guardar
    const orden = estadoConv?.numero_cuenta || 1;
    db.prepare(`
      INSERT INTO cuentas_bancarias (proveedor_nit, banco, tipo_cuenta, numero_cuenta, titular_nombre, titular_id, valor_asignado, orden)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(proveedor.nit, merged.banco, merged.tipo_cuenta, merged.numero_cuenta, merged.titular_nombre, merged.titular_id, merged.valor_asignado || null, orden);

    // Limpiar estado
    db.prepare("DELETE FROM estados_conversacion WHERE proveedor_nit = ?").run(proveedor.nit);

    console.log(`🏦 Cuenta ${orden} guardada para ${proveedor.nombre}: ${merged.banco} - ${merged.numero_cuenta}`);

    const cuentasTotal = db.prepare("SELECT COUNT(*) as c FROM cuentas_bancarias WHERE proveedor_nit = ?").get(proveedor.nit)?.c || 0;
    let respuesta = `✅ Registramos tu cuenta bancaria #${orden}:\n\n`;
    respuesta += `🏦 Banco: ${merged.banco}\n`;
    respuesta += `📋 Tipo: ${merged.tipo_cuenta}\n`;
    respuesta += `🔢 Cuenta: ${merged.numero_cuenta}\n`;
    respuesta += `👤 Titular: ${merged.titular_nombre}\n`;
    respuesta += `🪪 ID: ${merged.titular_id}\n`;
    if (merged.valor_asignado) respuesta += `💰 Valor: $${Number(merged.valor_asignado).toLocaleString("es-CO")}\n`;

    if (cuentasTotal < 3) {
      respuesta += `\n¿Tienes otra cuenta bancaria para registrar? Responde *SÍ* para agregar otra o *NO* si es todo. ¡Bendiciones! 🙏\n\n_MakaBot - Tesorería MAKA QCUTE SAS_`;
      db.prepare(`
        INSERT INTO estados_conversacion (proveedor_nit, estado, numero_cuenta, datos_parciales)
        VALUES (?, 'esperando_mas_cuentas', ?, '{}')
        ON CONFLICT(proveedor_nit) DO UPDATE SET estado='esperando_mas_cuentas', numero_cuenta=?, datos_parciales='{}', updated_at=CURRENT_TIMESTAMP
      `).run(proveedor.nit, cuentasTotal + 1, cuentasTotal + 1);
    } else {
      respuesta += `\nYa tienes 3 cuentas registradas (máximo). ¡Que Dios les bendiga! 🙏\n\n_MakaBot - Tesorería MAKA QCUTE SAS_`;
    }

    await enviarMensajeReal(from, respuesta);
  } else {
    // Faltan datos — guardar parciales y preguntar
    db.prepare(`
      INSERT INTO estados_conversacion (proveedor_nit, estado, numero_cuenta, datos_parciales)
      VALUES (?, 'capturando_cuenta', ?, ?)
      ON CONFLICT(proveedor_nit) DO UPDATE SET estado='capturando_cuenta', numero_cuenta=?, datos_parciales=?, updated_at=CURRENT_TIMESTAMP
    `).run(proveedor.nit, estadoConv?.numero_cuenta || 1, JSON.stringify(merged), estadoConv?.numero_cuenta || 1, JSON.stringify(merged));

    const listaDatos = Object.entries(merged)
      .filter(([k]) => CAMPOS_CUENTA.includes(k))
      .map(([k, v]) => `• ${LABEL_CAMPOS[k]}: ${v}`)
      .join("\n");

    const listaFaltantes = faltantes.map(f => `• ${LABEL_CAMPOS[f]}`).join("\n");

    let msg = `Hola ${proveedor.nombre} 👋 Recibí parte de los datos de tu cuenta bancaria.\n\n`;
    if (listaDatos) msg += `✅ *Datos recibidos:*\n${listaDatos}\n\n`;
    msg += `⚠️ *Por favor comparte también:*\n${listaFaltantes}\n\n¡Bendiciones! 🙏\n\n_MakaBot - Tesorería MAKA QCUTE SAS_`;

    await enviarMensajeReal(from, msg);
  }
}

/* ── Lógica de respuesta a texto ── */
async function manejarTexto(from, proveedor, texto) {
  // Detectar respuesta a "¿tienes otra cuenta?"
  const estadoConv = db.prepare("SELECT * FROM estados_conversacion WHERE proveedor_nit = ?").get(proveedor.nit);
  if (estadoConv?.estado === "esperando_mas_cuentas") {
    const textoLower = texto.toLowerCase().trim();
    if (textoLower.includes("sí") || textoLower.includes("si") || textoLower === "s") {
      db.prepare("UPDATE estados_conversacion SET estado='capturando_cuenta', datos_parciales='{}', updated_at=CURRENT_TIMESTAMP WHERE proveedor_nit=?").run(proveedor.nit);
      await enviarMensajeReal(from, `Perfecto 👍 Envíame los datos de la siguiente cuenta:\n\n• Banco\n• Tipo de cuenta (Ahorros/Corriente)\n• Número de cuenta\n• Nombre del titular\n• Cédula/NIT del titular\n\nPuedes enviarlos en texto o imagen. ¡Bendiciones! 🙏\n\n_MakaBot - Tesorería MAKA QCUTE SAS_`);
      return;
    } else {
      db.prepare("DELETE FROM estados_conversacion WHERE proveedor_nit=?").run(proveedor.nit);
    }
  }

  const facturas = db.prepare("SELECT * FROM facturas WHERE proveedor_nit = ? AND estado = 'pendiente'").all(proveedor.nit);

  if (facturas.length === 0) {
    const msg = `Hola ${proveedor.nombre} 👋\nActualmente no tienes facturas pendientes en nuestro sistema. Si tienes alguna duda, con gusto te ayudamos.\n\n¡Que Dios les bendiga! 🙏\n\n_MakaBot - Tesorería MAKA QCUTE SAS_`;
    db.prepare("INSERT INTO conversaciones (proveedor_nit, mensaje_enviado, respuesta, estado) VALUES (?,?,?,'respondido')").run(proveedor.nit, `[WA]: ${texto}`, msg);
    await enviarMensajeReal(from, msg);
    return;
  }

  const totalCalculado = facturas.reduce((s, f) => s + f.valor_final, 0);
  const analisis = await responderProveedor({ nombreProveedor: proveedor.nombre, respuestaProveedor: texto, totalCalculado, facturas });

  if (analisis.accion === "ajustado" && analisis.origen_valor === "proveedor" && analisis.valor_aceptado < totalCalculado) {
    const ratio = analisis.valor_aceptado / totalCalculado;
    const stmt = db.prepare("UPDATE facturas SET valor_final = ?, valor_proveedor = ?, origen_valor = 'proveedor' WHERE id = ?");
    db.transaction(() => { for (const f of facturas) stmt.run(Math.round(f.valor_final * ratio * 100) / 100, analisis.valor_aceptado, f.id); })();
    console.log(`💰 Valor ajustado: $${totalCalculado.toLocaleString()} → $${analisis.valor_aceptado.toLocaleString()}`);
  }

  db.prepare("INSERT INTO conversaciones (proveedor_nit, mensaje_enviado, respuesta, estado) VALUES (?,?,?,'respondido')").run(proveedor.nit, `[WA]: ${texto}`, analisis.mensaje_respuesta);
  await enviarMensajeReal(from, analisis.mensaje_respuesta);
  console.log(`📤 Respuesta enviada a ${proveedor.nombre}`);
}

/* ── Lógica de análisis de imagen (facturas) ── */
async function manejarImagen(from, proveedor, base64, mimeType) {
  try {
    console.log(`🖼️  Analizando imagen de ${proveedor.nombre}`);
    const resultado = await analizarImagenProveedor(base64, mimeType);

    let resumen = "";
    if (resultado.facturas_encontradas?.length > 0) {
      for (const fi of resultado.facturas_encontradas) {
        if (!fi.numero_factura || !fi.valor_neto) continue;
        const factura = db.prepare("SELECT * FROM facturas WHERE numero_factura = ? AND proveedor_nit = ?").get(fi.numero_factura, proveedor.nit);
        if (factura && fi.valor_neto <= factura.valor_final) {
          db.prepare("UPDATE facturas SET valor_final=?, valor_proveedor=?, descuento_pronto_pago=COALESCE(?,descuento_pronto_pago), flete=COALESCE(?,flete), origen_valor='imagen_proveedor' WHERE id=?")
            .run(fi.valor_neto, fi.valor_neto, fi.descuento, fi.flete, factura.id);
          resumen += `\n• Factura ${fi.numero_factura}: *$${fi.valor_neto.toLocaleString("es-CO")}* ✅`;
        }
      }
    }

    const respuesta = resumen
      ? `Recibimos tu liquidación 📊\n\nActualizamos los valores:${resumen}\n\nSi tienes alguna duda escríbenos. ¡Que Dios les bendiga! 🙏\n\n_MakaBot - Tesorería MAKA QCUTE SAS_`
      : `Recibimos tu imagen 📎, pero no pude identificar los números de factura automáticamente. Nuestro equipo la revisará.\n\n¡Bendiciones! 🙏\n\n_MakaBot - Tesorería MAKA QCUTE SAS_`;

    db.prepare("INSERT INTO conversaciones (proveedor_nit, mensaje_enviado, respuesta, estado) VALUES (?,?,?,'respondido')").run(proveedor.nit, "[IMAGEN WA]", respuesta);
    await enviarMensajeReal(from, respuesta);
  } catch (err) {
    console.error("Error procesando imagen:", err.message);
    await enviarMensajeReal(from, "Recibimos tu imagen pero hubo un problema al procesarla. Nuestro equipo la revisará pronto. ¡Bendiciones! 🙏");
  }
}

/* ── Buscar proveedor por número de teléfono (telefono o telefono2) ── */
function buscarProveedorPorTelefono(telefonoLimpio) {
  const ultimos10 = telefonoLimpio.replace(/\D/g, "").slice(-10);
  const todos = db.prepare("SELECT * FROM proveedores").all();
  for (const p of todos) {
    if ((p.telefono || "").replace(/\D/g, "").slice(-10) === ultimos10) return p;
    if ((p.telefono2 || "").replace(/\D/g, "").slice(-10) === ultimos10) return p;
  }
  return null;
}

module.exports = router;
