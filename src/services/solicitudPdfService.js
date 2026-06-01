/**
 * solicitudPdfService.js
 * Gestiona el flujo completo de comunicación con proveedores para OC de QCUTE 360.
 *
 * FLUJO:
 *  Etapa 0 → Registrada, sin mensaje aún
 *  Etapa 1 → (al crear OC)   Mensaje inicial de la OC
 *  Etapa 2 → (48h sin doc)   Primera solicitud de factura/remisión
 *  Etapa 2+ → (diario)       Recordatorio diario de factura hasta recibirla
 *  pdf_recibido = 1
 *  Etapa guia 0 → Sin solicitud de guía aún
 *  Etapa guia 1 → (72h desde creación + pdf recibido) Primera solicitud de guía/estado envío
 *  Etapa guia 1+ → (diario)  Recordatorio diario de guía hasta recibir en tienda
 *  guia_recibida = 1         OC recibida en tienda → se detiene todo
 */

const db    = require("../models/db");
const path  = require("path");
const fs    = require("fs");
const fetch = require("node-fetch");

const PDFS_DIR         = path.join(__dirname, "../../pdfs_compras");
const HORAS_ETAPA2     = 24;   // horas desde creación para primer recordatorio factura
const HORAS_ETAPA_GUIA = 24;   // horas desde creación para solicitar guía (una vez recibido el doc)
const HORAS_RECORDATORIO = 24; // cada cuántas horas repetir recordatorio
const HORA_ENVIO       = 10;   // hora del día (10AM) para enviar recordatorios

const SUPABASE_URL  = "https://estrxgfxwhcwilgdbpfc.supabase.co";
const SUPABASE_KEY  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVzdHJ4Z2Z4d2hjd2lsZ2RicGZjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzYzMDk3MywiZXhwIjoyMDg5MjA2OTczfQ.h-NhBtUPsq4h_6loonuMVfZtt27BLci8mFH3xU2LZFw";

// Estados de Supabase que indican que la OC está cerrada / en camino → detener mensajes
const ESTADOS_RECIBIDO = ["recibida en tienda", "en validación", "validada", "cerrada", "en tránsito", "en transito", "entregada", "cancelada"];

let _enviarFn = null;

if (!fs.existsSync(PDFS_DIR)) fs.mkdirSync(PDFS_DIR, { recursive: true });

// ─── Registro de nueva OC ────────────────────────────────────────────────────

async function registrarOrden({
  oc_id, numero_orden, proveedor_nit, proveedor_nombre,
  telefono, tienda, valor_total, descripcion, excluir = 0,
}) {
  const existente = db.prepare("SELECT id FROM solicitudes_pdf_compra WHERE oc_id = ?").get(String(oc_id));
  if (existente) return { ya_existia: true, id: existente.id };

  // Buscar teléfono en SQLite si no viene en el payload
  let tel = telefono;
  if (!tel && proveedor_nombre) {
    const palabras = proveedor_nombre.trim().split(/\s+/).slice(0, 3);
    for (const p of palabras) {
      if (p.length < 3) continue;
      const prov = db.prepare("SELECT telefono FROM proveedores WHERE nombre LIKE ? LIMIT 1").get(`%${p}%`);
      if (prov?.telefono) { tel = prov.telefono; break; }
    }
  }

  const row = db.prepare(`
    INSERT INTO solicitudes_pdf_compra
      (oc_id, numero_orden, proveedor_nit, proveedor_nombre, telefono,
       tienda, valor_total, descripcion, estado, etapa, excluir)
    VALUES (?,?,?,?,?,?,?,?,'pendiente',0,?)
  `).run(
    String(oc_id), numero_orden || String(oc_id),
    proveedor_nit || "", proveedor_nombre || "",
    tel || "", tienda || "", valor_total || 0,
    descripcion || "", excluir ? 1 : 0,
  );

  const id = row.lastInsertRowid;

  if (tel && !excluir) {
    await enviarEtapa1(id);
  } else {
    console.log(`⚠️  OC ${numero_orden} sin teléfono para ${proveedor_nombre} — no se enviará WhatsApp`);
  }

  return { id, telefono: tel };
}

