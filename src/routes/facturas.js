const express = require("express");
const router = express.Router();
const multer = require("multer");
const { validateExcelFile } = require("../utils/excelValidator");
const {
  procesarFacturasExcel,
  getFacturasPendientes,
  getFacturasAgrupadas,
} = require("../services/facturasService");
const { analizarImagenProveedor } = require("../services/claudeService");
const db = require("../models/db");

const upload = multer({ storage: multer.memoryStorage() });

// POST /facturas/upload
router.post("/upload", upload.single("archivo"), (req, res) => {
  try {
    const validation = validateExcelFile(req.file);
    if (!validation.valid) return res.status(400).json({ error: validation.error });
    // Borrar todas las facturas pendientes antes de cargar el nuevo archivo
    const eliminadas = db.prepare("DELETE FROM facturas WHERE estado = 'pendiente'").run();
    const resultado = procesarFacturasExcel(req.file.buffer);
    res.json({
      mensaje: `Se procesaron ${resultado.total_procesadas} facturas (se eliminaron ${eliminadas.changes} anteriores)`,
      ...resultado
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /facturas?vencimiento_hasta=YYYY-MM-DD&estado=pendiente
router.get("/", (req, res) => {
  try {
    const { vencimiento_hasta, vencimiento_desde, estado = "pendiente" } = req.query;
    let query = "SELECT * FROM facturas WHERE 1=1";
    const params = [];

    if (estado) { query += " AND estado = ?"; params.push(estado); }
    if (vencimiento_desde) { query += " AND fecha_vencimiento >= ?"; params.push(vencimiento_desde); }
    if (vencimiento_hasta) { query += " AND fecha_vencimiento <= ?"; params.push(vencimiento_hasta); }
    query += " ORDER BY proveedor_nit, fecha_vencimiento";

    const facturas = db.prepare(query).all(...params);
    res.json({ facturas, total: facturas.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /facturas/agrupadas?vencimiento_hasta=YYYY-MM-DD
router.get("/agrupadas", (req, res) => {
  try {
    const { vencimiento_hasta, vencimiento_desde, estado = "pendiente", solo_incluir } = req.query;
    let query = `
      SELECT
        proveedor_nit,
        proveedor_nombre,
        COUNT(*) as cantidad_facturas,
        SUM(valor_factura) as total_valor_factura,
        SUM(descuento_pronto_pago) as total_descuento,
        SUM(flete) as total_flete,
        SUM(valor_final) as total_valor_final,
        MIN(fecha_vencimiento) as primera_vencimiento,
        MAX(fecha_vencimiento) as ultima_vencimiento,
        estado
      FROM facturas WHERE 1=1`;
    const params = [];

    if (estado) { query += " AND estado = ?"; params.push(estado); }
    if (vencimiento_desde) { query += " AND fecha_vencimiento >= ?"; params.push(vencimiento_desde); }
    if (vencimiento_hasta) { query += " AND fecha_vencimiento <= ?"; params.push(vencimiento_hasta); }
    if (solo_incluir === "1") { query += " AND incluir_pago = 1"; }
    query += " GROUP BY proveedor_nit, estado ORDER BY proveedor_nit";

    const agrupadas = db.prepare(query).all(...params);
    res.json({ agrupadas });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /facturas/analizar-imagen — analiza imagen de proveedor con IA
router.post("/analizar-imagen", upload.single("imagen"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Se requiere una imagen" });

    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!allowedTypes.includes(req.file.mimetype)) {
      return res.status(400).json({ error: "Formato de imagen no válido. Use JPG, PNG, GIF o WEBP" });
    }

    const imageBase64 = req.file.buffer.toString("base64");
    const resultado = await analizarImagenProveedor(imageBase64, req.file.mimetype);

    // Si viene nit_proveedor en el body, actualizar facturas automáticamente
    const { nit_proveedor, aplicar_automatico } = req.body;
    let actualizaciones = [];

    if (nit_proveedor && aplicar_automatico === "true" && resultado.facturas_encontradas?.length > 0) {
      for (const fImg of resultado.facturas_encontradas) {
        if (!fImg.numero_factura) continue;
        const factura = db.prepare(
          "SELECT * FROM facturas WHERE numero_factura = ? AND proveedor_nit = ?"
        ).get(fImg.numero_factura, nit_proveedor);

        if (factura) {
          const nuevoDescuento = fImg.descuento ?? factura.descuento_pronto_pago;
          const nuevoFlete = fImg.flete ?? factura.flete;
          const nuevoValorFinal = fImg.valor_neto ?? (factura.valor_factura - nuevoDescuento + nuevoFlete);

          db.prepare(`
            UPDATE facturas SET
              descuento_pronto_pago = ?,
              flete = ?,
              valor_final = ?,
              valor_proveedor = ?,
              origen_valor = 'imagen_proveedor'
            WHERE id = ?
          `).run(nuevoDescuento, nuevoFlete, nuevoValorFinal, fImg.valor_neto, factura.id);

          actualizaciones.push({
            numero_factura: fImg.numero_factura,
            descuento_anterior: factura.descuento_pronto_pago,
            descuento_nuevo: nuevoDescuento,
            flete_anterior: factura.flete,
            flete_nuevo: nuevoFlete,
            valor_final_anterior: factura.valor_final,
            valor_final_nuevo: nuevoValorFinal,
          });
        }
      }
    }

    res.json({ analisis: resultado, actualizaciones });
  } catch (err) {
    console.error("Error analizando imagen:", err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /facturas/:id/valor-proveedor — actualiza valor con el del proveedor si es menor
router.put("/:id/valor-proveedor", express.json(), (req, res) => {
  try {
    const { valor_proveedor, descuento, flete } = req.body;
    if (valor_proveedor == null) return res.status(400).json({ error: "valor_proveedor requerido" });

    const factura = db.prepare("SELECT * FROM facturas WHERE id = ?").get(req.params.id);
    if (!factura) return res.status(404).json({ error: "Factura no encontrada" });

    const valorFinalNuevo = Number(valor_proveedor);
    const valorFinalAnterior = factura.valor_final;

    // Solo aceptar si es menor o igual (favorece a MAKA)
    if (valorFinalNuevo > valorFinalAnterior) {
      return res.status(400).json({
        error: "El valor del proveedor es mayor al calculado. No se puede aplicar.",
        valor_calculado: valorFinalAnterior,
        valor_proveedor: valorFinalNuevo,
      });
    }

    db.prepare(`
      UPDATE facturas SET
        valor_final = ?,
        valor_proveedor = ?,
        descuento_pronto_pago = COALESCE(?, descuento_pronto_pago),
        flete = COALESCE(?, flete),
        origen_valor = 'proveedor'
      WHERE id = ?
    `).run(valorFinalNuevo, valorFinalNuevo, descuento ?? null, flete ?? null, req.params.id);

    res.json({
      mensaje: "Valor del proveedor aplicado",
      valor_anterior: valorFinalAnterior,
      valor_nuevo: valorFinalNuevo,
      ahorro: valorFinalAnterior - valorFinalNuevo,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /facturas/vencimientos — todas las facturas con días en sistema y semáforo
router.get("/vencimientos", (req, res) => {
  try {
    const { estado, proveedor_nit, vencimiento_desde, vencimiento_hasta } = req.query;
    let query = `
      SELECT
        f.*,
        p.banco, p.cuenta, p.tipo_cuenta, p.telefono as p_telefono,
        p.nombre as p_nombre, p.titular_nombre, p.titular_id,
        CAST(julianday(DATE('now')) - julianday(f.created_at) AS INTEGER) as dias_sistema,
        CAST(julianday(f.fecha_vencimiento) - julianday(DATE('now')) AS INTEGER) as dias_para_vencer
      FROM facturas f
      LEFT JOIN proveedores p ON f.proveedor_nit = p.nit
      WHERE 1=1
    `;
    const params = [];
    if (estado) { query += " AND f.estado = ?"; params.push(estado); }
    if (proveedor_nit) { query += " AND f.proveedor_nit = ?"; params.push(proveedor_nit); }
    if (vencimiento_desde) { query += " AND f.fecha_vencimiento >= ?"; params.push(vencimiento_desde); }
    if (vencimiento_hasta) { query += " AND f.fecha_vencimiento <= ?"; params.push(vencimiento_hasta); }
    query += " ORDER BY f.fecha_vencimiento ASC, f.proveedor_nit";

    const facturas = db.prepare(query).all(...params);
    res.json({ facturas, total: facturas.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /facturas/:id/ajustar — editar flete y/o fecha_vencimiento manualmente
router.patch("/:id/ajustar", express.json(), (req, res) => {
  try {
    const { flete, fecha_vencimiento } = req.body;
    const factura = db.prepare("SELECT * FROM facturas WHERE id = ?").get(req.params.id);
    if (!factura) return res.status(404).json({ error: "Factura no encontrada" });

    const updates = [];
    const params = [];

    let nuevoFlete = factura.flete || 0;
    if (flete !== undefined) {
      nuevoFlete = Number(flete) || 0;
      updates.push("flete = ?");
      params.push(nuevoFlete);
      // Recalcular valor_final: base - descuento + nuevo flete
      const base = (factura.valor_factura || 0) - (factura.descuento_pronto_pago || 0);
      const nuevoValorFinal = base + nuevoFlete;
      updates.push("valor_final = ?");
      params.push(nuevoValorFinal);
    }

    if (fecha_vencimiento !== undefined) {
      updates.push("fecha_vencimiento = ?");
      params.push(fecha_vencimiento || null);
    }

    if (updates.length === 0) return res.status(400).json({ error: "Nada que actualizar" });

    params.push(req.params.id);
    db.prepare(`UPDATE facturas SET ${updates.join(", ")} WHERE id = ?`).run(...params);

    const actualizada = db.prepare("SELECT * FROM facturas WHERE id = ?").get(req.params.id);
    res.json({ mensaje: "Factura ajustada", factura: actualizada });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /facturas/:id/incluir — marcar/desmarcar para pago
router.patch("/:id/incluir", express.json(), (req, res) => {
  try {
    const { incluir, notas } = req.body;
    const factura = db.prepare("SELECT * FROM facturas WHERE id = ?").get(req.params.id);
    if (!factura) return res.status(404).json({ error: "Factura no encontrada" });

    db.prepare("UPDATE facturas SET incluir_pago = ?, notas = COALESCE(?, notas) WHERE id = ?")
      .run(incluir ? 1 : 0, notas ?? null, req.params.id);

    res.json({
      id: req.params.id,
      incluir_pago: incluir ? 1 : 0,
      notas: notas ?? factura.notas,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /facturas/incluir-lote — marcar/desmarcar múltiples
router.patch("/incluir-lote", express.json(), (req, res) => {
  try {
    const { ids, incluir } = req.body;
    if (!ids?.length) return res.status(400).json({ error: "ids requerido" });
    const stmt = db.prepare("UPDATE facturas SET incluir_pago = ? WHERE id = ?");
    const txn = db.transaction(() => ids.forEach(id => stmt.run(incluir ? 1 : 0, id)));
    txn();
    res.json({ actualizadas: ids.length, incluir_pago: incluir ? 1 : 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
