const express = require("express");
const router = express.Router();
const multer = require("multer");
const { validateExcelFile } = require("../utils/excelValidator");
const db = require("../models/db");
const {
  procesarProveedoresExcel,
  getAllProveedores,
  getProveedorByNit,
  updateBancario,
  updateDescuentoActivo,
  updateProveedor,
  getDescuentoActivoValue,
  recalcularFacturasPendientes,
} = require("../services/proveedoresService");

const upload = multer({ storage: multer.memoryStorage() });

// POST /proveedores/upload - Subir y procesar Excel de proveedores
router.post("/upload", upload.single("archivo"), (req, res) => {
  try {
    const validation = validateExcelFile(req.file);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    const resultado = procesarProveedoresExcel(req.file.buffer);

    res.json({
      mensaje: `Se procesaron ${resultado.total_procesados} proveedores`,
      ...resultado,
    });
  } catch (err) {
    console.error("Error procesando proveedores:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET /proveedores - Listar todos los proveedores
router.get("/", (req, res) => {
  try {
    const proveedores = getAllProveedores();
    res.json({ proveedores, total: proveedores.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /proveedores/:nit - Obtener proveedor por NIT
router.get("/:nit", (req, res) => {
  try {
    const proveedor = getProveedorByNit(req.params.nit);
    if (!proveedor) {
      return res.status(404).json({ error: "Proveedor no encontrado" });
    }
    res.json({ proveedor });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /proveedores/:nit/bancario - Actualizar datos bancarios
router.put("/:nit/bancario", express.json(), (req, res) => {
  try {
    const { banco, cuenta, tipo_cuenta } = req.body;
    if (!banco || !cuenta) {
      return res
        .status(400)
        .json({ error: "banco y cuenta son requeridos" });
    }

    const result = updateBancario(req.params.nit, banco, cuenta, tipo_cuenta);
    if (result.changes === 0) {
      return res.status(404).json({ error: "Proveedor no encontrado" });
    }

    res.json({ mensaje: "Datos bancarios actualizados", nit: req.params.nit });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /proveedores/:nit/descuento - Cambiar descuento activo (cacharro/joyeria)
router.put("/:nit/descuento", express.json(), (req, res) => {
  try {
    const { descuento_activo } = req.body;
    const result = updateDescuentoActivo(req.params.nit, descuento_activo);
    if (result.changes === 0) {
      return res.status(404).json({ error: "Proveedor no encontrado" });
    }
    const actualizadas = recalcularFacturasPendientes(req.params.nit);
    res.json({ mensaje: "Descuento activo actualizado", nit: req.params.nit, descuento_activo, facturas_recalculadas: actualizadas });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /proveedores/:nit/recalcular-facturas — recalcula descuento en facturas pendientes
router.post("/:nit/recalcular-facturas", (req, res) => {
  try {
    const { nit } = req.params;
    const tasa = getDescuentoActivoValue(nit);
    const actualizadas = recalcularFacturasPendientes(nit);
    res.json({
      mensaje: `Descuento recalculado al ${(tasa * 100).toFixed(1)}% en ${actualizadas} factura(s) pendiente(s)`,
      tasa_aplicada: tasa,
      actualizadas,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /proveedores - Crear nuevo proveedor manualmente
router.post("/", express.json(), (req, res) => {
  try {
    const { nit, nombre, telefono, telefono2, ciudad, direccion, banco, cuenta, tipo_cuenta, titular_nombre, titular_id, descuento_cacharro, descuento_joyeria, descuento_activo } = req.body;
    if (!nit || !nombre) return res.status(400).json({ error: "nit y nombre son obligatorios" });
    const existe = db.prepare("SELECT nit FROM proveedores WHERE nit = ?").get(nit);
    if (existe) return res.status(409).json({ error: "Ya existe un proveedor con ese NIT" });
    db.prepare(`INSERT INTO proveedores (nit, nombre, telefono, telefono2, ciudad, direccion, banco, cuenta, tipo_cuenta, titular_nombre, titular_id, descuento_cacharro, descuento_joyeria, descuento_activo)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(nit, nombre, telefono||null, telefono2||null, ciudad||null, direccion||null, banco||null, cuenta||null, tipo_cuenta||null, titular_nombre||null, titular_id||null, descuento_cacharro||0, descuento_joyeria||null, descuento_activo||'cacharro');
    res.json({ mensaje: "Proveedor creado", nit });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /proveedores/:nit - Actualizar todos los datos del proveedor
router.put("/:nit", express.json(), (req, res) => {
  try {
    const result = updateProveedor(req.params.nit, req.body);
    if (result.changes === 0) {
      return res.status(404).json({ error: "Proveedor no encontrado" });
    }
    const actualizadas = recalcularFacturasPendientes(req.params.nit);
    res.json({ mensaje: "Proveedor actualizado", nit: req.params.nit, facturas_recalculadas: actualizadas });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
