const express = require("express");
const router  = express.Router();
const db      = require("../models/db");
const { responderProveedor, analizarImagenProveedor, extraerDatosCuenta, extraerDatosCuentaImagen, extraerDatosSoporte } = require("../services/claudeService");
const { enviarMensajeReal, enviarDocumento, descargarMedia } = require("../services/whatsappService");
const { buscarSoporteProveedor } = require("../services/soportesService");
const { buscarFacturasProveedor } = require("../services/sqlServerService");
const { onMessage, getStatus, getQR } = require("../services/whatsappClient");
const { marcarRespondido } = require("../services/recordatorioService");
const { registrarPdfRecibido, registrarGuiaRecibida, confirmarPedidoYPedirPdf } = require("../services/solicitudPdfService");

const SERVER_URL = process.env.SERVER_URL || "http://217.71.206.34:3000";

const CAMPOS_CUENTA = ["banco", "tipo_cuenta", "numero_cuenta", "titular_nombre", "titular_id"];
const LABEL_CAMPOS  = {
  banco:          "nombre del banco",
  tipo_cuenta:    "tipo de cuenta (Ahorros o Corriente)",
  numero_cuenta:  "número de cuenta",
  titular_nombre: "nombre completo del titular",
  titular_id:     "número de cédula o NIT del titular",
};