// ─── ETAPA 1: Mensaje inicial (al crear la OC) ───────────────────────────────

async function enviarEtapa1(id) {
  const s = db.prepare("SELECT * FROM solicitudes_pdf_compra WHERE id = ?").get(id);
  if (!s || !s.telefono || s.excluir || s.etapa >= 1) return;

  const mensaje = s.descripcion && s.descripcion.includes("QCUTE")
    ? s.descripcion
    : `Hola 👋\n\nLes escribe MAKA – QCUTE. Hemos generado la *Orden de Compra ${s.numero_orden}* a su nombre${s.tienda ? ` para las tiendas *${s.tienda}*` : ""}.\n\nPor favor envíennos la remisión, factura o soportes de la compra en formato digital (PDF, Excel u otro documento).\n\nMuchas gracias.\n\n_QCUTE SAS_`;

  await _enviar(s.telefono, mensaje, id, 1);
  console.log(`📤 [Etapa 1] OC ${s.numero_orden} → ${s.proveedor_nombre}`);
}

// ─── ETAPA 2: Primera solicitud de factura/remisión (48h desde creación) ─────

async function enviarEtapa2(id) {
  const s = db.prepare("SELECT * FROM solicitudes_pdf_compra WHERE id = ?").get(id);
  if (!s || !s.telefono || s.excluir || s.pdf_recibido || s.etapa >= 2) return;

  const mensaje =
    `Hola 👋 ¡Que Dios les bendiga!\n\n` +
    `Les escribimos del equipo de Compras de *QCUTE SAS*.\n\n` +
    `Ayer generamos la *Orden de Compra ${s.numero_orden}*${s.tienda ? ` para las tiendas *${s.tienda}*` : ""} y aún no hemos recibido el documento soporte.\n\n` +
    `📄 Por favor envíennos la *factura de venta o remisión* en formato digital (PDF, Excel o imagen del documento original).\n\n` +
    `Este documento es necesario para poder registrar la entrada de la mercancía en el sistema.\n\n` +
    `¡Muchas gracias! 🙏\n\n_MakaBot - Compras QCUTE SAS_`;

  await _enviar(s.telefono, mensaje, id, 2);
  console.log(`📤 [Etapa 2] Solicitud factura 48h OC ${s.numero_orden} → ${s.proveedor_nombre}`);
}

// ─── RECORDATORIO DIARIO: Factura pendiente ───────────────────────────────────

async function enviarRecordatorioFactura(id) {
  const s = db.prepare("SELECT * FROM solicitudes_pdf_compra WHERE id = ?").get(id);
  if (!s || !s.telefono || s.excluir || s.pdf_recibido || s.etapa < 2) return;

  const dias = Math.floor((Date.now() - new Date(s.created_at).getTime()) / (1000 * 60 * 60 * 24));

  const mensaje =
    `Hola 👋 ¡Buenos días, que Dios les bendiga!\n\n` +
    `Seguimos pendientes del documento soporte de la *Orden de Compra ${s.numero_orden}*${s.tienda ? ` (tiendas: *${s.tienda}*)` : ""} generada hace *${dias} días*.\n\n` +
    `📄 Por favor envíennos la *factura o remisión* en formato digital para poder registrar la mercancía en el sistema y gestionar el pago a tiempo. 🙏\n\n` +
    `_MakaBot - Compras QCUTE SAS_`;

  await _enviar(s.telefono, mensaje, id, s.etapa);
  console.log(`📤 [Recordatorio factura] OC ${s.numero_orden} (día ${dias}) → ${s.proveedor_nombre}`);
}

// ─── ETAPA GUÍA 1: Primera solicitud de guía de envío (pdf recibido + 72h desde creación) ──

