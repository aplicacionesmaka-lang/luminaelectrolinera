const express = require("express");
const router = express.Router();
const multer = require("multer");
const db = require("../models/db");
const { generarMensajesLote, responderProveedor } = require("../services/claudeService");
const { enviarMensajesLote, getHistorialConversaciones } = require("../services/whatsappService");

const upload = multer({ storage: multer.memoryStorage() });

// POST /mensajes/generar
// Body: { fecha_pago, solo_generar, nits_seleccionados: ["nit1","nit2",...] }
router.post("/generar", express.json(), async (req, res) => {
  try {
    const { fecha_pago, solo_generar = false, nits_seleccionados = [] } = req.body;

    let query = `
      SELECT
        f.*,
        p.nombre as p_nombre,
        p.telefono as p_telefono,
        p.telefono2 as p_telefono2,
        p.banco, p.cuenta, p.tipo_cuenta, p.titular_nombre, p.titular_id
      FROM facturas f
      LEFT JOIN proveedores p ON f.proveedor_nit = p.nit
      WHERE f.estado = 'pendiente' AND f.incluir_pago = 1
    `;
    const params = [];

    // Filtrar por NITs seleccionados si se enviaron
    if (nits_seleccionados.length > 0) {
      const placeholders = nits_seleccionados.map(() => "?").join(",");
      query += ` AND f.proveedor_nit IN (${placeholders})`;
      params.push(...nits_seleccionados);
    }
    query += " ORDER BY f.proveedor_nit";

    const facturasRaw = db.prepare(query).all(...params);

    if (facturasRaw.length === 0) {
      return res.status(400).json({ error: "No hay facturas pendientes para los proveedores seleccionados" });
    }

    // Agrupar por proveedor
    const porProveedor = {};
    for (const f of facturasRaw) {
      const nit = f.proveedor_nit;
      if (!porProveedor[nit]) {
        porProveedor[nit] = {
          proveedor: {
            nit,
            nombre: f.p_nombre || f.proveedor_nombre,
            telefono: f.p_telefono,
            telefono2: f.p_telefono2,
            banco: f.banco,
            cuenta: f.cuenta,
            tipo_cuenta: f.tipo_cuenta,
            titular_nombre: f.titular_nombre,
            titular_id: f.titular_id,
          },
          facturas: [],
        };
      }
      porProveedor[nit].facturas.push(f);
    }

    const proveedoresConFacturas = Object.values(porProveedor);
    console.log(`Generando mensajes para ${proveedoresConFacturas.length} proveedores...`);

    const mensajesGenerados = await generarMensajesLote(proveedoresConFacturas, fecha_pago);

    if (solo_generar) {
      return res.json({
        mensaje: "Mensajes generados (modo previsualización)",
        total: mensajesGenerados.length,
        mensajes: mensajesGenerados,
      });
    }

    const envios = await enviarMensajesLote(mensajesGenerados);

    res.json({
      mensaje: "Mensajes generados y enviados",
      total_generados: mensajesGenerados.length,
      total_enviados: envios.filter((e) => e.estado === "enviado").length,
      sin_telefono: envios.filter((e) => e.estado === "sin_telefono").length,
      errores: envios.filter((e) => e.estado === "error").length,
      detalle: envios,
      mensajes: mensajesGenerados,
    });
  } catch (err) {
    console.error("Error generando mensajes:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /mensajes/responder
// Body: { proveedor_nit, respuesta_proveedor }
// El bot analiza la respuesta y ajusta valores si el proveedor tiene un valor menor
router.post("/responder", express.json(), async (req, res) => {
  try {
    const { proveedor_nit, respuesta_proveedor } = req.body;
    if (!proveedor_nit || !respuesta_proveedor) {
      return res.status(400).json({ error: "proveedor_nit y respuesta_proveedor son requeridos" });
    }

    const proveedor = db.prepare("SELECT * FROM proveedores WHERE nit = ?").get(proveedor_nit);
    const facturas = db.prepare(
      "SELECT * FROM facturas WHERE proveedor_nit = ? AND estado = 'pendiente'"
    ).all(proveedor_nit);

    if (facturas.length === 0) {
      return res.status(404).json({ error: "No hay facturas pendientes para este proveedor" });
    }

    const totalCalculado = facturas.reduce((sum, f) => sum + f.valor_final, 0);
    const nombreProveedor = proveedor?.nombre || facturas[0]?.proveedor_nombre || proveedor_nit;

    // Llamar a Claude para analizar la respuesta
    const analisis = await responderProveedor({
      nombreProveedor,
      respuestaProveedor: respuesta_proveedor,
      totalCalculado,
      facturas,
    });

    // Si Claude determinó que hay un valor del proveedor menor → actualizar
    let actualizacion = null;
    if (
      analisis.accion === "ajustado" &&
      analisis.origen_valor === "proveedor" &&
      analisis.valor_aceptado < totalCalculado
    ) {
      // Distribuir el ajuste proporcionalmente entre las facturas
      const ratio = analisis.valor_aceptado / totalCalculado;
      const updateStmt = db.prepare(
        "UPDATE facturas SET valor_final = ?, valor_proveedor = ?, origen_valor = 'proveedor' WHERE id = ?"
      );
      const txn = db.transaction(() => {
        for (const f of facturas) {
          const nuevoValor = Math.round(f.valor_final * ratio * 100) / 100;
          updateStmt.run(nuevoValor, nuevoValor, f.id);
        }
      });
      txn();

      actualizacion = {
        valor_anterior: totalCalculado,
        valor_nuevo: analisis.valor_aceptado,
        ahorro: totalCalculado - analisis.valor_aceptado,
      };
    }

    // Registrar la conversación
    db.prepare(
      "INSERT INTO conversaciones (proveedor_nit, mensaje_enviado, respuesta, estado) VALUES (?,?,?,'respondido')"
    ).run(proveedor_nit, `[RESPUESTA PROVEEDOR]: ${respuesta_proveedor}`, analisis.mensaje_respuesta);

    res.json({
      mensaje_bot: analisis.mensaje_respuesta,
      accion: analisis.accion,
      valor_aceptado: analisis.valor_aceptado,
      origen_valor: analisis.origen_valor,
      actualizacion,
    });
  } catch (err) {
    console.error("Error respondiendo:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET /mensajes/historial
router.get("/historial", (req, res) => {
  try {
    const { nit } = req.query;
    const conversaciones = getHistorialConversaciones(nit);
    res.json({ conversaciones, total: conversaciones.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