// ── Registrar handler de mensajes entrantes ──────────────────────────────────
onMessage(async (msg) => {
  try {
    if (msg.fromMe) return;
    const isGroup = msg.from.includes("@g.us");
    if (isGroup) return;

    // Resolver número real (LID → número de teléfono)
    let from = msg.from.replace("@c.us", "").replace("@s.whatsapp.net", "").replace("@lid", "");
    if (msg.from.includes("@lid")) {
      try {
        const contact = await msg.getContact();
        if (contact?.number) from = contact.number;
        else { console.log("⚠️  LID sin número resuelto:", msg.from); return; }
      } catch(e) {
        console.log("⚠️  No se pudo resolver LID:", msg.from);
        return;
      }
    }

    const msgType = msg.type; // 'chat' | 'image' | 'document' | 'audio' | ...
    console.log(`\n📥 WhatsApp de +${from} — tipo: ${msgType}`);


    // ── Comandos de control del bot (desde cualquier número interno) ──────────
    const numerosInternos = (process.env.NUMEROS_INTERNOS || "")
      .split(",").map(n => n.replace(/\D/g, "").slice(-10));
    const esInterno = numerosInternos.includes(from.slice(-10));

    if (msgType === "chat") {
      const cmdTexto = (msg.body || "").trim().toUpperCase();
      // PAUSAR BOT <telefono>  →  desactiva bot para ese proveedor
      // ACTIVAR BOT <telefono> →  reactiva bot para ese proveedor
      // PAUSAR BOT TODOS       →  pausa global
      // ACTIVAR BOT TODOS      →  activa global
      const cmdPausar  = cmdTexto.match(/^PAUSAR\s+BOT(?:\s+(.+))?$/);
      const cmdActivar = cmdTexto.match(/^ACTIVAR\s+BOT(?:\s+(.+))?$/);

      if ((cmdPausar || cmdActivar) && esInterno) {
        const pausar = !!cmdPausar;
        const arg = (cmdPausar?.[1] || cmdActivar?.[1] || "").trim();

        if (!arg || arg === "TODOS") {
          db.prepare("UPDATE proveedores SET bot_pausado = ?").run(pausar ? 1 : 0);
          const cuantos = db.prepare("SELECT COUNT(*) as c FROM proveedores").get()?.c || 0;
          console.log(`🤖 Bot ${pausar ? "PAUSADO" : "ACTIVADO"} para TODOS los proveedores (${cuantos})`);
        } else {
          // Buscar por teléfono o nombre parcial
          const digitos = arg.replace(/\D/g, "").slice(-10);
          let prov = digitos
            ? db.prepare("SELECT nit, nombre FROM proveedores WHERE replace(replace(telefono,'+',''),' ','') LIKE ? OR replace(replace(telefono2,'+',''),' ','') LIKE ?").get(`%${digitos}`, `%${digitos}`)
            : null;
          if (!prov) prov = db.prepare("SELECT nit, nombre FROM proveedores WHERE nombre LIKE ?").get(`%${arg}%`);
          if (prov) {
            db.prepare("UPDATE proveedores SET bot_pausado = ? WHERE nit = ?").run(pausar ? 1 : 0, prov.nit);
            console.log(`🤖 Bot ${pausar ? "PAUSADO" : "ACTIVADO"} para ${prov.nombre}`);
          } else {
            console.log(`⚠️  Comando bot: proveedor no encontrado para "${arg}"`);
          }
        }
        return;
      }
    }

    if (esInterno && msg.hasMedia && (msgType === "image" || msgType === "document")) {
      await manejarMensajeInterno(from, msg, msgType);
      return;
    }
    // Si es interno pero envía texto, lo dejamos pasar al flujo normal de proveedor

    const proveedor = buscarProveedorPorTelefono(from);
    if (!proveedor) {
      console.log(`⚠️  Proveedor no encontrado para +${from}`);

      // Si envía documento y hay OC pendiente de PDF para ese teléfono → registrar y confirmar
      if (msg.hasMedia && (msgType === "image" || msgType === "document")) {
        const ultimos10 = from.replace(/\D/g, "").slice(-10);
        const ocPorTel = db.prepare(`
          SELECT * FROM solicitudes_pdf_compra
          WHERE replace(replace(telefono,' ',''),'0057','57') LIKE ? AND pdf_recibido = 0 AND excluir = 0
          ORDER BY created_at DESC LIMIT 1
        `).get(`%${ultimos10}`);
        if (ocPorTel) {
          const { buffer, mimeType } = await descargarMedia(msg);
          const { registrarPdfRecibido } = require("../services/solicitudPdfService");
          await registrarPdfRecibido(ocPorTel.proveedor_nit, ocPorTel.proveedor_nombre, buffer, mimeType);
          const confirmMsg = `¡Gracias! 😊 Recibimos el documento de la *OC ${ocPorTel.numero_orden}*.\n\n✅ Quedó registrado correctamente.\n\nEstaremos pendientes del despacho y te contactaremos para confirmar la guía de transporte.\n\n¡Que Dios les bendiga! 🙏\n\n_MakaBot - Compras QCUTE SAS_`;
          await enviarMensajeReal(`${from}@c.us`, confirmMsg);
          console.log(`📤 PDF de desconocido +${from} registrado para OC ${ocPorTel.numero_orden}`);
          return;
        }
      }

      // Si es texto sobre pagos/facturas, responder que se revisará
      if (msgType === "chat") {
        const tl = (msg.body || "").toLowerCase();
        const esTema = /factura|pago|pagar|cuenta|banco|transfer|consign|deposit|soport|comprobante|valor|saldo|deuda|pendiente|venc|descuento|flete|debo|cobro|cobr/.test(tl);
        if (esTema) {
          const respDesconocido = `Hola 👋 ¡Que Dios les bendiga!\n\nGracias por comunicarte con el equipo de Tesorería de *MAKA QCUTE SAS*. 😊\n\nRecibimos tu mensaje y lo vamos a revisar con nuestro equipo. En breve te contactamos para darte respuesta.\n\n¡Que Dios les bendiga y prospere su negocio! 🙏\n\n_MakaBot - Tesorería MAKA QCUTE SAS_`;
          await enviarMensajeReal(`${from}@c.us`, respDesconocido);
          console.log(`📤 Respuesta enviada a desconocido +${from}`);
        }
      }
      return;
    }

    console.log(`✅ Proveedor: ${proveedor.nombre} (NIT: ${proveedor.nit})`);

    // Si el bot está pausado para este proveedor → solo escuchar, nunca responder
    if (proveedor.bot_pausado) {
      console.log(`⏸️  Bot pausado para ${proveedor.nombre} — mensaje ignorado`);
      return;
    }

    // Cualquier mensaje del proveedor cancela recordatorios pendientes
    marcarRespondido(proveedor.nit);
    const estadoConv = db.prepare("SELECT * FROM estados_conversacion WHERE proveedor_nit = ?").get(proveedor.nit);

    // Flujo captura cuenta bancaria
    const MIME_IMAGENES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (estadoConv?.estado === "capturando_cuenta") {
      if (msg.hasMedia) {
        const { buffer, mimeType } = await descargarMedia(msg);
        if (!MIME_IMAGENES.includes(mimeType)) {
          // Voz/audio/video — ignorar en captura de cuenta
          await manejarTexto(from, proveedor, msg.body || "", true);
          return;
        }
        const base64 = buffer.toString("base64");
        const datos  = await extraerDatosCuentaImagen(base64, mimeType);
        await procesarDatosCuenta(from, proveedor, datos, estadoConv);
      } else {
        const textoMsg = msg.body || "";
        // Si el mensaje no parece datos bancarios, pasarlo al LLM en vez de forzar captura
        const datos = await extraerDatosCuenta(textoMsg);
        if (datos.contiene_cuenta) {
          await procesarDatosCuenta(from, proveedor, datos, estadoConv);
        } else {
          // No es datos bancarios — responder con LLM y recordar amablemente que faltan los datos
          await manejarTexto(from, proveedor, textoMsg, true);
        }
      }
      return;
    }

    // Mensaje con media
    if (msg.hasMedia && (msgType === "image" || msgType === "document")) {
      const { buffer, mimeType } = await descargarMedia(msg);
      const base64 = buffer.toString("base64");

      // 1. PRIMERO verificar datos bancarios — tiene prioridad sobre OC
      let datosCuenta = { contiene_cuenta: false };
      try {
        datosCuenta = await extraerDatosCuentaImagen(base64, mimeType);
      } catch(errCuenta) {
        const isRL = (errCuenta?.status === 429) || (errCuenta?.message||"").includes("rate_limit");
        if (isRL) {
          console.warn("⏳ Rate limit extrayendo cuenta — esperando 10s...");
          await new Promise(r => setTimeout(r, 10000));
          try { datosCuenta = await extraerDatosCuentaImagen(base64, mimeType); } catch(e2) {}
        }
      }
      if (datosCuenta.contiene_cuenta) {
        console.log(`🏦 Imagen con datos bancarios de ${proveedor.nombre} — procesando cuenta`);
        const facturas = await buscarFacturasProveedorFiltradas(proveedor.nit);
        const facturasPago = facturas.filter(f => (f.dias_para_vencer ?? 0) <= 7);
        if (facturasPago.length === 0 && facturas.length > 0) {
          await manejarDocumentoProveedor(from, proveedor, base64, mimeType, facturas);
          return;
        }
        await iniciarCapturaCuenta(from, proveedor, datosCuenta);
        return;
      }

      // 2. Si no es datos bancarios, verificar si hay OC pendiente de PDF
      const ocRegistrada = await registrarPdfRecibido(proveedor.nit, proveedor.nombre, buffer, mimeType);
      if (ocRegistrada) {
        const msg2 = `¡Muchas gracias! 😊 Recibimos el documento de la *OC ${ocRegistrada.solicitud.numero_orden}*.\n\n` +
          `✅ Quedó registrado correctamente en el sistema.\n\n` +
          `A partir de este momento estaremos pendientes del despacho. Te contactaremos para confirmar:\n` +
          `🚚 *Guía de transporte* (número y transportadora)\n` +
          `📅 *Fecha estimada de llegada*\n\n` +
          `¡Que Dios les bendiga y prospere su negocio! 🙏\n\n_MakaBot - Compras QCUTE SAS_`;
        db.prepare("INSERT INTO conversaciones (proveedor_nit, mensaje_enviado, respuesta, estado) VALUES (?,?,?,'pdf_compra_recibido')")
          .run(proveedor.nit, "[PDF/IMAGEN WA]", msg2);
        await enviarMensajeReal(from, msg2);
        return;
      }

      // 2b. Verificar si hay OC en etapa de guía (PDF ya recibido, guía pendiente)
      const ocEnGuia = db.prepare(`
        SELECT * FROM solicitudes_pdf_compra
        WHERE (proveedor_nit = ? OR proveedor_nombre LIKE ?)
          AND excluir = 0 AND pdf_recibido = 1 AND guia_recibida = 0
        ORDER BY created_at DESC LIMIT 1
      `).get(proveedor.nit, `%${proveedor.nombre.split(" ")[0]}%`);
      if (ocEnGuia) {
        registrarGuiaRecibida(proveedor.nit, proveedor.nombre, "[DOCUMENTO WA]");
        const nombreProv = proveedor.nombre.split(" ")[0];
        const msgGuiaDoc = `¡Gracias ${nombreProv}! 😊 Recibimos el documento de la *OC ${ocEnGuia.numero_orden}*.\n\n✅ Quedó registrado en el sistema. Nuestro equipo de compras estará pendiente de la llegada de la mercancía.\n\n¡Que Dios les bendiga y prospere su negocio! 🙏\n\n_MakaBot - Compras QCUTE SAS_`;
        db.prepare("INSERT INTO conversaciones (proveedor_nit, mensaje_enviado, respuesta, estado) VALUES (?,?,?,'guia_recibida')").run(proveedor.nit, "[DOC WA]", msgGuiaDoc);
        await enviarMensajeReal(from, msgGuiaDoc);
        return;
      }

      // 3. Clasificar imagen: ¿es catálogo/foto de producto o documento de cobro?
      let clasificacion = { es_catalogo_producto: false, facturas_encontradas: [] };
      try {
        clasificacion = await analizarImagenProveedor(base64, mimeType);
      } catch(e) { console.warn("Error clasificando imagen:", e.message); }

      if (clasificacion.es_catalogo_producto) {
        // Solo responder al PRIMER catálogo recibido en las últimas 2 horas
        const respondidoCatalogo = db.prepare(
          "SELECT id FROM conversaciones WHERE proveedor_nit=? AND estado='catalogo_recibido' AND created_at >= datetime('now','-2 hours') LIMIT 1"
        ).get(proveedor.nit);
        if (!respondidoCatalogo) {
          const nombre = proveedor.nombre.split(" ")[0];
          const msgCatalogo = `¡Hola ${nombre}! 😊 Muchas gracias por compartir tu catálogo de productos. Lo revisaremos con nuestro equipo de compras.\n\n¡Que Dios les bendiga! 🙏\n\n_MakaBot - MAKA QCUTE SAS_`;
          db.prepare("INSERT INTO conversaciones (proveedor_nit, mensaje_enviado, respuesta, estado) VALUES (?,?,?,'catalogo_recibido')").run(proveedor.nit, "[IMAGEN WA]", msgCatalogo);
          await enviarMensajeReal(from, msgCatalogo);
        }
        return;
      }

      // 4. Es documento de cobro/pago — procesar normalmente
      const facturas = await buscarFacturasProveedorFiltradas(proveedor.nit);
      await manejarDocumentoProveedor(from, proveedor, base64, mimeType, facturas);
      return;
    }

    // Texto normal
    const texto = msg.body || "";

    // ── Filtro de relevancia: solo responder si el mensaje es sobre facturas/pagos/cuentas
    // o si ya hay una conversación de pago activa con este proveedor ─────────────────────
    if (msgType === "chat") {
      const tl = texto.toLowerCase().trim();

      // Palabras clave de facturas, pagos y cuentas bancarias
      const esTemaRelevante = /factura|pago|pagar|cancel|cuenta|banco|transfer|consign|deposit|remisi|soport|comprobante|valor|saldo|deuda|debe|pendiente|venc|descuento|flete|bancolombia|davivienda|nequi|daviplata|ahorros|corriente|titular|c[eé]dula|nit|orden de compra|oc-|guia|env[ií]o|despacho|mercanc|recib/i.test(tl);

      // ¿Tiene conversación de pago activa (últimos 7 días)?
      const convActiva = db.prepare(
        "SELECT id FROM conversaciones WHERE proveedor_nit = ? AND created_at >= datetime('now', '-7 days') ORDER BY created_at DESC LIMIT 1"
      ).get(proveedor.nit);

      // ¿Está en proceso de captura de cuenta?
      const estadoActivo = db.prepare(
        "SELECT estado FROM estados_conversacion WHERE proveedor_nit = ?"
      ).get(proveedor.nit);

      // Si ya completó la validación bancaria, no enviar más mensajes
      const yaCompleto = db.prepare(
        "SELECT id FROM conversaciones WHERE proveedor_nit = ? AND estado = 'validacion_completa' AND created_at >= datetime('now', '-7 days') ORDER BY created_at DESC LIMIT 1"
      ).get(proveedor.nit);
      if (yaCompleto) {
        console.log(`✅ Validación ya completada para ${proveedor.nombre} — sin respuesta`);
        return;
      }

      if (!esTemaRelevante && !convActiva && !estadoActivo) {
        console.log(`🔕 Mensaje ignorado (tema no relevante): "${texto.substring(0, 50)}"`);
        return;
      }
    }

    // Detectar envío de guía de transporte (número de guía, transportadora, fecha de llegada)
    const tlTexto = texto.toLowerCase().trim();
    const esGuia = /gu[ií]a|tracking|seguimiento|transportadora|servientrega|coordinadora|envia|tcc|deprisa|interrapidisimo|numero de env[ií]|n[uú]mero de gu[ií]|despacha|despacho|envi[oó] el d[ií]a|lleg|llegada|fecha estimada/.test(tlTexto);
    if (esGuia) {
      registrarGuiaRecibida(proveedor.nit, proveedor.nombre, texto);
      const nombre = proveedor.nombre.split(" ")[0];
      const msgGuia = `¡Gracias ${nombre}! 😊 Recibimos la información de tu envío:\n\n` +
        `📦 *"${texto.slice(0, 200)}"*\n\n` +
        `✅ Quedó registrado en el sistema. Nuestro equipo de compras estará pendiente de la llegada de la mercancía.\n\n` +
        `¡Que Dios les bendiga y prospere su negocio! 🙏\n\n_MakaBot - Compras QCUTE SAS_`;
      db.prepare("INSERT INTO conversaciones (proveedor_nit, mensaje_enviado, respuesta, estado) VALUES (?,?,?,'guia_recibida')").run(proveedor.nit, `[WA]: ${texto}`, msgGuia);
      await enviarMensajeReal(from, msgGuia);
      return;
    }
    const anunciaEnvioDatos = /ya le env[ií]|le mando|le paso|te paso|te env[ií]|voy a envi|le comparto|le mando los datos|en un momento|ahora le|ya le mand/.test(tlTexto);
    if (anunciaEnvioDatos) {
      const msgCaptura = `¡Perfecto! 😊 Estamos listos para recibirlos. Por favor envíanos en este chat los datos completos:\n\n🏦 *Banco*\n💳 *Tipo de cuenta* (Ahorros / Corriente)\n🔢 *Número de cuenta*\n👤 *Nombre del titular*\n🪪 *Cédula o NIT del titular*\n\n¡Muchas gracias y que Dios les bendiga! 🙏\n\n_MakaBot - Tesorería MAKA QCUTE SAS_`;
      db.prepare(`INSERT INTO estados_conversacion (proveedor_nit, estado, numero_cuenta, datos_parciales) VALUES (?, 'capturando_cuenta', 1, '{}') ON CONFLICT(proveedor_nit) DO UPDATE SET estado='capturando_cuenta', numero_cuenta=1, datos_parciales='{}', updated_at=CURRENT_TIMESTAMP`).run(proveedor.nit);
      db.prepare("INSERT INTO conversaciones (proveedor_nit, mensaje_enviado, respuesta, estado) VALUES (?,?,?,'respondido')").run(proveedor.nit, `[WA]: ${texto}`, msgCaptura);
      await enviarMensajeReal(from, msgCaptura);
      return;
    }

    const datosCuenta = await extraerDatosCuenta(texto);
    if (datosCuenta.contiene_cuenta) {
      await iniciarCapturaCuenta(from, proveedor, datosCuenta);
      return;
    }
    await manejarTexto(from, proveedor, texto);

  } catch (err) {
    console.error("❌ Error procesando mensaje WA:", err?.message || err, "\nSTACK:", err?.stack?.split("\n").slice(0,4).join(" | "));
  }
});