async function enviarSolicitudGuia(id) {
  const s = db.prepare("SELECT * FROM solicitudes_pdf_compra WHERE id = ?").get(id);
  if (!s || !s.telefono || s.excluir || !s.pdf_recibido || s.guia_recibida || s.etapa_guia >= 1) return;

  const mensaje =
    `Hola 👋 ¡Que Dios les prospere!\n\n` +
    `Gracias por enviarnos el documento soporte de la *OC ${s.numero_orden}*${s.tienda ? ` para las tiendas *${s.tienda}*` : ""}.\n\n` +
    `Ya han pasado más de 72 horas y aún no hemos recibido la mercancía. ¿Nos pueden compartir:\n\n` +
    `🚚 *Guía de transporte* (número y transportadora)\n` +
    `📦 *Estado actual del pedido* (¿ya fue despachado?)\n` +
    `📅 *Fecha estimada de llegada*\n\n` +
    `Esto nos ayuda a organizar la recepción en los puntos de venta. ¡Muchas gracias! 🙏\n\n` +
    `_MakaBot - Compras QCUTE SAS_`;

  await _enviarGuia(s.telefono, mensaje, id, 1);
  console.log(`📤 [Guía 1] Solicitud guía OC ${s.numero_orden} → ${s.proveedor_nombre}`);
}

// ─── RECORDATORIO DIARIO: Guía de envío pendiente ────────────────────────────

async function enviarRecordatorioGuia(id) {
  const s = db.prepare("SELECT * FROM solicitudes_pdf_compra WHERE id = ?").get(id);
  if (!s || !s.telefono || s.excluir || !s.pdf_recibido || s.guia_recibida || s.etapa_guia < 1) return;

  const dias = Math.floor((Date.now() - new Date(s.created_at).getTime()) / (1000 * 60 * 60 * 24));

  const mensaje =
    `Hola 👋 ¡Buenos días!\n\n` +
    `Seguimos en espera de la mercancía de la *Orden de Compra ${s.numero_orden}*${s.tienda ? ` para *${s.tienda}*` : ""} (día ${dias} desde la OC).\n\n` +
    `¿Nos pueden informar el estado actual del envío?\n` +
    `🚚 *Guía / número de seguimiento*\n` +
    `📅 *Fecha estimada de llegada*\n\n` +
    `¡Gracias por su atención! 🙏\n\n` +
    `_MakaBot - Compras QCUTE SAS_`;

  await _enviarGuia(s.telefono, mensaje, id, s.etapa_guia);
  console.log(`📤 [Recordatorio guía] OC ${s.numero_orden} (día ${dias}) → ${s.proveedor_nombre}`);
}

// ─── ETAPA 3: Solicitud PDF (cuando proveedor confirma vía WhatsApp) ─────────
// Llamado desde webhook.js cuando el proveedor responde un texto

