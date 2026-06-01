const express = require("express");
const router  = express.Router();
const { getReporteVentas, getPyG } = require("../services/sqlServerService");

// GET /ventas?desde=2026-01-01&hasta=2026-04-01&agrupacion=dia&codalm=002
router.get("/", async (req, res) => {
  try {
    const { desde, hasta, agrupacion = "dia", codalm = null } = req.query;

    if (!desde || !hasta) {
      // Si no hay fechas, usar el mes actual
      const hoy   = new Date();
      const y     = hoy.getFullYear();
      const m     = String(hoy.getMonth() + 1).padStart(2, "0");
      req.query.desde = `${y}-${m}-01`;
      req.query.hasta = `${y}-${m}-${new Date(y, hoy.getMonth()+1, 0).getDate()}`;
    }

    const rows = await getReporteVentas({
      desde:      req.query.desde,
      hasta:      req.query.hasta,
      agrupacion,
      codalm:     codalm || null,
    });

    res.json({ rows, total: rows.length });
  } catch (err) {
    console.error("Error ventas:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /ventas/pyg?desde=2026-01-01&hasta=2026-05-10
router.get("/pyg", async (req, res) => {
  try {
    let { desde, hasta } = req.query;
    if (!desde || !hasta) {
      const hoy = new Date();
      const y = hoy.getFullYear();
      const m = String(hoy.getMonth() + 1).padStart(2, "0");
      desde = `${y}-${m}-01`;
      hasta = `${y}-${m}-${new Date(y, hoy.getMonth()+1, 0).getDate()}`;
    }
    const data = await getPyG({ desde, hasta });
    res.json(data);
  } catch (err) {
    console.error("Error P&G:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /ventas/presupuesto — alias para presupuesto (si lo necesita)
router.get("/presupuesto", async (req, res) => {
  res.json({ presupuestos: [] });
});

module.exports = router;