// ── Envío manual de mensaje ──────────────────────────────────────────────────
router.post("/enviar-manual", express.json(), async (req, res) => {
  try {
    const { telefono, mensaje, proveedor_nit } = req.body;
    if (!telefono || !mensaje) return res.status(400).json({ error: "telefono y mensaje requeridos" });
    await enviarMensajeReal(telefono, mensaje);
    if (proveedor_nit) {
      db.prepare("INSERT INTO conversaciones (proveedor_nit, mensaje_enviado, respuesta, estado) VALUES (?,?,?,'respondido')")
        .run(proveedor_nit, '[MANUAL]', mensaje);
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Rutas HTTP para QR y estado ──────────────────────────────────────────────

// GET /webhook/whatsapp/qr — devuelve el QR como imagen base64
router.get("/whatsapp/qr", (req, res) => {
  const qr     = getQR();
  const status = getStatus();
  res.json({ status, qr: qr || null });
});

// GET /webhook/whatsapp/status
router.get("/whatsapp/status", (req, res) => {
  res.json({ status: getStatus() });
});

// ── Helpers ──────────────────────────────────────────────────────────────────

async function iniciarCapturaCuenta(from, proveedor, datos) {
  const n = (db.prepare("SELECT COUNT(*) as c FROM cuentas_bancarias WHERE proveedor_nit = ?").get(proveedor.nit)?.c || 0) + 1;
  await procesarDatosCuenta(from, proveedor, datos, { numero_cuenta: n, datos_parciales: null });
}

async function procesarDatosCuenta(from, proveedor, datos, estadoConv) {
  let parciales = {};
  try { parciales = estadoConv?.datos_parciales ? JSON.parse(estadoConv.datos_parciales) : {}; } catch(e) {}

  const merged = { ...parciales };
  for (const campo of CAMPOS_CUENTA) { if (datos[campo]) merged[campo] = datos[campo]; }
  if (datos.valor_asignado) merged.valor_asignado = datos.valor_asignado;

  const faltantes = CAMPOS_CUENTA.filter(c => !merged[c]);

  if (faltantes.length === 0) {
    const orden = estadoConv?.numero_cuenta || 1;
    const esBancolombia = /bancolombia/i.test(merged.banco || "");

    // Si no es Bancolombia, preguntar si tiene cuenta Bancolombia antes de registrar
    const yaVerificoBancolombia = estadoConv?.datos_parciales && JSON.parse(estadoConv.datos_parciales || "{}").verifico_bancolombia;
    if (!esBancolombia && !yaVerificoBancolombia) {
      // Guardar datos completos y preguntar por Bancolombia
      const nuevoParcial = { ...merged, verifico_bancolombia: true };
      db.prepare(`INSERT INTO estados_conversacion (proveedor_nit, estado, numero_cuenta, datos_parciales) VALUES (?, 'capturando_cuenta', ?, ?) ON CONFLICT(proveedor_nit) DO UPDATE SET estado='capturando_cuenta', numero_cuenta=?, datos_parciales=?, updated_at=CURRENT_TIMESTAMP`)
        .run(proveedor.nit, orden, JSON.stringify(nuevoParcial), orden, JSON.stringify(nuevoParcial));
      const msgBanco = `¡Gracias! 😊 Recibimos tus datos de *${merged.banco}*.\n\n¿Tienes también una cuenta en *Bancolombia*? La priorizamos para los pagos ya que facilita la transferencia. 🏦\n\nResponde *SÍ* con los datos de Bancolombia o *NO* para continuar con la cuenta que nos enviaste. 🙏\n\n_MakaBot - Tesorería MAKA QCUTE SAS_`;
      await enviarMensajeReal(from, msgBanco);
      return;
    }

    db.prepare(`INSERT INTO cuentas_bancarias (proveedor_nit, banco, tipo_cuenta, numero_cuenta, titular_nombre, titular_id, valor_asignado, orden) VALUES (?,?,?,?,?,?,?,?)`)
      .run(proveedor.nit, merged.banco, merged.tipo_cuenta, merged.numero_cuenta, merged.titular_nombre, merged.titular_id, merged.valor_asignado || null, orden);
    db.prepare("DELETE FROM estados_conversacion WHERE proveedor_nit = ?").run(proveedor.nit);

    const total = db.prepare("SELECT COUNT(*) as c FROM cuentas_bancarias WHERE proveedor_nit = ?").get(proveedor.nit)?.c || 0;
    let resp = `✅ ¡Perfecto! Registramos tu cuenta #${orden}:\n\n🏦 ${merged.banco}\n📋 ${merged.tipo_cuenta}\n🔢 ${merged.numero_cuenta}\n👤 ${merged.titular_nombre}\n🪪 ${merged.titular_id}\n`;
    if (merged.valor_asignado) resp += `💰 Valor asignado: $${Number(merged.valor_asignado).toLocaleString("es-CO")}\n`;

    // Siempre preguntar si tiene otra cuenta (sin límite)
    resp += `\n¿El pago lo divides entre *otra cuenta*? Si es así responde *SÍ* e indícanos los datos y el valor a transferir a esa cuenta. Si no, responde *NO*. 🙏\n\n_MakaBot - Tesorería MAKA QCUTE SAS_`;
    db.prepare(`INSERT INTO estados_conversacion (proveedor_nit, estado, numero_cuenta, datos_parciales) VALUES (?, 'esperando_mas_cuentas', ?, '{}') ON CONFLICT(proveedor_nit) DO UPDATE SET estado='esperando_mas_cuentas', numero_cuenta=?, datos_parciales='{}', updated_at=CURRENT_TIMESTAMP`)
      .run(proveedor.nit, total + 1, total + 1);
    await enviarMensajeReal(from, resp);
  } else {
    db.prepare(`INSERT INTO estados_conversacion (proveedor_nit, estado, numero_cuenta, datos_parciales) VALUES (?, 'capturando_cuenta', ?, ?) ON CONFLICT(proveedor_nit) DO UPDATE SET estado='capturando_cuenta', numero_cuenta=?, datos_parciales=?, updated_at=CURRENT_TIMESTAMP`)
      .run(proveedor.nit, estadoConv?.numero_cuenta || 1, JSON.stringify(merged), estadoConv?.numero_cuenta || 1, JSON.stringify(merged));

    const recibidos = Object.entries(merged).filter(([k]) => CAMPOS_CUENTA.includes(k)).map(([k, v]) => `• ${LABEL_CAMPOS[k]}: ${v}`).join("\n");
    // Mensaje amable específico por campo faltante
    let msgFalta = ``;
    if (faltantes.includes('banco')) msgFalta = `¿En qué banco tienes la cuenta? 🏦`;
    else if (faltantes.includes('numero_cuenta')) msgFalta = `¿Cuál es el número de cuenta? 🔢`;
    else if (faltantes.includes('tipo_cuenta')) msgFalta = `¿Es cuenta de *Ahorros* o *Corriente*? 💳`;
    else if (faltantes.includes('titular_nombre')) msgFalta = `¿Cuál es el nombre completo del titular de la cuenta? 👤`;
    else if (faltantes.includes('titular_id')) msgFalta = `¿Cuál es la cédula o NIT del titular de la cuenta? 🪪`;
    else msgFalta = `Falta: ${faltantes.map(f => LABEL_CAMPOS[f]).join(", ")}`;

    let msg = ``;
    if (recibidos) msg += `✅ Ya tenemos:\n${recibidos}\n\n`;
    msg += `Solo nos falta un dato más 😊\n\n${msgFalta}\n\n_MakaBot - Tesorería MAKA QCUTE SAS_`;
    await enviarMensajeReal(from, msg);
  }
}

/**
 * Wrapper sobre buscarFacturasProveedor que aplica los overrides de SQLite:
 * - EXCLUYE facturas reasignadas a otro proveedor (proveedor_nit_override ≠ nit)
 * - INCLUYE facturas de otros NITs del ERP reasignadas a este proveedor
 */
async function buscarFacturasProveedorFiltradas(nit) {
  const facturas = await buscarFacturasProveedor(nit);
  const ajustes  = db.prepare("SELECT idreg, proveedor_nit_override, incluir_pago FROM facturas_erp_ajustes").all();
  const ajMap    = {};
  ajustes.forEach(a => { ajMap[String(a.idreg)] = a; });

  // Filtrar las que pertenecen a este NIT después del override
  const filtradas = facturas.filter(f => {
    const aj = ajMap[String(f.idreg)];
    if (aj?.incluir_pago === 0) return false;  // explícitamente excluida
    if (aj?.proveedor_nit_override && aj.proveedor_nit_override !== nit) return false; // reasignada a otro
    return true;
  });

  return filtradas;
}

async function manejarTexto(from, proveedor, texto, pendienteCuenta = false) {
  const tl = texto.toLowerCase().trim();

  // ── PRIORIDAD: verificar si hay OC activa para este proveedor ────────────────
  const ocActiva = db.prepare(`
    SELECT * FROM solicitudes_pdf_compra
    WHERE (proveedor_nit = ? OR proveedor_nombre LIKE ?)
      AND excluir = 0 AND guia_recibida = 0
    ORDER BY created_at DESC LIMIT 1
  `).get(proveedor.nit, `%${proveedor.nombre.split(" ")[0]}%`);

  if (ocActiva) {
    const esSaludo = /^(hola|buenas|buenos|buen dia|buen día|hi|hey|saludos|qué tal|que tal|cómo est|como est|buena tarde|buena noche|estimad|gracias|ok|listo|claro|recib|enterado|con gusto|de acuerdo|perfecto)/.test(tl) || tl.length < 20;
    const esPreguntaOC = /orden|oc[-\s]?\d|factura|remisi[oó]n|documento|enviar|mandar|adjunt|pdf|excel|gu[ií]a|despacho|env[ií]o|lleg|cu[aá]ndo|fecha/.test(tl);
    const nombre = proveedor.nombre.split(" ")[0];
    const hora = new Date().getHours();
    const saludoHora = hora < 12 ? "Buenos días" : hora < 18 ? "Buenas tardes" : "Buenas noches";
    const estadoOC = ocActiva.pdf_recibido ? "seguimiento de despacho" : "pendiente de factura/remisión";
    const tiendas = ocActiva.tienda ? ` para las tiendas *${ocActiva.tienda}*` : "";

    if (esSaludo) {
      let msg = `${saludoHora}, ${nombre}. 😊 Igualmente, un cordial saludo.\n\n`;
      msg += `Te contactamos en seguimiento a la *Orden de Compra ${ocActiva.numero_orden}*${tiendas}.\n\n`;
      if (!ocActiva.pdf_recibido) {
        // Solo pedir PDF si ya ha pasado más de 4 horas desde el último recordatorio
        const ultimoRecordatorio = db.prepare(
          "SELECT id FROM conversaciones WHERE proveedor_nit = ? AND estado IN ('enviado', 'pdf_compra_recibido', 'respondido') AND created_at >= datetime('now', '-4 hours') ORDER BY created_at DESC LIMIT 1"
        ).get(proveedor.nit);
        if (!ultimoRecordatorio) {
          msg += `📄 Estamos pendientes de recibir la *factura o remisión* de esta orden en formato digital (PDF o Excel).\n\nCuando la tengas disponible, por favor envíala directamente por este chat.\n\n`;
        } else {
          msg += `📋 *Estado:* Pendiente de recibir factura/remisión.\n\n`;
        }
      } else if (!ocActiva.guia_recibida) {
        msg += `✅ Ya recibimos los documentos de la orden.\n\n🚚 Estamos pendientes del despacho. Por favor compártenos la *guía de transporte* y la *fecha estimada de llegada*.\n\n`;
      }
      msg += `¡Muchas gracias y que Dios les bendiga! 🙏\n\n_MakaBot - Compras QCUTE SAS_`;
      db.prepare("INSERT INTO conversaciones (proveedor_nit, mensaje_enviado, respuesta, estado) VALUES (?,?,?,'respondido')").run(proveedor.nit, `[WA]: ${texto}`, msg);
      await enviarMensajeReal(from, msg);
      return;
    }

    if (esPreguntaOC) {
      let msg = `${saludoHora}, ${nombre}. 😊\n\n`;
      msg += `Con gusto te informo sobre la *Orden de Compra ${ocActiva.numero_orden}*${tiendas}:\n\n`;
      msg += `📋 *Estado actual:* ${estadoOC}\n`;
      if (!ocActiva.pdf_recibido) {
        msg += `📄 *Pendiente:* Recibir factura o remisión en formato digital\n\nPor favor envía el documento (PDF o Excel) directamente por este chat.\n\n`;
      } else if (!ocActiva.guia_recibida) {
        msg += `✅ *Documentos:* Recibidos correctamente\n`;
        msg += `🚚 *Pendiente:* Guía de transporte y fecha estimada de llegada\n\n`;
      }
      msg += `Si tienes alguna pregunta adicional que no podemos responder aquí, será gestionada por el equipo de operaciones de QCUTE SAS.\n\n¡Muchas gracias! 🙏\n\n_MakaBot - Compras QCUTE SAS_`;
      db.prepare("INSERT INTO conversaciones (proveedor_nit, mensaje_enviado, respuesta, estado) VALUES (?,?,?,'respondido')").run(proveedor.nit, `[WA]: ${texto}`, msg);
      await enviarMensajeReal(from, msg);
      return;
    }

    // Mensaje fuera del contexto de la OC
    const msg = `${saludoHora}, ${nombre}. 😊\n\nEsta información no se encuentra disponible en este momento. Tu solicitud será gestionada por el equipo de operaciones de QCUTE SAS.\n\nRecuerda que tenemos pendiente la *Orden de Compra ${ocActiva.numero_orden}*${tiendas}${!ocActiva.pdf_recibido ? " — estamos esperando la factura o remisión en formato digital." : " — estamos esperando la guía de transporte y fecha de despacho."}\n\n¡Muchas gracias y que Dios les bendiga! 🙏\n\n_MakaBot - Compras QCUTE SAS_`;
    db.prepare("INSERT INTO conversaciones (proveedor_nit, mensaje_enviado, respuesta, estado) VALUES (?,?,?,'respondido')").run(proveedor.nit, `[WA]: ${texto}`, msg);
    await enviarMensajeReal(from, msg);
    return;
  }

  // Si hay OC pendiente de confirmación (sin OC activa en tabla local), marcar y pedir PDF
  const ocConfirmada = await confirmarPedidoYPedirPdf(proveedor.nit, proveedor.nombre);
  if (ocConfirmada) return; // el mensaje de solicitud PDF ya fue enviado

  // Estado: esperando más cuentas bancarias
  const estadoConv = db.prepare("SELECT * FROM estados_conversacion WHERE proveedor_nit = ?").get(proveedor.nit);
  if (estadoConv?.estado === "esperando_mas_cuentas") {
    if (tl.includes("sí") || tl.includes("si") || tl === "s") {
      db.prepare("UPDATE estados_conversacion SET estado='capturando_cuenta', datos_parciales='{}', updated_at=CURRENT_TIMESTAMP WHERE proveedor_nit=?").run(proveedor.nit);
      await enviarMensajeReal(from, `¡Perfecto! 😊 Cuéntame los datos de la siguiente cuenta (Banco, Tipo, Número, Titular, Cédula/NIT).\n\n¡Que Dios les bendiga! 🙏\n\n_MakaBot - Tesorería QCUTE SAS_`);
      return;
    }
    db.prepare("DELETE FROM estados_conversacion WHERE proveedor_nit=?").run(proveedor.nit);
  }

  // Saludo inicial o mensaje muy corto → si hay conversación activa, retomar; si no, saludar
  const esSaludo = /^(hola|buenas|buenos|buen dia|buen día|hi|hey|saludos|qué tal|que tal|cómo est|como est|buena tarde|buena noche|estimad)/.test(tl) || tl.length < 15;
  if (esSaludo) {
    const nombre = proveedor.nombre.split(" ")[0];
    // Verificar si ya se le envió un mensaje de pago (conversación activa de esta semana)
    const convReciente = db.prepare(
      "SELECT * FROM conversaciones WHERE proveedor_nit = ? AND estado = 'enviado' AND created_at >= datetime('now', '-7 days') ORDER BY created_at DESC LIMIT 1"
    ).get(proveedor.nit);

    if (convReciente) {
      // Buscar cuenta en cuentas_bancarias O en proveedores (donde realmente se guardan)
      const cuentaCB  = db.prepare("SELECT * FROM cuentas_bancarias WHERE proveedor_nit = ? LIMIT 1").get(proveedor.nit);
      const provData  = db.prepare("SELECT banco, cuenta, tipo_cuenta FROM proveedores WHERE nit = ?").get(proveedor.nit);
      const tieneCuenta = cuentaCB || (provData && provData.banco);
      const bancoLabel  = cuentaCB ? cuentaCB.banco : (provData?.banco || "");
      const soporte = db.prepare("SELECT * FROM soportes_pago WHERE proveedor_nit = ? ORDER BY created_at DESC LIMIT 1").get(proveedor.nit);
      const hora = new Date().getHours();
      const saludo = hora < 12 ? "¡Buenos días" : hora < 18 ? "¡Buenas tardes" : "¡Buenas noches";
      let msg = `${saludo}, ${nombre}! 😊 Igualmente, qué alegría saludarte 🙌\n\n`;
      if (soporte) {
        // Ya se envió soporte de pago — no pedir nada, solo confirmar
        const vFmt = soporte.valor ? `$${Number(soporte.valor).toLocaleString("es-CO")}` : "";
        const fFmt = soporte.fecha_pago || new Date(soporte.created_at).toLocaleDateString("es-CO");
        msg += `Tu pago ya fue procesado 🎉\n\n💰 Valor: *${vFmt}*\n📅 Fecha: ${fFmt}\n\nSi tienes alguna duda adicional, con gusto te ayudamos. ¡Que Dios les bendiga y prospere su negocio! 🙏`;
      } else if (!tieneCuenta) {
        msg += `Te escribimos en seguimiento al pago de tus facturas pendientes.\n\nPara procesarlo esta semana necesitamos:\n\n🏦 *Banco*\n💳 *Tipo de cuenta* (Ahorros / Corriente)\n🔢 *Número de cuenta*\n👤 *Nombre del titular*\n🪪 *Cédula o NIT del titular*\n\n¿Nos puedes ayudar con esos datos? 🙏`;
      } else {
        msg += `Te escribimos en seguimiento al pago de tus facturas. Tenemos registrada tu cuenta en *${bancoLabel}*.\n\n¿Hay algo más en lo que te podamos ayudar? 🙏`;
      }
      msg += `\n\n_MakaBot - Tesorería MAKA QCUTE SAS_`;
      db.prepare("INSERT INTO conversaciones (proveedor_nit, mensaje_enviado, respuesta, estado) VALUES (?,?,?,'respondido')").run(proveedor.nit, `[WA]: ${texto}`, msg);
      await enviarMensajeReal(from, msg);
    } else {
      // Sin conversación activa: saludo genérico
      const hora = new Date().getHours();
      const saludo = hora < 12 ? "¡Buenos días" : hora < 18 ? "¡Buenas tardes" : "¡Buenas noches";
      const msg = `${saludo}, ${nombre}! 😊 Un placer saludarte 🙌\n\nSoy *MakaBot*, el asistente virtual del equipo de Tesorería de *MAKA QCUTE SAS*.\n\n¿En qué te podemos ayudar? Cuéntanos con confianza 😊\n\n_¡Que Dios les bendiga! 🙏_\n\n_MakaBot - Tesorería MAKA QCUTE SAS_`;
      db.prepare("INSERT INTO conversaciones (proveedor_nit, mensaje_enviado, respuesta, estado) VALUES (?,?,?,'respondido')").run(proveedor.nit, `[WA]: ${texto}`, msg);
      await enviarMensajeReal(from, msg);
    }
    return;
  }

  // Pregunta sobre la empresa, NIT, RUT, tiendas → enviar info + RUT
  const esPreguntaEmpresa = /nit|rut|raz[oó]n social|empresa|qcute|maka|tienda|plaza del sol|la 30|arrecife|quiénes son|quienes son|con qui[eé]n|con quien/.test(tl);
  if (esPreguntaEmpresa) {
    const msgEmpresa = `¡Claro que sí! 😊 Con mucho gusto te aclaro.\n\n🏢 *QCUTE S.A.S.*\n🔢 NIT: *901.883.025-0*\n📍 CR 30A CL 1B 245C, Puerto Colombia, Atlántico\n📧 Qcutefact@gmail.com\n\nNuestros establecimientos:\n🏪 *MAKA TIENDAS* — CC Arrecife, Santa Marta\n🏪 *MAKA LA 30* — CL 30 18D 01, Santa Marta\n🏪 *MAKA PLAZA DEL SOL* — CR 32 30 15 LC1 76A, Soledad\n\n⚠️ *Importante:* Las facturas de estas tiendas son emitidas por *QCUTE SAS*, que es la razón social que realiza el pago. Anteriormente operamos bajo el nombre MAKA QCUTE SAS cuando estábamos fusionados con MAKA SAS, pero actualmente somos empresas independientes.\n\nTe adjunto nuestro RUT oficial para que actualices tus registros 👇\n\n_¡Que Dios les bendiga y prospere su negocio! 🙏_\n\n_MakaBot - Tesorería QCUTE SAS_`;
    db.prepare("INSERT INTO conversaciones (proveedor_nit, mensaje_enviado, respuesta, estado) VALUES (?,?,?,'respondido')").run(proveedor.nit, `[WA]: ${texto}`, msgEmpresa);
    await enviarMensajeReal(from, msgEmpresa);
    // Enviar RUT si está disponible
    const rutPath = require("path").join(__dirname, "../../public/RUT_QCUTE_SAS.pdf");
    if (require("fs").existsSync(rutPath)) {
      try { await enviarDocumento(from, rutPath, "RUT_QCUTE_SAS.pdf", "application/pdf"); }
      catch(e) { console.error("Error enviando RUT:", e.message); }
    }
    return;
  }

  // Pregunta por soporte/comprobante de pago
  const esPreguntaPago = /comprobante|soporte|transferencia|consignaci[oó]n|deposit|ya pag|cuándo pag|cuando pag|me pagan|recib[ií]/.test(tl);
  if (esPreguntaPago) {
    const soporte = buscarSoporteProveedor(proveedor.nit, texto);
    if (soporte) {
      const vFmt = soporte.valor ? `$${Number(soporte.valor).toLocaleString("es-CO")}` : "";
      const fFmt = soporte.fecha_pago || new Date(soporte.created_at).toLocaleDateString("es-CO");
      await enviarMensajeReal(from, `¡Claro que sí! 😊 Con mucho gusto te comparto el soporte de pago:\n\n💰 Valor: *${vFmt}*\n📅 Fecha: ${fFmt}${soporte.facturas ? `\n📄 Facturas: ${soporte.facturas}` : ""}\n\nTe lo envío de inmediato 👇\n\n¡Que Dios les bendiga! 🙏\n\n_MakaBot - Tesorería QCUTE SAS_`);
      try { await enviarDocumento(from, `${SERVER_URL}/soportes/ver/${soporte.archivo_nombre}`, soporte.archivo_nombre, soporte.mime_type); }
      catch(e) { console.error("Error enviando soporte:", e.message); }
    } else {
      await enviarMensajeReal(from, `Hola 😊 Revisé y en este momento aún no tenemos registrado tu comprobante de pago.\n\nNo te preocupes, nuestro equipo de tesorería lo está gestionando y te confirmaremos muy pronto. 🙏\n\n_MakaBot - Tesorería QCUTE SAS_`);
    }
    return;
  }

  // ── Filtro de tema: solo continuar si el mensaje es sobre pagos/facturas ──────────────────
  // Si el proveedor escribe sobre otro tema (guías, productos, etc.) → respuesta genérica
  const esTemaPagos = /factura|pago|pagar|cuenta|banco|transfer|consign|deposit|soport|comprobante|valor|saldo|deuda|pendiente|venc|descuento|flete|debo|cobro|cobr|confirm|acuerdo|liquidaci|adeudo|cancel|abono|cuanto|cuánto/.test(tl);
  // Saludos simples — nunca deben activar flujo de pagos aunque haya estado activo
  const esSaludoSimple = /^(buenos\s*(d[ií]as?|tardes?|noches?)|hola|buen\s*d[ií]a|saludos?|qu[eé]\s*tal|cómo\s*est[aá]n?|gracias|ok|okay|listo|perfecto|entendido|recibido|de\s*nada|con\s*gusto)\s*[!.]*\s*$/.test(tl);
  const esRespuestaAlBot = !esSaludoSimple && estadoConv && estadoConv.estado; // ya hay un flujo activo con este proveedor
  const hayNotifActiva = !esSaludoSimple && !!db.prepare("SELECT id FROM notificaciones_pago WHERE proveedor_nit = ? AND respondido = 0 LIMIT 1").get(proveedor.nit);

  if (!esTemaPagos && !esRespuestaAlBot && !hayNotifActiva) {
    const msgFueraDeContexto = `¡Hola! 😊 ¡Que Dios les bendiga!\n\nGracias por comunicarte con *MAKA QCUTE SAS*. Recibimos tu mensaje y lo vamos a revisar con nuestro equipo.\n\nEn breve un miembro del equipo se comunicará contigo para atender tu solicitud. 🙏\n\n_MakaBot - MAKA QCUTE SAS_`;
    db.prepare("INSERT INTO conversaciones (proveedor_nit, mensaje_enviado, respuesta, estado) VALUES (?,?,?,'respondido')").run(proveedor.nit, `[WA]: ${texto}`, msgFueraDeContexto);
    await enviarMensajeReal(from, msgFueraDeContexto);
    console.log(`ℹ️  Mensaje fuera de tema de pagos de ${proveedor.nombre} — respuesta genérica`);
    return;
  }

  // Consulta de facturas o contexto de pago (aplicando overrides de SQLite)
  const facturas = await buscarFacturasProveedorFiltradas(proveedor.nit);
  if (!facturas.length) {
    const msg = `¡Hola! 😊 Qué bueno saber de ti.\n\nEn este momento no encontramos facturas pendientes registradas en el sistema. Si crees que hay algún error o tienes una consulta específica, con gusto lo revisamos contigo. 🙏\n\n_MakaBot - Tesorería QCUTE SAS_`;
    db.prepare("INSERT INTO conversaciones (proveedor_nit, mensaje_enviado, respuesta, estado) VALUES (?,?,?,'respondido')").run(proveedor.nit, `[WA]: ${texto}`, msg);
    await enviarMensajeReal(from, msg);
    return;
  }

  // ── Usar facturas ya comunicadas (notificaciones_pago) como referencia principal ──────────
  // Si hay una notificación activa, las facturas comunicadas son la fuente de verdad de la conv.
  const notifActiva = db.prepare(
    "SELECT * FROM notificaciones_pago WHERE proveedor_nit = ? AND respondido = 0 ORDER BY created_at DESC LIMIT 1"
  ).get(proveedor.nit);

  let facturasPago;
  if (notifActiva && notifActiva.facturas) {
    // Filtrar ERP usando los números comunicados en el mensaje de pago
    const numerosComun = notifActiva.facturas.split(",").map(s => s.trim()).filter(Boolean);
    facturasPago = facturas.filter(f => {
      const num = (f.factura_completa || f.numero_factura || "").trim();
      return numerosComun.some(n => num.includes(n) || n.includes(num));
    });
    // Si no matcheó ninguna (número ligeramente diferente), usar todas las del ERP que estén pendientes
    if (facturasPago.length === 0) facturasPago = facturas.filter(f => (f.dias_para_vencer ?? 0) <= 30);
  } else {
    // Sin notificación activa: filtrar por vencimiento ≤ 7 días (comportamiento original)
    facturasPago = facturas.filter(f => (f.dias_para_vencer ?? 0) <= 7);
  }

  // Si NO hay facturas próximas a vencer, informar con detalle de cuándo vencen
  if (facturasPago.length === 0) {
    const nombre = proveedor.nombre.split(" ")[0];
    const total = facturas.reduce((s, f) => s + (Number(f.saldo_pendiente) || 0), 0);

    const lineasFacturas = facturas.map(f => {
      const venc = f.fecha_vencimiento
        ? new Date(f.fecha_vencimiento).toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit", year: "numeric" })
        : "—";
      const tienda = f.tienda_nombre ? ` | 🏪 ${f.tienda_nombre}` : "";
      const dias = f.dias_para_vencer ?? 0;
      return `🧾 *${(f.factura_completa || f.numero_factura || "").trim()}*${tienda}\n   💵 $${Number(f.saldo_pendiente).toLocaleString("es-CO")}\n   📅 Vence: ${venc} (en ${dias} días)`;
    }).join("\n\n");

    const msg = `¡Hola ${nombre}! 😊 Gracias por comunicarte.\n\n` +
      `Revisamos el sistema y encontramos las siguientes facturas pendientes:\n\n${lineasFacturas}\n\n` +
      `💰 *Total pendiente: $${total.toLocaleString("es-CO")} COP*\n\n` +
      `⏳ Estas facturas *aún no están en la programación de pago de esta semana* ya que sus fechas de vencimiento no han llegado.\n\n` +
      `Cuando se acerque su fecha de vencimiento te contactaremos para coordinar el pago. 🙏\n\n` +
      `_¡Que Dios les bendiga y prospere su negocio! 🙏_\n\n_MakaBot - Tesorería MAKA QCUTE SAS_`;

    db.prepare("INSERT INTO conversaciones (proveedor_nit, mensaje_enviado, respuesta, estado) VALUES (?,?,?,'respondido')").run(proveedor.nit, `[WA]: ${texto}`, msg);
    await enviarMensajeReal(from, msg);
    return;
  }

  const facturasNumerosStr = facturasPago.map(f => (f.factura_completa || f.numero_factura || "").trim()).join(", ");

  // Calcular descuento del proveedor para aplicar al valor comunicado a Claude
  const _provDto = db.prepare("SELECT descuento_cacharro, descuento_joyeria, descuento_activo FROM proveedores WHERE nit = ?").get(proveedor.nit) || {};
  const _pct = (_provDto.descuento_activo === 'joyeria' && _provDto.descuento_joyeria)
    ? _provDto.descuento_joyeria : (_provDto.descuento_cacharro || 0);
  const _ajRows = db.prepare("SELECT idreg, flete, descuento FROM facturas_erp_ajustes").all();
  const _ajMap  = {};
  _ajRows.forEach(a => { _ajMap[a.idreg] = a; });

  const facturasFormato = facturasPago.map(f => {
    const saldo    = Number(f.saldo_pendiente) || 0;
    const aj       = _ajMap[String(f.idreg)] || {};
    const flete    = aj.flete || 0;
    const descuento = aj.descuento > 0 ? aj.descuento : Math.round(saldo * _pct);
    return {
      numero_factura:        (f.factura_completa || f.numero_factura || "").trim(),
      valor_final:           Math.max(0, saldo - flete - descuento),
      descuento_pronto_pago: descuento,
      flete,
      saldo_pendiente:       saldo,
      tienda:                f.tienda_nombre || "",
    };
  });

  // Si pregunta por facturas
  const esPreguntaFacturas = /factura|cuanto|cuánto|debo|pendiente|adeudo|debe|lista|registrada|tengo|tienen|saldo|venc|valor/.test(tl);
  if (esPreguntaFacturas) {
    const total = facturasPago.reduce((s, f) => s + (Number(f.saldo_pendiente) || 0), 0);
    const lineas = facturasPago.map(f => {
      const venc = f.fecha_vencimiento
        ? new Date(f.fecha_vencimiento).toLocaleDateString("es-CO", { day:"2-digit", month:"2-digit", year:"numeric" })
        : "—";
      const tienda = f.tienda_nombre ? ` | 🏪 ${f.tienda_nombre}` : "";
      const diasLabel = (f.dias_para_vencer ?? 0) < 0
        ? `⚠️ Vencida hace ${Math.abs(f.dias_para_vencer)} días`
        : (f.dias_para_vencer ?? 0) === 0 ? `🔴 Vence HOY`
        : `📅 Vence: ${venc} (${f.dias_para_vencer} días)`;
      return `🧾 *${(f.factura_completa || f.numero_factura || "").trim()}*${tienda}\n   💵 $${Number(f.saldo_pendiente).toLocaleString("es-CO")}\n   ${diasLabel}`;
    }).join("\n\n");

    const cuenta = db.prepare("SELECT * FROM cuentas_bancarias WHERE proveedor_nit = ? LIMIT 1").get(proveedor.nit);
    const notaCuenta = cuenta
      ? `\n✅ Tenemos registrada tu cuenta en ${cuenta.banco} - ${cuenta.tipo_cuenta} ${cuenta.numero_cuenta}`
      : `\n📋 Para procesar el pago necesitamos tus datos bancarios:\n• Banco\n• Tipo de cuenta (Ahorros/Corriente)\n• Número de cuenta\n• Nombre del titular\n• Cédula/NIT del titular`;

    const msg = `¡Con mucho gusto! 😊 Estas son las facturas que tenemos programadas para pago:\n\n${lineas}\n\n💰 *Total: $${total.toLocaleString("es-CO")} COP*\n${notaCuenta}\n\nPor favor confírmanos:\n✔️ Valor con descuento aplicado (si aplica)\n✔️ Valor del flete o confirmación de que no aplica\n✔️ Datos bancarios completos\n\n¡Que Dios les bendiga! 🙏\n\n_MakaBot - Tesorería QCUTE SAS_`;
    db.prepare("INSERT INTO conversaciones (proveedor_nit, mensaje_enviado, respuesta, estado) VALUES (?,?,?,'respondido')").run(proveedor.nit, `[WA]: ${texto}`, msg);
    await enviarMensajeReal(from, msg);
    return;
  }

  // Verificar estado actual completo
  const _cuentaCB2 = db.prepare("SELECT id FROM cuentas_bancarias WHERE proveedor_nit = ? LIMIT 1").get(proveedor.nit);
  const _provBanco = db.prepare("SELECT banco FROM proveedores WHERE nit = ?").get(proveedor.nit);
  const tieneDatosBancarios = !!(_cuentaCB2 || (_provBanco && _provBanco.banco));
  const soportePago         = db.prepare("SELECT * FROM soportes_pago WHERE proveedor_nit = ? ORDER BY created_at DESC LIMIT 1").get(proveedor.nit);
  const notaDescuentoPrevia = db.prepare("SELECT respuesta FROM conversaciones WHERE proveedor_nit=? AND estado='nota_descuento' AND created_at >= datetime('now','-14 days') ORDER BY created_at DESC LIMIT 1").get(proveedor.nit);
  const notaFletePrevia     = db.prepare("SELECT respuesta FROM conversaciones WHERE proveedor_nit=? AND estado='nota_flete' AND created_at >= datetime('now','-14 days') ORDER BY created_at DESC LIMIT 1").get(proveedor.nit);

  // Si ya hay soporte de pago enviado → solo responder amablemente, no pedir nada
  if (soportePago) {
    const nombre = proveedor.nombre.split(" ")[0];
    const vFmt = soportePago.valor ? `$${Number(soportePago.valor).toLocaleString("es-CO")}` : "";
    const fFmt = soportePago.fecha_pago || new Date(soportePago.created_at).toLocaleDateString("es-CO");
    const msgPagado = `¡Hola ${nombre}! 😊 Gracias por comunicarte.\n\nTu pago ya fue procesado y el soporte fue enviado:\n\n💰 Valor: *${vFmt}*\n📅 Fecha: ${fFmt}\n\nSi tienes alguna duda adicional, con gusto te ayudamos. ¡Que Dios les bendiga y prospere su negocio! 🙏\n\n_MakaBot - Tesorería MAKA QCUTE SAS_`;
    db.prepare("INSERT INTO conversaciones (proveedor_nit, mensaje_enviado, respuesta, estado) VALUES (?,?,?,'respondido')").run(proveedor.nit, `[WA]: ${texto}`, msgPagado);
    await enviarMensajeReal(from, msgPagado);
    return;
  }

  // Total: usar el de la notificación activa si existe (es el que el proveedor ya vio)
  const totalParaClaude = notifActiva?.total
    ? Number(notifActiva.total)
    : facturasFormato.reduce((s, f) => s + f.valor_final, 0);

  // Respuesta inteligente con Claude — pasando todo el contexto de lo que falta
  const analisis = await responderProveedor({
    nombreProveedor:      proveedor.nombre,
    respuestaProveedor:   texto,
    totalCalculado:       totalParaClaude,
    facturas:             facturasFormato,
    facturasNumerosStr,
    tieneDatosBancarios,
    descuentoConfirmado:  notaDescuentoPrevia ? notaDescuentoPrevia.respuesta.replace("NOTA DESCUENTO: ", "") : null,
    fleteConfirmado:      notaFletePrevia     ? notaFletePrevia.respuesta.replace("NOTA FLETE: ", "")         : null,
  });

  // Guardar notas si Claude las extrajo
  if (analisis.nota_descuento) {
    db.prepare(`INSERT INTO conversaciones (proveedor_nit, mensaje_enviado, respuesta, estado) VALUES (?, ?, ?, 'nota_descuento')`)
      .run(proveedor.nit, `[WA]: ${texto}`, `NOTA DESCUENTO: ${analisis.nota_descuento}`);
  }
  if (analisis.nota_flete) {
    db.prepare(`INSERT INTO conversaciones (proveedor_nit, mensaje_enviado, respuesta, estado) VALUES (?, ?, ?, 'nota_flete')`)
      .run(proveedor.nit, `[WA]: ${texto}`, `NOTA FLETE: ${analisis.nota_flete}`);
  }
  if (analisis.nota_cuentas) {
    db.prepare(`INSERT INTO conversaciones (proveedor_nit, mensaje_enviado, respuesta, estado) VALUES (?, ?, ?, 'nota_cuentas')`)
      .run(proveedor.nit, `[WA]: ${texto}`, `NOTA CUENTAS: ${analisis.nota_cuentas}`);
  }

  // Si todo está validado → marcar como completado, no seguir interactuando
  if (analisis.accion === "completado") {
    db.prepare("DELETE FROM estados_conversacion WHERE proveedor_nit = ?").run(proveedor.nit);
    db.prepare("INSERT INTO conversaciones (proveedor_nit, mensaje_enviado, respuesta, estado) VALUES (?,?,?,'validacion_completa')").run(proveedor.nit, `[WA]: ${texto}`, analisis.mensaje_respuesta);
    await enviarMensajeReal(from, analisis.mensaje_respuesta);
    return;
  }

  // Si Claude detectó que hay que solicitar datos bancarios → entrar en estado de captura
  if (analisis.accion === "solicitar_datos_bancarios" && !tieneDatosBancarios) {
    const n = (db.prepare("SELECT COUNT(*) as c FROM cuentas_bancarias WHERE proveedor_nit = ?").get(proveedor.nit)?.c || 0) + 1;
    db.prepare(`INSERT INTO estados_conversacion (proveedor_nit, estado, numero_cuenta, datos_parciales) VALUES (?, 'capturando_cuenta', ?, '{}') ON CONFLICT(proveedor_nit) DO UPDATE SET estado='capturando_cuenta', numero_cuenta=?, datos_parciales='{}', updated_at=CURRENT_TIMESTAMP`)
      .run(proveedor.nit, n, n);
  }

  let respFinal = analisis.mensaje_respuesta;
  // Si hay cuenta pendiente y Claude no lo mencionó, recordar amablemente
  if (pendienteCuenta && !tieneDatosBancarios) {
    respFinal += `\n\n📋 _Recuerda que aún necesitamos tus datos bancarios para procesar el pago._ 🙏`;
  }
  db.prepare("INSERT INTO conversaciones (proveedor_nit, mensaje_enviado, respuesta, estado) VALUES (?,?,?,'respondido')").run(proveedor.nit, `[WA]: ${texto}`, respFinal);
  await enviarMensajeReal(from, respFinal);
}

async function manejarDocumentoProveedor(from, proveedor, base64, mimeType, facturasErp) {
  try {
    const nombre = proveedor.nombre.split(" ")[0];
    // Extraer facturas del documento con Claude
    const resultado = await analizarImagenProveedor(base64, mimeType);
    const facturasDoc = resultado.facturas_encontradas || [];

    if (facturasDoc.length === 0) {
      // No se encontraron facturas — responder genéricamente
      await manejarImagen(from, proveedor, base64, mimeType);
      return;
    }

    // Comparar cada factura del documento con el ERP
    const totalPendienteErp = facturasErp.reduce((s, f) => s + (Number(f.saldo_pendiente) || 0), 0);
    let lineas = "";
    let hayDiscrepancia = false;
    let hayFacturasNoEncontradas = false;

    for (const fd of facturasDoc) {
      if (!fd.numero_factura) continue;
      const numDoc = String(fd.numero_factura).trim();
      const valorDoc = fd.valor_neto || fd.valor_factura || null;

      // Buscar en ERP por número de factura (parcial)
      const enErp = facturasErp.find(f => {
        const numErp = (f.factura_completa || f.numero_factura || "").trim();
        return numErp.includes(numDoc) || numDoc.includes(numErp);
      });

      if (!enErp) {
        hayFacturasNoEncontradas = true;
        lineas += `🧾 *${numDoc}*\n`;
        lineas += `   ⚠️ No encontrada en nuestro sistema\n`;
        if (valorDoc) lineas += `   💵 Valor documento: $${Number(valorDoc).toLocaleString("es-CO")}\n`;
        lineas += `\n`;
      } else {
        const venc = enErp.fecha_vencimiento
          ? new Date(enErp.fecha_vencimiento).toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit", year: "numeric" })
          : "—";
        const dias = enErp.dias_para_vencer ?? 0;
        const saldoErp = Number(enErp.saldo_pendiente) || 0;
        const tienda = enErp.tienda_nombre ? ` | 🏪 ${enErp.tienda_nombre}` : "";

        // Comparar valores (tolerancia 2% del mayor valor)
        const diferenciaValor = valorDoc ? Math.abs(valorDoc - saldoErp) : 0;
        const tolerancia = valorDoc ? Math.max(saldoErp, valorDoc) * 0.02 : 0;
        const hayDifValor = valorDoc && diferenciaValor > tolerancia;
        if (hayDifValor) hayDiscrepancia = true;

        lineas += `🧾 *${numDoc}*${tienda}\n`;
        lineas += `   💵 Nuestro sistema: *$${saldoErp.toLocaleString("es-CO")}*\n`;
        if (hayDifValor) lineas += `   ⚠️ Tu documento: $${Number(valorDoc).toLocaleString("es-CO")} _(diferencia de $${diferenciaValor.toLocaleString("es-CO")})_\n`;
        else if (valorDoc) lineas += `   ✅ Valor coincide: $${Number(valorDoc).toLocaleString("es-CO")}\n`;
        lineas += `   📅 Vence: ${venc} (${dias > 0 ? `en ${dias} días` : dias === 0 ? "HOY" : `vencida hace ${Math.abs(dias)} días`})\n`;
        if (dias > 7) lineas += `   ⏳ _Aún no programada para pago esta semana_\n`;
        else lineas += `   🟢 _Incluida en programación de pago_\n`;
        lineas += `\n`;
      }
    }

    const facturasPago = facturasErp.filter(f => (f.dias_para_vencer ?? 0) <= 7);

    let msg = `¡Hola ${nombre}! 😊 Recibimos tu documento y lo comparamos con nuestro sistema.\n\n`;
    msg += `📋 *Validación de facturas:*\n\n${lineas}`;
    msg += `💰 *Total pendiente en sistema: $${totalPendienteErp.toLocaleString("es-CO")} COP*\n\n`;

    if (hayDiscrepancia) {
      msg += `⚠️ Encontramos diferencias en los valores. Por favor verifica con tu equipo de cartera para coordinar la conciliación.\n\n`;
    }
    if (hayFacturasNoEncontradas) {
      msg += `⚠️ Algunas facturas de tu documento no están registradas en nuestro sistema. Por favor envíalas al equipo de contabilidad para revisión.\n\n`;
    }
    if (facturasPago.length === 0) {
      msg += `⏳ *Ninguna de tus facturas está programada para pago esta semana.* Te contactaremos cuando se acerquen las fechas de vencimiento.\n\n`;
    } else {
      msg += `✅ Tienes facturas incluidas en la programación de pago de esta semana. Te confirmamos el valor y datos bancarios a la brevedad.\n\n`;
    }
    msg += `_¡Que Dios les bendiga! 🙏_\n\n_MakaBot - Tesorería MAKA QCUTE SAS_`;

    db.prepare("INSERT INTO conversaciones (proveedor_nit, mensaje_enviado, respuesta, estado) VALUES (?,?,?,'respondido')").run(proveedor.nit, "[DOCUMENTO WA]", msg);
    await enviarMensajeReal(from, msg);

  } catch (err) {
    console.error("Error analizando documento proveedor:", err.message);
    // Si es rate limit, esperar y reintentar una vez
    const isRateLimit = (err?.status === 429) || (err?.message || "").includes("rate_limit") || (err?.message || "").includes("429");
    if (isRateLimit) {
      console.warn("⏳ Rate limit en documento — esperando 10s y reintentando...");
      await new Promise(r => setTimeout(r, 10000));
      try {
        await manejarImagen(from, proveedor, base64, mimeType);
        return;
      } catch(e2) { console.error("Reintento fallido:", e2.message); }
    }
    // Responder al proveedor para que no quede en silencio
    const nombre = proveedor.nombre.split(" ")[0];
    const msgError = `${nombre}, recibimos tu documento. 😊 Nuestro equipo lo revisará y te confirmará en breve.\n\n¡Que Dios les bendiga! 🙏\n\n_MakaBot - Tesorería MAKA QCUTE SAS_`;
    await enviarMensajeReal(from, msgError).catch(() => {});
  }
}

async function manejarImagen(from, proveedor, base64, mimeType) {
  try {
    // Verificar si hay OC pendiente de PDF para este proveedor
    const buffer = Buffer.from(base64, "base64");
    const ocPendiente = await registrarPdfRecibido(
      proveedor.nit, proveedor.nombre, buffer, mimeType
    );
    if (ocPendiente) {
      const msg =
        `¡Gracias! 😊 Recibimos el documento de la *OC #${ocPendiente.solicitud.numero_orden}*.\n\n` +
        `✅ Quedó registrado correctamente en el sistema.\n\n` +
        `¡Que Dios les bendiga y prospere su negocio! 🙏\n\n_MakaBot - Compras QCUTE SAS_`;
      db.prepare("INSERT INTO conversaciones (proveedor_nit, mensaje_enviado, respuesta, estado) VALUES (?,?,?,'pdf_compra_recibido')")
        .run(proveedor.nit, "[PDF/IMAGEN WA]", msg);
      await enviarMensajeReal(from, msg);
      return;
    }

    const resultado = await analizarImagenProveedor(base64, mimeType);
    let resumen = "";
    for (const fi of resultado.facturas_encontradas || []) {
      if (!fi.numero_factura || !fi.valor_neto) continue;
      const fac = db.prepare("SELECT * FROM facturas WHERE numero_factura=? AND proveedor_nit=?").get(fi.numero_factura, proveedor.nit);
      if (fac && fi.valor_neto <= fac.valor_final) {
        db.prepare("UPDATE facturas SET valor_final=?,valor_proveedor=?,descuento_pronto_pago=COALESCE(?,descuento_pronto_pago),flete=COALESCE(?,flete),origen_valor='imagen_proveedor' WHERE id=?")
          .run(fi.valor_neto, fi.valor_neto, fi.descuento, fi.flete, fac.id);
        resumen += `\n• Factura ${fi.numero_factura}: *$${fi.valor_neto.toLocaleString("es-CO")}* ✅`;
      }
    }
    const resp = resumen
      ? `Recibimos tu liquidación 📊\n\nActualizamos:${resumen}\n\n¡Que Dios les bendiga! 🙏\n\n_MakaBot - Tesorería MAKA QCUTE SAS_`
      : `Recibimos tu imagen 📎. Nuestro equipo la revisará.\n\n¡Bendiciones! 🙏\n\n_MakaBot - Tesorería MAKA QCUTE SAS_`;
    db.prepare("INSERT INTO conversaciones (proveedor_nit, mensaje_enviado, respuesta, estado) VALUES (?,?,?,'respondido')").run(proveedor.nit, "[IMAGEN WA]", resp);
    await enviarMensajeReal(from, resp);
  } catch(err) {
    console.error("Error procesando imagen:", err.message);
    const isRateLimit = (err?.status === 429) || (err?.message || "").includes("rate_limit") || (err?.message || "").includes("429");
    if (isRateLimit) {
      console.warn("⏳ Rate limit en imagen — esperando 10s y reintentando...");
      await new Promise(r => setTimeout(r, 10000));
      try { await manejarImagen(from, proveedor, base64, mimeType); return; }
      catch(e2) { console.error("Reintento imagen fallido:", e2.message); }
    }
    const nombre = proveedor.nombre.split(" ")[0];
    await enviarMensajeReal(from, `${nombre}, recibimos tu documento 📎. Nuestro equipo lo revisará y te confirmará.\n\n¡Bendiciones! 🙏\n\n_MakaBot - Tesorería MAKA QCUTE SAS_`).catch(() => {});
  }
}

async function manejarMensajeInterno(from, msg, msgType) {
  if (!msg.hasMedia || (msgType !== "image" && msgType !== "document")) {
    await enviarMensajeReal(from, `Hola equipo 👋\n\nEnvíame una 📸 *imagen o PDF* del comprobante con el caption:\n_"Proveedor, Factura(s), Valor"_\n\nEjemplo: _"Textiles ABC, F-001 F-002, $1.500.000"_\n\n_MakaBot_`);
    return;
  }

  const caption = msg.caption || msg.body || "";
  if (!caption.trim()) {
    await enviarMensajeReal(from, `⚠️ Falta el caption. Reenvía con:\n_"Proveedor, Factura(s), Valor"_\n\n_MakaBot_`);
    return;
  }

  await enviarMensajeReal(from, `⏳ Procesando soporte...`);
  try {
    const { buffer, mimeType } = await descargarMedia(msg);
    const base64 = buffer.toString("base64");
    const proveedores = db.prepare("SELECT nit, nombre FROM proveedores").all();
    const datos = await extraerDatosSoporte(caption, proveedores, base64, mimeType);

    if (!datos?.proveedor_nit) {
      await enviarMensajeReal(from, `⚠️ No identifiqué el proveedor en: _"${caption}"_\n\nVerifica el nombre e intenta de nuevo.\n\n_MakaBot_`);
      return;
    }

    const { guardarSoporte } = require("../services/soportesService");
    const resultado = await guardarSoporte({
      proveedor_nit:  datos.proveedor_nit,
      facturas:       datos.facturas,
      valor:          datos.valor,
      fecha_pago:     datos.fecha_pago,
      notas:          datos.notas,
      buffer,
      originalname:   `soporte_${Date.now()}.jpg`,
      mimetype:       mimeType,
    });

    await enviarMensajeReal(from,
      `✅ *Soporte registrado*\n\n🏢 ${resultado.proveedor_nombre}\n📄 ${datos.facturas || "—"}\n💰 ${datos.valor ? `$${Number(datos.valor).toLocaleString("es-CO")}` : "—"}\n\nProveedor notificado por WhatsApp. 🙏\n\n_MakaBot_`
    );
  } catch(err) {
    console.error("Error soporte interno:", err.message);
    await enviarMensajeReal(from, `❌ Error: ${err.message}\n\nUsa el panel web para subir el soporte.\n\n_MakaBot_`);
  }
}

function buscarProveedorPorTelefono(telefonoLimpio) {
  const ultimos10 = telefonoLimpio.replace(/\D/g, "").slice(-10);
  const todos = db.prepare("SELECT * FROM proveedores").all();
  for (const p of todos) {
    if ((p.telefono  || "").replace(/\D/g, "").slice(-10) === ultimos10) return p;
    if ((p.telefono2 || "").replace(/\D/g, "").slice(-10) === ultimos10) return p;
  }
  return null;
}

module.exports = router;