async function confirmarPedidoYPedirPdf(proveedorNit, proveedorNombre) {
  const s = buscarSolicitudPendiente(proveedorNit, proveedorNombre);
  if (!s || s.pdf_recibido || s.etapa >= 3) return null;

  db.prepare(`
    UPDATE solicitudes_pdf_compra
    SET estado = 'confirmado', fecha_confirmacion = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(s.id);

  const mensaje =
    `¡Gracias por confirmar! 😊 ¡Que Dios les bendiga!\n\n` +
    `Perfecto, ya tenemos registrada la confirmación del pedido de la *OC ${s.numero_orden}*.\n\n` +
    `Para completar el proceso en el sistema, necesitamos que nos envíen por aquí el documento soporte:\n\n` +
    `📄 *Factura de venta* o *Remisión* en formato *digital* (PDF, Excel o imagen clara del documento original)\n\n` +
    `⚠️ Por favor *no envíen fotos* del documento — necesitamos el archivo digital original.\n\n` +
    `¡Muchas gracias y que Dios prospere su negocio! 🙏\n\n_QCUTE SAS_`;

  await _enviar(s.telefono, mensaje, s.id, 3);
  console.log(`📤 [Etapa 3] Solicitud PDF OC ${s.numero_orden} → ${s.proveedor_nombre}`);
  return s;
}

// ─── Registro de PDF recibido ────────────────────────────────────────────────

async function registrarPdfRecibido(proveedorNit, proveedorNombre, buffer, mimeType) {
  const s = buscarSolicitudPendiente(proveedorNit, proveedorNombre);
  if (!s) return false;

  const ext      = mimeType.includes("pdf") ? "pdf" : mimeType.includes("png") ? "png" : "jpg";
  const nombreDir = (s.proveedor_nombre || proveedorNombre || "SIN_NOMBRE")
    .replace(/[^a-zA-Z0-9\s]/g, "").trim().replace(/\s+/g, "_").substring(0, 40);
  const nitDir   = (s.proveedor_nit || proveedorNit || "SIN_NIT").replace(/[^0-9a-zA-Z-]/g, "");
  const dirPath  = path.join(PDFS_DIR, `${nitDir}_${nombreDir}`);
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });

  const ts       = new Date().toISOString().replace(/[:.]/g, "-").substring(0, 19);
  const filename = `OC${s.numero_orden}_${ts}.${ext}`;
  const filePath = path.join(dirPath, filename);
  fs.writeFileSync(filePath, buffer);

  db.prepare(`
    UPDATE solicitudes_pdf_compra
    SET pdf_recibido = 1, estado = 'pdf_recibido', archivo_path = ?,
        etapa = 5, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(filePath, s.id);

  console.log(`✅ PDF recibido OC ${s.numero_orden} — ${s.proveedor_nombre} → ${filename}`);
  return { solicitud: s, filePath, filename };
}

// ─── Actualizar estado en Supabase → "cerrada" ──────────────────────────────

async function cerrarOCenSupabase(oc_id, numero_orden) {
  if (!oc_id) return;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/ordenes_compra?id=eq.${oc_id}`, {
      method: "PATCH",
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
      },
      body: JSON.stringify({ estado: "cerrada", cerrado_master: true }),
    });
    if (res.ok) {
      console.log(`✅ OC ${numero_orden} cerrada en Supabase`);
    } else {
      const txt = await res.text();
      console.error(`⚠️  Error cerrando OC ${numero_orden} en Supabase:`, txt);
    }
  } catch (err) {
    console.error(`⚠️  No se pudo cerrar OC ${numero_orden} en Supabase:`, err.message);
  }
}

// ─── Polling QCUTE 360: buscar OC nuevas en Supabase ────────────────────────

async function sincronizarOrdenes() {
  try {
    const url = `${SUPABASE_URL}/rest/v1/ordenes_compra?select=id,codigo,proveedor_id,estado,cerrado_master,total_final,mensaje_whatsapp,proveedores(nombre,whatsapp)&order=created_at.desc&limit=200`;
    const res  = await fetch(url, {
      headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}` }
    });
    const ordenes = await res.json();

    if (!Array.isArray(ordenes)) {
      console.error("⚠️  Supabase OC response inválida:", ordenes);
      return;
    }

    let nuevas = 0;
    let marcadas = 0;

    for (const oc of ordenes) {
      // Marcar guia_recibida si ya está en estado cerrado en Supabase (por estado O cerrado_master)
      const esCerrada = ESTADOS_RECIBIDO.includes(oc.estado) || oc.cerrado_master === true;
      if (esCerrada) {
        const existente = db.prepare("SELECT id, guia_recibida FROM solicitudes_pdf_compra WHERE oc_id = ?").get(String(oc.id));
        if (existente && !existente.guia_recibida) {
          db.prepare("UPDATE solicitudes_pdf_compra SET guia_recibida = 1, pdf_recibido = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(existente.id);
          marcadas++;
          console.log(`✅ OC ${oc.codigo} marcada como recibida (estado: ${oc.estado}, cerrado_master: ${oc.cerrado_master})`);
        }
        continue; // No agregar como nueva si ya está cerrada/recibida
      }

      // Omitir si ya existe
      const existente = db.prepare("SELECT id FROM solicitudes_pdf_compra WHERE oc_id = ?").get(String(oc.id));
      if (existente) continue;

      // Registrar nueva OC
      const nombreProveedor = oc.proveedores?.nombre || "";
      const msgWA           = oc.mensaje_whatsapp || "";
      const matchTiendas    = msgWA.match(/Para las tiendas ([^.]+)\./);
      const tiendas         = matchTiendas ? matchTiendas[1].trim() : "";
      // Teléfono SOLO de Supabase proveedores.whatsapp — nunca del ERP
      const telefonoWA      = oc.proveedores?.whatsapp || "";

      await registrarOrden({
        oc_id:            oc.id,
        numero_orden:     oc.codigo || oc.id,
        proveedor_nit:    oc.proveedor_id || "",
        proveedor_nombre: nombreProveedor,
        telefono:         telefonoWA,
        tienda:           tiendas,
        valor_total:      oc.total_final || 0,
        descripcion:      msgWA,
        excluir:          0,
      });
      nuevas++;
    }

    if (nuevas > 0)   console.log(`📦 ${nuevas} OC nuevas sincronizadas de QCUTE 360`);
    if (marcadas > 0) console.log(`✅ ${marcadas} OC marcadas como recibidas en tienda`);

    // Reintentar SOLO OCs nuevas (últimas 2h) con etapa=0 que no enviaron mensaje inicial
    if (_enviarFn && nuevas > 0) {
      const pendientesEtapa0 = db.prepare(`
        SELECT * FROM solicitudes_pdf_compra
        WHERE excluir = 0 AND etapa = 0 AND telefono != '' AND telefono IS NOT NULL
          AND created_at >= datetime('now', '-2 hours')
      `).all();
      for (const s of pendientesEtapa0) {
        console.log(`🔄 Reintentando Etapa 1 para OC ${s.numero_orden} → ${s.proveedor_nombre}`);
        await enviarEtapa1(s.id);
      }
    }
  } catch (err) {
    console.error("❌ Error sincronizando OC de Supabase:", err.message);
  }
}

