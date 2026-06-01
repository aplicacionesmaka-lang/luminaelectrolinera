const express = require("express");
const router  = express.Router();
const db      = require("../models/db");
const { enviarMensajeReal } = require("../services/whatsappService");
const multer  = require("multer");
const path    = require("path");
const fs      = require("fs");

// Directorio comprobantes clientes
const COMP_DIR = path.join(__dirname, "../../comprobantes_clientes");
if (!fs.existsSync(COMP_DIR)) fs.mkdirSync(COMP_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, COMP_DIR),
  filename:    (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `comp_${Date.now()}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

// Helper: calcular días para vencer
function calcDias(fechaVenc) {
  if (!fechaVenc) return null;
  const hoy  = new Date(); hoy.setHours(0,0,0,0);
  const venc = new Date(fechaVenc); venc.setHours(0,0,0,0);
  return Math.round((venc - hoy) / 86400000);
}

// Actualizar dias_para_vencer en todas las facturas al consultar
function actualizarDias() {
  const facturas = db.prepare("SELECT id, fecha_vencimiento FROM facturas_cobrar WHERE estado != 'pagada'").all();
  const stmt = db.prepare("UPDATE facturas_cobrar SET dias_para_vencer = ? WHERE id = ?");
  for (const f of facturas) {
    const dias = calcDias(f.fecha_vencimiento);
    stmt.run(dias, f.id);
  }
}

// GET /cxc/clientes
router.get("/clientes", (req, res) => {
  try {
    const clientes = db.prepare("SELECT * FROM clientes ORDER BY nombre").all();
    res.json({ clientes, total: clientes.length });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// POST /cxc/clientes
router.post("/clientes", express.json(), (req, res) => {
  try {
    const { nombre, nit, telefono, telefono2, email, ciudad, direccion, contacto } = req.body;
    if (!nit || !nombre) return res.status(400).json({ error: "nit y nombre son obligatorios" });
    db.prepare(`INSERT INTO clientes (nombre,nit,telefono,telefono2,email,ciudad,direccion,contacto)
      VALUES (?,?,?,?,?,?,?,?)`)
      .run(nombre, nit, telefono||null, telefono2||null, email||null, ciudad||null, direccion||null, contacto||null);
    res.json({ ok: true, mensaje: "Cliente creado" });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// PUT /cxc/clientes/:nit
router.put("/clientes/:nit", express.json(), (req, res) => {
  try {
    const { nombre, telefono, telefono2, email, ciudad, direccion, contacto, bot_pausado } = req.body;
    db.prepare(`UPDATE clientes SET nombre=?,telefono=?,telefono2=?,email=?,ciudad=?,direccion=?,contacto=?,bot_pausado=?,updated_at=CURRENT_TIMESTAMP WHERE nit=?`)
      .run(nombre||null, telefono||null, telefono2||null, email||null, ciudad||null, direccion||null, contacto||null, bot_pausado||0, req.params.nit);
    res.json({ ok: true });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// GET /cxc/facturas — incluye conteo de contactos por cliente
router.get("/facturas", (req, res) => {
  try {
    actualizarDias();
    const { cliente_nit, estado, vencidas } = req.query;
    let q = `SELECT f.*,
      (SELECT COUNT(*) FROM recordatorios_cxc r WHERE r.cliente_nit = f.cliente_nit) AS veces_contactado
      FROM facturas_cobrar f WHERE 1=1`;
    const p = [];
    if (cliente_nit) { q += " AND f.cliente_nit = ?"; p.push(cliente_nit); }
    if (estado)      { q += " AND f.estado = ?";       p.push(estado); }
    if (vencidas === "1") { q += " AND f.dias_para_vencer < 0"; }
    q += " ORDER BY f.fecha_vencimiento ASC";
    const facturas = db.prepare(q).all(...p);
    const total_pendiente = facturas.reduce((s, f) => s + (f.saldo_pendiente || 0), 0);
    res.json({ facturas, total: facturas.length, total_pendiente });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// POST /cxc/facturas
router.post("/facturas", express.json(), (req, res) => {
  try {
    const { numero_factura, cliente_nit, cliente_nombre, valor_factura, valor_abonado = 0,
            descuento = 0, flete = 0, fecha_factura, fecha_vencimiento, notas } = req.body;
    if (!numero_factura || !cliente_nit || !valor_factura) return res.status(400).json({ error: "Campos requeridos: numero_factura, cliente_nit, valor_factura" });
    const valorFac  = parseFloat(valor_factura);
    const dto       = parseFloat(descuento || 0);
    const fl        = parseFloat(flete || 0);
    const valorFinal = Math.max(0, valorFac - dto + fl);
    const saldo = valorFinal - parseFloat(valor_abonado || 0);
    const dias  = calcDias(fecha_vencimiento);
    db.prepare(`INSERT INTO facturas_cobrar
      (numero_factura,cliente_nit,cliente_nombre,valor_factura,descuento,flete,valor_final_cobrar,valor_abonado,saldo_pendiente,fecha_factura,fecha_vencimiento,dias_para_vencer,notas)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(numero_factura, cliente_nit, cliente_nombre||null, valorFac, dto, fl, valorFinal,
           parseFloat(valor_abonado||0), Math.max(0,saldo), fecha_factura||null, fecha_vencimiento||null, dias, notas||null);
    res.json({ ok: true, mensaje: "Factura registrada" });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// PUT /cxc/facturas/:id
router.put("/facturas/:id", express.json(), (req, res) => {
  try {
    const { valor_abonado, estado, notas, fecha_vencimiento, descuento, flete, clasificacion } = req.body;
    const f = db.prepare("SELECT * FROM facturas_cobrar WHERE id=?").get(req.params.id);
    if (!f) return res.status(404).json({ error: "Factura no encontrada" });
    const newAbonado  = valor_abonado != null ? parseFloat(valor_abonado) : f.valor_abonado;
    const newDto      = descuento != null ? parseFloat(descuento) : (f.descuento || 0);
    const newFlete    = flete     != null ? parseFloat(flete)     : (f.flete || 0);
    const valorFinal  = Math.max(0, f.valor_factura - newDto + newFlete);
    const saldo       = valorFinal - newAbonado;
    const dias        = calcDias(fecha_vencimiento || f.fecha_vencimiento);
    const nuevoEstado = clasificacion || estado || (saldo <= 0 ? "pagada" : f.estado);
    db.prepare(`UPDATE facturas_cobrar SET valor_abonado=?,saldo_pendiente=?,descuento=?,flete=?,valor_final_cobrar=?,estado=?,notas=?,fecha_vencimiento=?,dias_para_vencer=?,clasificacion=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .run(newAbonado, Math.max(0, saldo), newDto, newFlete, valorFinal, nuevoEstado,
           notas||f.notas, fecha_vencimiento||f.fecha_vencimiento, dias, clasificacion||f.clasificacion||null, req.params.id);
    res.json({ ok: true });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// GET /cxc/resumen — KPIs + antigüedad
router.get("/resumen", (req, res) => {
  try {
    actualizarDias();
    const total    = db.prepare("SELECT COALESCE(SUM(saldo_pendiente),0) as v FROM facturas_cobrar WHERE estado != 'pagada'").get()?.v || 0;
    const vencidas = db.prepare("SELECT COALESCE(SUM(saldo_pendiente),0) as v FROM facturas_cobrar WHERE estado != 'pagada' AND dias_para_vencer < 0").get()?.v || 0;
    const proximas = db.prepare("SELECT COALESCE(SUM(saldo_pendiente),0) as v FROM facturas_cobrar WHERE estado != 'pagada' AND dias_para_vencer >= 0 AND dias_para_vencer <= 7").get()?.v || 0;
    const clientes = db.prepare("SELECT COUNT(DISTINCT cliente_nit) as c FROM facturas_cobrar WHERE estado != 'pagada'").get()?.c || 0;
    // Antigüedad
    const vigente  = db.prepare("SELECT COALESCE(SUM(saldo_pendiente),0) as v FROM facturas_cobrar WHERE estado != 'pagada' AND dias_para_vencer >= 0").get()?.v || 0;
    const v1_30    = db.prepare("SELECT COALESCE(SUM(saldo_pendiente),0) as v FROM facturas_cobrar WHERE estado != 'pagada' AND dias_para_vencer >= -30 AND dias_para_vencer < 0").get()?.v || 0;
    const v31_60   = db.prepare("SELECT COALESCE(SUM(saldo_pendiente),0) as v FROM facturas_cobrar WHERE estado != 'pagada' AND dias_para_vencer >= -60 AND dias_para_vencer < -30").get()?.v || 0;
    const v61_90   = db.prepare("SELECT COALESCE(SUM(saldo_pendiente),0) as v FROM facturas_cobrar WHERE estado != 'pagada' AND dias_para_vencer >= -90 AND dias_para_vencer < -60").get()?.v || 0;
    const v91mas   = db.prepare("SELECT COALESCE(SUM(saldo_pendiente),0) as v FROM facturas_cobrar WHERE estado != 'pagada' AND dias_para_vencer < -90").get()?.v || 0;
    // Por clasificación
    const seguro   = db.prepare("SELECT COALESCE(SUM(saldo_pendiente),0) as v FROM facturas_cobrar WHERE estado != 'pagada' AND clasificacion = 'seguro'").get()?.v || 0;
    const dudoso   = db.prepare("SELECT COALESCE(SUM(saldo_pendiente),0) as v FROM facturas_cobrar WHERE estado != 'pagada' AND clasificacion = 'dudoso'").get()?.v || 0;
    const cobro    = db.prepare("SELECT COALESCE(SUM(saldo_pendiente),0) as v FROM facturas_cobrar WHERE estado != 'pagada' AND clasificacion = 'cobro'").get()?.v || 0;
    res.json({ total, vencidas, proximas, clientes, vigente, v1_30, v31_60, v61_90, v91mas, seguro, dudoso, cobro });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// GET /cxc/cartera — tabla de antigüedad con contactos
router.get("/cartera", (req, res) => {
  try {
    actualizarDias();
    const rows = db.prepare(`
      SELECT f.cliente_nit, f.cliente_nombre,
        SUM(CASE WHEN f.dias_para_vencer >= 0 THEN f.saldo_pendiente ELSE 0 END) AS vigente,
        SUM(CASE WHEN f.dias_para_vencer >= -30 AND f.dias_para_vencer < 0 THEN f.saldo_pendiente ELSE 0 END) AS v1_30,
        SUM(CASE WHEN f.dias_para_vencer >= -60 AND f.dias_para_vencer < -30 THEN f.saldo_pendiente ELSE 0 END) AS v31_60,
        SUM(CASE WHEN f.dias_para_vencer >= -90 AND f.dias_para_vencer < -60 THEN f.saldo_pendiente ELSE 0 END) AS v61_90,
        SUM(CASE WHEN f.dias_para_vencer < -90 THEN f.saldo_pendiente ELSE 0 END) AS v91mas,
        SUM(f.saldo_pendiente) AS total,
        COUNT(*) AS facturas,
        (SELECT COUNT(*) FROM recordatorios_cxc r WHERE r.cliente_nit = f.cliente_nit) AS veces_contactado,
        MAX(f.clasificacion) AS clasificacion
      FROM facturas_cobrar f
      WHERE f.estado != 'pagada'
      GROUP BY f.cliente_nit, f.cliente_nombre
      ORDER BY total DESC
    `).all();
    res.json({ cartera: rows });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// GET /cxc/cartera/semanal — cartera por semana (para dashboard)
router.get("/cartera/semanal", (req, res) => {
  try {
    actualizarDias();
    const facturas = db.prepare("SELECT * FROM facturas_cobrar WHERE estado != 'pagada' ORDER BY fecha_vencimiento ASC").all();
    res.json({ facturas });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// POST /cxc/recordatorio/:clienteNit — enviar recordatorio manual a un cliente
router.post("/recordatorio/:clienteNit", async (req, res) => {
  try {
    actualizarDias();
    const cliente = db.prepare("SELECT * FROM clientes WHERE nit=?").get(req.params.clienteNit);
    if (!cliente) return res.status(404).json({ error: "Cliente no encontrado" });
    if (!cliente.telefono) return res.status(400).json({ error: "Cliente sin teléfono registrado" });
    if (cliente.bot_pausado) return res.status(400).json({ error: "Bot pausado para este cliente" });

    const facturas = db.prepare("SELECT * FROM facturas_cobrar WHERE cliente_nit=? AND estado != 'pagada' ORDER BY fecha_vencimiento ASC").all(req.params.clienteNit);
    if (!facturas.length) return res.status(400).json({ error: "No hay facturas pendientes para este cliente" });

    const { cuenta_pago } = req.body || {};
    const fmt  = v => "$" + Number(v||0).toLocaleString("es-CO");
    const nombre = cliente.nombre.split(" ")[0];

    const listaFacturas = facturas.map(f => {
      const dias  = f.dias_para_vencer;
      const label = dias < 0 ? `⚠️ VENCIDA hace ${Math.abs(dias)} días` : dias === 0 ? `🔴 VENCE HOY` : dias <= 7 ? `🟡 Vence en ${dias} días` : `🟢 Vence en ${dias} días`;
      const dto   = f.descuento  ? `\n   Descuento: -${fmt(f.descuento)}`    : "";
      const fl    = f.flete      ? `\n   Flete: +${fmt(f.flete)}`            : "";
      const vf    = f.valor_final_cobrar ? fmt(f.valor_final_cobrar) : fmt(f.saldo_pendiente);
      return `• *Factura ${f.numero_factura}* — Valor: ${fmt(f.valor_factura)}${dto}${fl}\n   *Saldo: ${vf}* — ${label}`;
    }).join("\n\n");

    const totalPendiente = facturas.reduce((s, f) => s + (f.saldo_pendiente || 0), 0);
    const tieneVencidas  = facturas.some(f => f.dias_para_vencer < 0);

    let cuentaInfo = "";
    if (cuenta_pago) {
      cuentaInfo = `\n\n🏦 *Cuenta de pago:*\n${cuenta_pago}`;
    }

    const mensaje = `Hola ${nombre} 👋 ¡Buenas!\n\n` +
      (tieneVencidas
        ? `⚠️ *Tienes facturas vencidas* con LUMINA. Te recordamos amablemente regularizar tu cuenta:\n\n`
        : `📋 *Recordatorio de facturas próximas a vencer:*\n\n`) +
      listaFacturas +
      `\n\n💰 *Total pendiente: ${fmt(totalPendiente)}*${cuentaInfo}\n\n` +
      `Por favor comunícate con nosotros para coordinar tu pago. ¡Gracias por tu confianza! 🙏\n\n_Lumina Gestión Integral_`;

    await enviarMensajeReal(cliente.telefono, mensaje);

    db.prepare("INSERT INTO recordatorios_cxc (cliente_nit, cliente_nombre, mensaje, tipo) VALUES (?,?,?,'manual')").run(req.params.clienteNit, cliente.nombre, mensaje);
    db.prepare("UPDATE facturas_cobrar SET recordatorio_enviado=1, ultimo_recordatorio=CURRENT_TIMESTAMP WHERE cliente_nit=? AND estado != 'pagada'").run(req.params.clienteNit);

    res.json({ ok: true, mensaje: `Recordatorio enviado a ${cliente.nombre}`, preview: mensaje });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// POST /cxc/recordatorios/masivo
router.post("/recordatorios/masivo", express.json(), async (req, res) => {
  try {
    actualizarDias();
    const { dias_limite = 3, cuenta_pago } = req.body;
    const clientesConFacturas = db.prepare(`
      SELECT DISTINCT cliente_nit FROM facturas_cobrar
      WHERE estado != 'pagada' AND dias_para_vencer <= ?
    `).all(dias_limite);

    const resultados = [];
    for (const { cliente_nit } of clientesConFacturas) {
      try {
        const r = await fetch(`http://localhost:${process.env.PORT||3000}/cxc/recordatorio/${cliente_nit}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cuenta_pago })
        });
        const d = await r.json();
        resultados.push({ cliente_nit, ...d });
      } catch(e) {
        resultados.push({ cliente_nit, error: e.message });
      }
    }
    res.json({ enviados: resultados.filter(r => r.ok).length, total: resultados.length, resultados });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// GET /cxc/historial
router.get("/historial", (req, res) => {
  try {
    const historial = db.prepare("SELECT * FROM recordatorios_cxc ORDER BY created_at DESC LIMIT 100").all();
    res.json({ historial });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ===== COMPROBANTES DE CLIENTES =====

// GET /cxc/comprobantes
router.get("/comprobantes", (req, res) => {
  try {
    const { cliente_nit } = req.query;
    let q = "SELECT * FROM comprobantes_clientes WHERE 1=1";
    const p = [];
    if (cliente_nit) { q += " AND cliente_nit = ?"; p.push(cliente_nit); }
    q += " ORDER BY created_at DESC LIMIT 200";
    const comprobantes = db.prepare(q).all(...p);
    res.json({ comprobantes });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// POST /cxc/comprobantes — subir comprobante de pago de cliente
router.post("/comprobantes", upload.single("archivo"), async (req, res) => {
  try {
    const { cliente_nit, valor, fecha_pago, facturas, notas } = req.body;
    if (!cliente_nit) return res.status(400).json({ error: "cliente_nit requerido" });
    const cliente = db.prepare("SELECT * FROM clientes WHERE nit=?").get(cliente_nit);
    const nombre  = cliente?.nombre || cliente_nit;

    let archivo_nombre = null, archivo_path = null, mime_type = "image/jpeg";
    if (req.file) {
      archivo_nombre = req.file.filename;
      archivo_path   = req.file.path;
      mime_type      = req.file.mimetype;
    }

    db.prepare(`INSERT INTO comprobantes_clientes
      (cliente_nit, cliente_nombre, facturas, valor, fecha_pago, archivo_nombre, archivo_path, mime_type, notas)
      VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(cliente_nit, nombre, facturas||null, valor ? parseFloat(valor) : null,
           fecha_pago||null, archivo_nombre, archivo_path, mime_type, notas||null);

    // Si tiene valor, registrar el abono en las facturas cubiertas
    if (valor && facturas) {
      const nums = facturas.split(",").map(s=>s.trim()).filter(Boolean);
      for (const num of nums) {
        const f = db.prepare("SELECT * FROM facturas_cobrar WHERE numero_factura=? AND cliente_nit=?").get(num, cliente_nit);
        if (f) {
          const nuevoAbono = (f.valor_abonado || 0) + parseFloat(valor);
          const saldo = Math.max(0, f.saldo_pendiente - parseFloat(valor));
          const estado = saldo <= 0 ? "pagada" : "pendiente";
          db.prepare("UPDATE facturas_cobrar SET valor_abonado=?, saldo_pendiente=?, estado=?, updated_at=CURRENT_TIMESTAMP WHERE id=?")
            .run(nuevoAbono, saldo, estado, f.id);
        }
      }
    }

    res.json({ ok: true, cliente_nombre: nombre });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// GET /cxc/comprobantes/ver/:nombre
router.get("/comprobantes/ver/:nombre", (req, res) => {
  const filepath = path.join(COMP_DIR, req.params.nombre);
  if (!fs.existsSync(filepath)) return res.status(404).send("No encontrado");
  res.sendFile(filepath);
});

module.exports = router;
