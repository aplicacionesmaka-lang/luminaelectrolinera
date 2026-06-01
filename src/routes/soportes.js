const express = require("express");
const router  = express.Router();
const multer  = require("multer");
const path    = require("path");
const fs      = require("fs");
const { guardarSoporte, getSoportesPorProveedor, getTodosSoportes, SOPORTES_DIR } = require("../services/soportesService");
const { analizarImagenProveedor } = require("../services/claudeService");

// Multer en memoria
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/jpg", "application/pdf"];
    cb(null, allowed.includes(file.mimetype));
  },
});

// POST /soportes/upload — Subir soporte y notificar proveedor
router.post("/upload", upload.single("soporte"), async (req, res) => {
  try {
    const { proveedor_nit, facturas, valor, fecha_pago, notas } = req.body;
    if (!proveedor_nit) return res.status(400).json({ error: "proveedor_nit es requerido" });
    if (!req.file)      return res.status(400).json({ error: "Archivo de soporte requerido (imagen o PDF)" });

    const resultado = await guardarSoporte({
      proveedor_nit,
      facturas,
      valor: valor ? parseFloat(valor) : null,
      fecha_pago,
      notas,
      buffer:       req.file.buffer,
      originalname: req.file.originalname,
      mimetype:     req.file.mimetype,
    });

    res.json({ mensaje: "Soporte guardado y proveedor notificado por WhatsApp", ...resultado });
  } catch (err) {
    console.error("Error subiendo soporte:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /soportes/analizar-ia — Analiza imagen/PDF con IA y extrae datos del comprobante
router.post("/analizar-ia", express.json({ limit: "20mb" }), async (req, res) => {
  try {
    const { base64, mimeType } = req.body;
    if (!base64) return res.status(400).json({ error: "base64 requerido" });
    const resultado = await analizarImagenProveedor(base64, mimeType || "image/jpeg");
    res.json(resultado);
  } catch (err) {
    console.error("Error analizando comprobante:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /soportes — Todos los soportes
router.get("/", (req, res) => {
  try {
    const soportes = getTodosSoportes();
    res.json({ soportes, total: soportes.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /soportes/proveedor/:nit — Soportes de un proveedor
router.get("/proveedor/:nit", (req, res) => {
  try {
    const soportes = getSoportesPorProveedor(req.params.nit);
    res.json({ soportes, total: soportes.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /soportes/:id — Actualizar facturas, valor, fecha_pago, notas de un soporte
router.put("/:id", express.json(), (req, res) => {
  try {
    const { facturas, valor, fecha_pago, notas } = req.body;
    const db = require("../models/db");
    const r = db.prepare(`
      UPDATE soportes_pago SET facturas=?, valor=?, fecha_pago=?, notas=?
      WHERE id=?
    `).run(facturas || null, valor ? parseFloat(valor) : null, fecha_pago || null, notas || null, req.params.id);
    if (r.changes === 0) return res.status(404).json({ error: "Soporte no encontrado" });
    res.json({ ok: true });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /soportes/analizar-archivo/:id — Lee el archivo físico del soporte y lo analiza con IA
router.post("/analizar-archivo/:id", async (req, res) => {
  try {
    const db = require("../models/db");
    const soporte = db.prepare("SELECT * FROM soportes_pago WHERE id = ?").get(req.params.id);
    if (!soporte) return res.status(404).json({ error: "Soporte no encontrado" });
    const filePath = path.join(SOPORTES_DIR, soporte.archivo_nombre);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: "Archivo físico no encontrado" });
    const buffer = fs.readFileSync(filePath);
    const base64 = buffer.toString("base64");
    const mimeType = soporte.mime_type || "image/jpeg";
    const { extraerDatosSoporte } = require("../services/claudeService");
    const proveedores = db.prepare("SELECT nit, nombre FROM proveedores").all();
    const datos = await extraerDatosSoporte("", proveedores, base64, mimeType);
    res.json(datos);
  } catch(err) {
    console.error("Error analizando archivo:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /soportes/:id/reenviar — Reenvía el soporte al proveedor por WhatsApp
router.post("/:id/reenviar", async (req, res) => {
  try {
    const db = require("../models/db");
    const { enviarMensajeReal, enviarDocumento } = require("../services/whatsappService");

    const soporte = db.prepare("SELECT * FROM soportes_pago WHERE id = ?").get(req.params.id);
    if (!soporte) return res.status(404).json({ error: "Soporte no encontrado" });

    let proveedor = db.prepare("SELECT * FROM proveedores WHERE nit = ?").get(soporte.proveedor_nit);
    if (!proveedor) proveedor = { nit: soporte.proveedor_nit, nombre: soporte.proveedor_nombre, telefono: null, telefono2: null };

    if (!proveedor.telefono) return res.status(400).json({ error: "Proveedor sin número de teléfono registrado" });

    const fechaOriginal = soporte.created_at
      ? new Date(soporte.created_at).toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Bogota" })
      : "fecha desconocida";
    const valorFmt = soporte.valor ? `$${Number(soporte.valor).toLocaleString("es-CO")}` : "";
    const facturasStr = soporte.facturas ? `\n📄 Facturas: ${soporte.facturas}` : "";
    const notasStr    = soporte.notas    ? `\n📝 Nota: ${soporte.notas}`        : "";
    const fechaPago   = soporte.fecha_pago || fechaOriginal;

    const mensaje =
      `Hola ${proveedor.nombre} 👋\n\n` +
      `🔁 *Reenvío de comprobante de pago*\n` +
      `_(Enviado originalmente el ${fechaOriginal})_\n\n` +
      `💰 Valor: ${valorFmt}\n` +
      `📅 Fecha de pago: ${fechaPago}` +
      facturasStr +
      notasStr +
      `\n\nAdjuntamos nuevamente el comprobante. Cualquier duda estamos a su disposición.\n\n¡Que Dios les bendiga! 🙏\n\n_MakaBot - Tesorería MAKA QCUTE SAS_`;

    await enviarMensajeReal(proveedor.telefono, mensaje);

    const SERVER_URL = process.env.SERVER_URL || `http://217.71.206.34:3000`;
    const urlArchivo = `${SERVER_URL}/soportes/ver/${soporte.archivo_nombre}`;
    await enviarDocumento(proveedor.telefono, urlArchivo, soporte.archivo_nombre, soporte.mime_type || "image/jpeg");

    if (proveedor.telefono2) {
      try {
        await enviarMensajeReal(proveedor.telefono2, mensaje);
        await enviarDocumento(proveedor.telefono2, urlArchivo, soporte.archivo_nombre, soporte.mime_type || "image/jpeg");
      } catch(e) { console.error("Error reenvío telefono2:", e.message); }
    }

    console.log(`🔁 Soporte #${soporte.id} reenviado a ${proveedor.nombre}`);
    res.json({ ok: true, mensaje: `Soporte reenviado a ${proveedor.nombre}`, fecha_original: fechaOriginal });
  } catch (err) {
    console.error("Error reenviando soporte:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /soportes/ver/:filename — Descargar/ver el archivo
router.get("/ver/:filename", (req, res) => {
  try {
    const filename = path.basename(req.params.filename);
    const filePath = path.join(SOPORTES_DIR, filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: "Archivo no encontrado" });
    res.sendFile(filePath);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