// ─── Scheduler: verificar etapas pendientes ──────────────────────────────────

async function procesarPendientes() {
  if (!_enviarFn) return;
  console.log(`\n📋 Verificando etapas OC... ${new Date().toLocaleString("es-CO")}`);

  // ── PRIMERO: sincronizar estado desde Supabase para marcar OCs cerradas ─────
  // Esto es CRÍTICO: sin esto, se enviarían mensajes a OCs ya cerradas en Supabase
  await sincronizarOrdenes();

  // ── Fase 0: OCs registradas que nunca enviaron mensaje inicial (etapa=0 con teléfono) ──
  const paraEtapa1 = db.prepare(`
    SELECT * FROM solicitudes_pdf_compra
    WHERE excluir = 0 AND pdf_recibido = 0
      AND etapa = 0 AND telefono != '' AND telefono IS NOT NULL
  `).all();
  for (const s of paraEtapa1) await enviarEtapa1(s.id);

  // ── Fase 1: Seguimiento de FACTURA/REMISIÓN ──────────────────────────────

  // Etapa 2: Primera solicitud de factura (24h sin doc, etapa=1)
  const paraEtapa2 = db.prepare(`
    SELECT * FROM solicitudes_pdf_compra
    WHERE excluir = 0 AND pdf_recibido = 0
      AND etapa = 1
      AND created_at <= datetime('now', '-${HORAS_ETAPA2} hours')
  `).all();
  for (const s of paraEtapa2) await enviarEtapa2(s.id);

  // Recordatorio diario: factura no recibida (etapa >= 2, sin doc, último recordatorio > 24h)
  const paraRecordatorioFactura = db.prepare(`
    SELECT * FROM solicitudes_pdf_compra
    WHERE excluir = 0 AND pdf_recibido = 0
      AND etapa >= 2
      AND (ultimo_recordatorio IS NULL
           OR ultimo_recordatorio <= datetime('now', '-${HORAS_RECORDATORIO} hours'))
  `).all();
  for (const s of paraRecordatorioFactura) await enviarRecordatorioFactura(s.id);

  // ── Fase 2: Seguimiento de GUÍA DE ENVÍO ─────────────────────────────────

  // Primera solicitud de guía (pdf recibido, 72h desde creación, etapa_guia=0)
  const paraSolicitudGuia = db.prepare(`
    SELECT * FROM solicitudes_pdf_compra
    WHERE excluir = 0 AND pdf_recibido = 1 AND guia_recibida = 0
      AND etapa_guia = 0
      AND created_at <= datetime('now', '-${HORAS_ETAPA_GUIA} hours')
  `).all();
  for (const s of paraSolicitudGuia) await enviarSolicitudGuia(s.id);

  // Recordatorio diario: guía no recibida (etapa_guia >= 1, último recordatorio_guia > 24h)
  const paraRecordatorioGuia = db.prepare(`
    SELECT * FROM solicitudes_pdf_compra
    WHERE excluir = 0 AND pdf_recibido = 1 AND guia_recibida = 0
      AND etapa_guia >= 1
      AND (ultimo_recordatorio_guia IS NULL
           OR ultimo_recordatorio_guia <= datetime('now', '-${HORAS_RECORDATORIO} hours'))
  `).all();
  for (const s of paraRecordatorioGuia) await enviarRecordatorioGuia(s.id);

  const total = paraEtapa2.length + paraRecordatorioFactura.length + paraSolicitudGuia.length + paraRecordatorioGuia.length;
  if (total === 0) console.log("   Sin pendientes.");
  else console.log(`   Procesadas: ${paraEtapa2.length} etapa2, ${paraRecordatorioFactura.length} rec-factura, ${paraSolicitudGuia.length} guia1, ${paraRecordatorioGuia.length} rec-guia`);
}

