const express = require("express");
const router = express.Router();
const db = require("../models/db");
const { generarMensajesLote, responderProveedor } = require("../services/claudeService");
const { enviarMensajesLote, getHistorialConversaciones } = require("../services/whatsappService");
const { getCuentasPorPagar } = require("../services/sqlServerService");
const { enviarRecordatorioInmediato } = require("../services/recordatorioService");

// POST /mensajes/generar
// Body: { fecha_pago, solo_generar, nits_seleccionados: ["nit1","nit2",...] }
router.post("/generar", express.json(), async (req, res) => {
  try {
    const { fecha_pago, solo_generar = false, nits_seleccionados = [], vencimiento_hasta = null } = req.body;

    // --- Datos del ERP ---
    const erpFacturas = await getCuentasPorPagar({ soloVencidas: false });

    // Ajustes locales (flete, excluidas)
    const ajustesRows = db.prepare("SELECT * FROM facturas_erp_ajustes").all();
    const ajMap = {};
    ajustesRows.forEach(a => { ajMap[a.idreg] = a; });

    // Datos bancarios de proveedores (SQLite)
    const provRows = db.prepare(
      "SELECT nit, nombre, telefono, telefono2, banco, cuenta, tipo_cuenta, titular_nombre, titular_id, descuento_cacharro, descuento_joyeria, descuento_activo FROM proveedores"
    ).all();
    const provMap = {};
    provRows.forEach(p => { provMap[p.nit] = p; });

    // Solo incluir facturas ESTRICTAMENTE marcadas para pago (incluir_pago = 1)
    // Sin registro o incluir_pago != 1 → excluir
    const toISO2 = d => { if (!d) return null; if (d instanceof Date) return d.toISOString().slice(0,10); return String(d).slice(0,10); };
    const incluidas = erpFacturas.filter(f => {
      const aj = ajMap[String(f.idreg)];
      if (!aj || aj.incluir_pago !== 1) return false;
      // Usar el NIT efectivo (después del override) para el filtro de selección
      const nitEfectivo = aj?.proveedor_nit_override || f.nit;
      const seleccionada = nits_seleccionados.length === 0 || nits_seleccionados.includes(nitEfectivo);
      if (!seleccionada) return false;
      if (vencimiento_hasta) {
        const fecVen = aj?.fecha_vencimiento_override || toISO2(f.fecha_vencimiento);
        if (!fecVen || fecVen > vencimiento_hasta) return false;
      }
      return true;
    });

    if (incluidas.length === 0) {
      return res.status(400).json({ error: "No hay facturas pendientes para los proveedores seleccionados" });
    }

    const toISO = d => {
      if (!d) return null;
      if (d instanceof Date) return d.toISOString().slice(0, 10);
      return String(d).slice(0, 10);
    };

    // Agrupar por proveedor
    const porProveedor = {};
    incluidas.forEach(f => {
      const aj   = ajMap[String(f.idreg)] || {};
      // Aplicar override de proveedor si fue corregido manualmente
      const nit  = aj.proveedor_nit_override    || f.nit;
      const nombreErp = aj.proveedor_nombre_override || f.proveedor_nombre;
      const prov = provMap[nit] || {};
      const flete = aj.flete != null ? aj.flete : 0;
      const saldo = parseFloat(f.saldo_pendiente) || 0;
      let descuento = 0;
      if (aj.descuento != null && aj.descuento > 0) {
        descuento = aj.descuento;
      } else {
        const tipo = prov.descuento_activo || 'cacharro';
        const pct  = tipo === 'joyeria' ? (prov.descuento_joyeria || 0) : (prov.descuento_cacharro || 0);
        descuento  = Math.round(saldo * pct);
      }
      const valorFinal = Math.max(0, saldo - flete - descuento);

      if (!porProveedor[nit]) {
        porProveedor[nit] = {
          proveedor: {
            nit,
            nombre:         prov.nombre || nombreErp,
            telefono:       prov.telefono || null,   // SOLO MakaBot SQLite — nunca usar ERP
            telefono2:      prov.telefono2 || null,
            banco:          prov.banco || '',
            cuenta:         prov.cuenta || '',
            tipo_cuenta:    prov.tipo_cuenta || '',
            titular_nombre: prov.titular_nombre || '',
            titular_id:     prov.titular_id || '',
          },
          facturas: [],
        };
      }
      porProveedor[nit].facturas.push({
        id:                    String(f.idreg),
        numero_factura:        f.numero_factura,
        fecha_factura:         toISO(f.fecha_factura),
        fecha_vencimiento:     aj.fecha_vencimiento_override || toISO(f.fecha_vencimiento),
        valor_factura:         parseFloat(f.valor_bruto) || saldo,
        descuento_pronto_pago: descuento,
        flete,
        valor_final:           valorFinal,
        saldo_pendiente:       saldo,
        proveedor_nit:         nit,
        proveedor_nombre:      f.proveedor_nombre,
        estado:                'pendiente',
      });
    });

    const proveedoresConFacturas = Object.values(porProveedor);
    console.log(`[DEBUG] vencimiento_hasta=${vencimiento_hasta} incluidas=${incluidas.length}`);
    proveedoresConFacturas.forEach(p => console.log(`  ${p.proveedor.nombre}: ${p.facturas.length} facturas`));
    console.log(`Generando mensajes para ${proveedoresConFacturas.length} proveedores (ERP)...`);

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
      mensaje:        "Mensajes generados y enviados",
      total_generados: mensajesGenerados.length,
      total_enviados:  envios.filter(e => e.estado === "enviado").length,
      sin_telefono:    envios.filter(e => e.estado === "sin_telefono").length,
      errores:         envios.filter(e => e.estado === "error").length,
      detalle:         envios,
      mensajes:        mensajesGenerados,
    });
  } catch (err) {
    console.error("Error generando mensajes:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /mensajes/responder
router.post("/responder", express.json(), async (req, res) => {
  try {
    const { proveedor_nit, respuesta_proveedor } = req.body;
    if (!proveedor_nit || !respuesta_proveedor) {
      return res.status(400).json({ error: "proveedor_nit y respuesta_proveedor son requeridos" });
    }

    const proveedor = db.prepare("SELECT * FROM proveedores WHERE nit = ?").get(proveedor_nit);

    const erpFacturas = await getCuentasPorPagar({ nit: proveedor_nit });
    const ajustesRows = db.prepare("SELECT * FROM facturas_erp_ajustes").all();
    const ajMap = {};
    ajustesRows.forEach(a => { ajMap[a.idreg] = a; });

    const facturas = erpFacturas.filter(f => {
      const aj = ajMap[String(f.idreg)] || {};
      return aj.incluir_pago !== 0;
    }).map(f => {
      const aj    = ajMap[String(f.idreg)] || {};
      const flete = aj.flete || 0;
      const saldo = parseFloat(f.saldo_pendiente) || 0;
      return {
        id:             String(f.idreg),
        numero_factura: f.numero_factura,
        valor_final:    Math.max(0, saldo - flete),
        saldo_pendiente: saldo,
      };
    });

    if (facturas.length === 0) {
      return res.status(404).json({ error: "No hay facturas pendientes para este proveedor" });
    }

    const totalCalculado  = facturas.reduce((s, f) => s + f.valor_final, 0);
    const nombreProveedor = proveedor?.nombre || proveedor_nit;

    const analisis = await responderProveedor({
      nombreProveedor,
      respuestaProveedor: respuesta_proveedor,
      totalCalculado,
      facturas,
    });

    db.prepare(
      "INSERT INTO conversaciones (proveedor_nit, mensaje_enviado, respuesta, estado) VALUES (?,?,?,'respondido')"
    ).run(proveedor_nit, `[RESPUESTA PROVEEDOR]: ${respuesta_proveedor}`, analisis.mensaje_respuesta);

    res.json({
      mensaje_bot:    analisis.mensaje_respuesta,
      accion:         analisis.accion,
      valor_aceptado: analisis.valor_aceptado,
      origen_valor:   analisis.origen_valor,
    });
  } catch (err) {
    console.error("Error respondiendo:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /mensajes/recordatorio — Enviar recordatorio inmediato a un proveedor y activar ciclo 72h
// Body: { nit } — busca datos en SQLite + ERP automáticamente
router.post("/recordatorio", express.json(), async (req, res) => {
  try {
    const { nit } = req.body;
    if (!nit) return res.status(400).json({ error: "nit requerido" });

    const prov = db.prepare("SELECT * FROM proveedores WHERE nit = ?").get(nit);
    if (!prov) return res.status(404).json({ error: "Proveedor no encontrado en MakaBot" });
    if (!prov.telefono) return res.status(400).json({ error: "Proveedor sin teléfono registrado en MakaBot" });

    // Obtener facturas del ERP
    const erpFacturas = await getCuentasPorPagar({ soloVencidas: false });
    const ajustesRows = db.prepare("SELECT * FROM facturas_erp_ajustes").all();
    const ajMap = {};
    ajustesRows.forEach(a => { ajMap[a.idreg] = a; });

    const facturasDelProv = erpFacturas.filter(f => {
      if (f.nit !== nit) return false;
      const aj = ajMap[String(f.idreg)];
      return !(aj && aj.incluir_pago === 0);
    });

    const facturasList = facturasDelProv.map(f => f.numero_factura).join(", ");
    const total = facturasDelProv.reduce((s, f) => s + (parseFloat(f.saldo_pendiente) || 0), 0);

    const mensaje = await enviarRecordatorioInmediato({
      proveedor_nit:    nit,
      proveedor_nombre: prov.nombre,
      telefono:         prov.telefono,
      facturas:         facturasList,
      total,
    });

    res.json({
      ok: true,
      proveedor: prov.nombre,
      telefono:  prov.telefono,
      facturas:  facturasList,
      total,
      mensaje,
      nota: "Recordatorio enviado. Se repetirá automáticamente cada 72h si no responde.",
    });
  } catch (err) {
    console.error("Error enviando recordatorio:", err);
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
