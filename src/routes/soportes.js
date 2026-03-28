const express = require("express");
const router  = express.Router();
const multer  = require("multer");
const path    = require("path");
const fs      = require("fs");
const { guardarSoporte, getSoportesPorProveedor, getTodosSoportes, SOPORTES_DIR } = require("../services/soportesService");

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
