const express  = require("express");
const router   = express.Router();
const path     = require("path");
const fs       = require("fs");
const {
  registrarOrden, toggleExcluir, getSolicitudes, enviarOCInmediato, PDFS_DIR,
} = require("../services/solicitudPdfService");

const WEBHOOK_SECRET = process.env.COMPRAS_WEBHOOK_SECRET || "makabot_compras_2025";

// ── POST /compras/nueva-orden ─────────────────────────────────────────────────
// Webhook llamado por QCUTE 360 (Supabase) cuando se crea una OC
// Payload Supabase: { type: "INSERT", table: "ordenes_compra", record: {...} }
router.post("/nueva-orden", async (req, res) => {
  const secret = req.headers["x-webhook-secret"] || req.body?.secret;
  if (secret !== WEBHOOK_SECRET) {
    return res.status(401).json({ error: "No autorizado" });
  }

  try {
    // Supabase envía { type, table, schema, record: {...} }
    const record = req.body?.record || req.body;

    if (!record?.id) {
      return res.status(400).json({ error: "Falta el campo 'id' de la orden" });
    }

    // Solo procesar INSERTs (no updates)
    if (req.body?.type && req.body.type !== "INSERT") {
      return res.json({ ok: true, omitido: true, motivo: "No es INSERT" });
    }

    // Extraer nombre del proveedor desde el campo mensaje_whatsapp
    // Formato: "...a su Bodega (NOMBRE PROVEEDOR). Para las tiendas..."
    let proveedorNombre = "";
    const msgWA = record.mensaje_whatsapp || "";
    const matchNombre = msgWA.match(/a su Bodega \(([^)]+)\)/);
    if (matchNombre) proveedorNombre = matchNombre[1].trim();

    // Extraer tiendas del mensaje
    const matchTiendas = msgWA.match(/Para las tiendas ([^.]+)\./);
    const tiendas = matchTiendas ? matchTiendas[1].trim() : "";

    const datos = {
      oc_id:            record.id,
      numero_orden:     record.codigo || record.id,
      proveedor_nit:    record.proveedor_id || "",   // UUID de Supabase (se usará para deduplicar)
      proveedor_nombre: proveedorNombre,
      telefono:         record.telefono || "",
      tienda:           tiendas,
      valor_total:      record.total_final || record.total_factura || 0,
      descripcion:      msgWA,                        // guardamos el mensaje completo
      excluir:          0,
    };

    const resultado = await registrarOrden(datos);
    console.log(`\n📦 Nueva OC de QCUTE 360: ${datos.numero_orden} — ${proveedorNombre} — Tiendas: ${tiendas}`);
    res.json({ ok: true, ...resultado });

  } catch (err) {
    console.error("Error procesando nueva OC:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /compras/solicitudes ──────────────────────────────────────────────────
// Panel: lista todas las solicitudes con su estado
router.get("/solicitudes", (req, res) => {
  const solo_pendientes = req.query.pendientes === "1";
  const rows = getSolicitudes({ solo_pendientes });
  res.json(rows);
});

// ── PATCH /compras/solicitudes/:id/excluir ────────────────────────────────────
// Toggle excluir (checkbox en el panel)
router.patch("/solicitudes/:id/excluir", (req, res) => {
  const { excluir } = req.body;
  toggleExcluir(Number(req.params.id), !!excluir);
  res.json({ ok: true });
});

// ── GET /compras/pdf/:id ──────────────────────────────────────────────────────
// Descarga el PDF guardado de una solicitud
router.get("/pdf/:id", (req, res) => {
  const db = require("../models/db");
  const s  = db.prepare("SELECT * FROM solicitudes_pdf_compra WHERE id = ?").get(Number(req.params.id));
  if (!s || !s.archivo_path) return res.status(404).json({ error: "PDF no encontrado" });
  if (!fs.existsSync(s.archivo_path)) return res.status(404).json({ error: "Archivo no existe en disco" });

  const ext  = path.extname(s.archivo_path).toLowerCase();
  const mime = ext === ".pdf" ? "application/pdf" : ext === ".png" ? "image/png" : "image/jpeg";
  res.setHeader("Content-Type", mime);
  res.setHeader("Content-Disposition", `inline; filename="OC${s.numero_orden}_${s.proveedor_nombre}.${ext.slice(1)}"`);
  fs.createReadStream(s.archivo_path).pipe(res);
});

// ── POST /compras/enviar-recordatorio ─────────────────────────────────────────
// Envía recordatorio inmediato de OC a un proveedor específico.
// Body: { nit } o { nombre }
// Queda programado para repetirse automáticamente a las 10AM Colombia si no responde.
router.post("/enviar-recordatorio", express.json(), async (req, res) => {
  try {
    const { nit, nombre } = req.body;
    if (!nit && !nombre) return res.status(400).json({ error: "Se requiere nit o nombre del proveedor" });
    const resultado = await enviarOCInmediato(nit || null, nombre || null);
    res.json({
      ok: true,
      oc:      resultado.solicitud.numero_orden,
      proveedor: resultado.solicitud.proveedor_nombre,
      etapa:   resultado.etapa,
      nota:    "Mensaje enviado. El scheduler lo repetirá a las 10AM Colombia cada día mientras no haya respuesta.",
    });
  } catch (err) {
    console.error("Error enviando recordatorio OC:", err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