// ─── Helpers internos ────────────────────────────────────────────────────────

function buscarSolicitudPendiente(proveedorNit, proveedorNombre) {
  if (proveedorNit) {
    const s = db.prepare(`
      SELECT * FROM solicitudes_pdf_compra
      WHERE proveedor_nit = ? AND pdf_recibido = 0 AND excluir = 0
      ORDER BY created_at DESC LIMIT 1
    `).get(proveedorNit);
    if (s) return s;
  }

  if (proveedorNombre) {
    const palabras = proveedorNombre.trim().split(/\s+/).slice(0, 3);
    for (const p of palabras) {
      if (p.length < 3) continue;
      const s = db.prepare(`
        SELECT * FROM solicitudes_pdf_compra
        WHERE proveedor_nombre LIKE ? AND pdf_recibido = 0 AND excluir = 0
        ORDER BY created_at DESC LIMIT 1
      `).get(`%${p}%`);
      if (s) return s;
    }
  }
  return null;
}

async function _enviar(telefono, mensaje, id, etapa) {
  if (!_enviarFn) return;
  try {
    await _enviarFn(telefono, mensaje);
    db.prepare(`
      UPDATE solicitudes_pdf_compra
      SET etapa = ?, solicitudes_enviadas = solicitudes_enviadas + 1,
          ultimo_recordatorio = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(etapa, id);
  } catch (err) {
    console.error(`❌ Error enviando etapa ${etapa}:`, err.message);
  }
}

async function _enviarGuia(telefono, mensaje, id, etapaGuia) {
  if (!_enviarFn) return;
  try {
    await _enviarFn(telefono, mensaje);
    db.prepare(`
      UPDATE solicitudes_pdf_compra
      SET etapa_guia = ?, solicitudes_enviadas = solicitudes_enviadas + 1,
          ultimo_recordatorio_guia = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(etapaGuia + 1, id);
  } catch (err) {
    console.error(`❌ Error enviando guía etapa ${etapaGuia}:`, err.message);
  }
}

// ─── Envío inmediato manual para una OC específica ──────────────────────────
// Busca la OC del proveedor, envía el mensaje apropiado ahora y resetea el timer
// para que el scheduler de 10AM lo retome mañana.

async function enviarOCInmediato(proveedorNit, proveedorNombre) {
  if (!_enviarFn) throw new Error("WhatsApp no inicializado");

  // Buscar OC pendiente de remisión
  let s = null;
  if (proveedorNit) {
    s = db.prepare(`
      SELECT * FROM solicitudes_pdf_compra
      WHERE proveedor_nit = ? AND pdf_recibido = 0 AND excluir = 0
      ORDER BY created_at DESC LIMIT 1
    `).get(proveedorNit);
  }
  if (!s && proveedorNombre) {
    const palabras = proveedorNombre.trim().split(/\s+/).slice(0, 3);
    for (const p of palabras) {
      if (p.length < 3) continue;
      s = db.prepare(`
        SELECT * FROM solicitudes_pdf_compra
        WHERE proveedor_nombre LIKE ? AND pdf_recibido = 0 AND excluir = 0
        ORDER BY created_at DESC LIMIT 1
      `).get(`%${p}%`);
      if (s) break;
    }
  }
  if (!s) throw new Error(`No se encontró OC pendiente para ${proveedorNombre || proveedorNit}`);
  if (!s.telefono) throw new Error(`OC ${s.numero_orden} sin teléfono registrado`);

  const dias = Math.floor((Date.now() - new Date(s.created_at).getTime()) / (1000 * 60 * 60 * 24));

  // Construir mensaje según etapa actual
  let mensaje;
  if (s.etapa === 0) {
    // Nunca se envió etapa1 — enviar mensaje inicial
    mensaje = s.descripcion && s.descripcion.includes("QCUTE")
      ? s.descripcion
      : `Hola 👋\n\nLes escribe MAKA – QCUTE. Hemos generado la *Orden de Compra ${s.numero_orden}* a su nombre${s.tienda ? ` para las tiendas *${s.tienda}*` : ""}.\n\nPor favor envíennos la remisión, factura o soportes de la compra en formato digital (PDF, Excel u otro documento).\n\nMuchas gracias.\n\n_QCUTE SAS_`;
  } else {
    // Ya se envió etapa1 — enviar recordatorio de remisión pendiente
    mensaje =
      `Hola 👋 ¡Buenos días, que Dios les bendiga!\n\n` +
      `Seguimos pendientes del documento soporte de la *Orden de Compra ${s.numero_orden}*${s.tienda ? ` (tiendas: *${s.tienda}*)` : ""} generada hace *${dias} día${dias !== 1 ? "s" : ""}*.\n\n` +
      `📄 Por favor envíennos la *factura o remisión* en formato digital para poder registrar la mercancía en el sistema y gestionar el pago a tiempo. 🙏\n\n` +
      `_MakaBot - Compras QCUTE SAS_`;
  }

  await _enviarFn(s.telefono, mensaje);

  // Actualizar etapa y resetear timer para que el scheduler lo retome mañana a las 10AM
  const nuevaEtapa = Math.max(s.etapa, 1);
  db.prepare(`
    UPDATE solicitudes_pdf_compra
    SET etapa = ?, solicitudes_enviadas = solicitudes_enviadas + 1,
        ultimo_recordatorio = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(nuevaEtapa, s.id);

  console.log(`📤 [OC Manual] OC ${s.numero_orden} → ${s.proveedor_nombre} (etapa ${nuevaEtapa})`);
  return { solicitud: s, mensaje, etapa: nuevaEtapa };
}

// ─── Registrar guía de transporte recibida vía texto ────────────────────────

function registrarGuiaRecibida(proveedorNit, proveedorNombre, textoGuia) {
  let s = null;
  if (proveedorNit) {
    s = db.prepare(`
      SELECT * FROM solicitudes_pdf_compra
      WHERE proveedor_nit = ? AND pdf_recibido = 1 AND guia_recibida = 0 AND excluir = 0
      ORDER BY created_at DESC LIMIT 1
    `).get(proveedorNit);
  }
  if (!s && proveedorNombre) {
    const palabras = proveedorNombre.trim().split(/\s+/).slice(0, 3);
    for (const p of palabras) {
      if (p.length < 3) continue;
      s = db.prepare(`
        SELECT * FROM solicitudes_pdf_compra
        WHERE proveedor_nombre LIKE ? AND pdf_recibido = 1 AND guia_recibida = 0 AND excluir = 0
        ORDER BY created_at DESC LIMIT 1
      `).get(`%${p}%`);
      if (s) break;
    }
  }
  if (!s) return null;

  db.prepare(`
    UPDATE solicitudes_pdf_compra
    SET guia_recibida = 1, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(s.id);

  console.log(`✅ Guía recibida vía texto OC ${s.numero_orden} → ${s.proveedor_nombre}`);

  // Actualizar estado en Supabase → "cerrada"
  cerrarOCenSupabase(s.oc_id, s.numero_orden).catch(() => {});

  return s;
}

// ─── Excluir / toggle ────────────────────────────────────────────────────────

function toggleExcluir(id, excluir) {
  db.prepare("UPDATE solicitudes_pdf_compra SET excluir = ? WHERE id = ?").run(excluir ? 1 : 0, id);
}

// ─── Iniciar scheduler ───────────────────────────────────────────────────────

function iniciarScheduler(enviarFn) {
  _enviarFn = enviarFn;
  console.log(`📋 Scheduler OC activo — recordatorios diarios a las ${HORA_ENVIO}AM (Colombia)`);

  // Al arrancar: sincronizar OC nuevas (sin enviar recordatorios)
  setTimeout(sincronizarOrdenes, 30 * 1000);

  // Cada 30 minutos: sincronizar OC nuevas de Supabase
  setInterval(sincronizarOrdenes, 30 * 60 * 1000);

  // Scheduler a las 10AM hora Colombia (UTC-5)
  function programarSiguiente10AM() {
    const ahora   = new Date();
    const colombia = new Date(ahora.getTime() - 5 * 60 * 60 * 1000);
    const hoy10AM  = new Date(colombia);
    hoy10AM.setUTCHours(HORA_ENVIO + 5, 0, 0, 0); // 10AM Colombia = 15:00 UTC

    let msPara10AM = hoy10AM.getTime() - ahora.getTime();

    if (msPara10AM <= 0) {
      // Ya pasó la 10AM de hoy — verificar si los recordatorios de hoy ya se enviaron
      // Si ultimo_recordatorio es de antes de hoy a las 10AM → se perdieron, enviar ahora
      const hoy10AMStr = hoy10AM.toISOString().replace('T', ' ').slice(0, 19);
      const pendientesSinRecordatorioHoy = db.prepare(`
        SELECT COUNT(*) as cnt FROM solicitudes_pdf_compra
        WHERE excluir = 0 AND pdf_recibido = 0 AND etapa >= 1
          AND (ultimo_recordatorio IS NULL OR ultimo_recordatorio < ?)
      `).get(hoy10AMStr);

      if (pendientesSinRecordatorioHoy.cnt > 0) {
        console.log(`⚠️  Servidor arrancó después de las 10AM — enviando ${pendientesSinRecordatorioHoy.cnt} recordatorio(s) pendiente(s) ahora...`);
        // Esperar 60s a que WhatsApp conecte, luego procesar
        setTimeout(async () => {
          await sincronizarOrdenes();
          await procesarPendientes();
          console.log(`✅ Recordatorios OC del día enviados (arranque tardío)`);
        }, 60 * 1000);
      } else {
        console.log(`✅ Recordatorios de hoy ya fueron enviados`);
      }

      // Programar para mañana
      msPara10AM += 24 * 60 * 60 * 1000;
    }

    const minutosRestantes = Math.round(msPara10AM / 60000);
    console.log(`⏰ Próximo envío de recordatorios OC: en ${minutosRestantes} minutos (10AM Colombia)`);

    setTimeout(async () => {
      console.log(`\n🔔 10AM Colombia — enviando recordatorios OC...`);
      await sincronizarOrdenes();
      await procesarPendientes();
      programarSiguiente10AM();
    }, msPara10AM);
  }

  programarSiguiente10AM();
}

// ─── Queries panel ───────────────────────────────────────────────────────────

function getSolicitudes({ solo_pendientes = false } = {}) {
  let q = "SELECT * FROM solicitudes_pdf_compra";
  if (solo_pendientes) q += " WHERE (pdf_recibido = 0 OR guia_recibida = 0) AND excluir = 0";
  q += " ORDER BY created_at DESC";
  return db.prepare(q).all();
}

module.exports = {
  registrarOrden,
  confirmarPedidoYPedirPdf,
  registrarPdfRecibido,
  registrarGuiaRecibida,
  procesarPendientes,
  enviarOCInmediato,
  sincronizarOrdenes,
  cerrarOCenSupabase,
  iniciarScheduler,
  toggleExcluir,
  getSolicitudes,
  PDFS_DIR,
};
