const express = require("express");
const router = express.Router();
const path = require("path");
const {
  generarArchivoPagos,
  getPagosHistorial,
  PAGOS_DIR,
} = require("../services/pagosService");

// GET /pagos/generar - Generar archivo Excel de pagos
router.get("/generar", async (req, res) => {
  try {
    const { fecha_pago, vencimiento_hasta } = req.query;
    const resultado = await generarArchivoPagos(fecha_pago, vencimiento_hasta);

    res.json({
      mensaje: "Archivo de pagos generado exitosamente",
      ...resultado,
      descargar: `/pagos/descargar/${resultado.archivo}`,
    });
  } catch (err) {
    console.error("Error generando pagos:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET /pagos/descargar/:filename - Descargar archivo de pagos
router.get("/descargar/:filename", (req, res) => {
  try {
    const filename = path.basename(req.params.filename); // seguridad: evitar path traversal
    const filePath = path.join(PAGOS_DIR, filename);

    res.download(filePath, filename, (err) => {
      if (err) {
        res.status(404).json({ error: "Archivo no encontrado" });
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /pagos/historial - Historial de pagos generados
router.get("/historial", (req, res) => {
  try {
    const pagos = getPagosHistorial();
    res.json({ pagos, total: pagos.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
