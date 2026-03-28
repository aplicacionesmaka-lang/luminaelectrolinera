const express = require("express");
const router  = express.Router();
const { getCuentasPorPagar, getResumenCxP, buscarFacturasProveedor } = require("../services/sqlServerService");

// GET /cxp — Todas las facturas pendientes
router.get("/", async (req, res) => {
  try {
    const { vencidas, nit } = req.query;
    const data = await getCuentasPorPagar({ soloVencidas: vencidas === "1", nit });
    res.json({ facturas: data, total: data.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /cxp/resumen — Resumen por proveedor
router.get("/resumen", async (req, res) => {
  try {
    const data = await getResumenCxP();
    const totalPendiente = data.reduce((s, r) => s + (r.total_pendiente || 0), 0);
    const totalVencido   = data.reduce((s, r) => s + (r.total_vencido   || 0), 0);
    res.json({ proveedores: data, total_pendiente: totalPendiente, total_vencido: totalVencido });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /cxp/buscar?q=nombre — Buscar por proveedor o factura
router.get("/buscar", async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.status(400).json({ error: "Parámetro q requerido" });
    const data = await buscarFacturasProveedor(q);
    res.json({ facturas: data, total: data.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
