const express = require("express");
const router  = express.Router();
const { getDashboardInventario, getDetalleArticulo, getTiendas } = require("../services/inventarioService");

// GET /inventario
router.get("/", async (req, res) => {
  try {
    const diasAtras = parseInt(req.query.dias) || 60;
    const codalm    = req.query.codalm || null;
    const data = await getDashboardInventario({ codalm, diasAtras });
    res.json({ ok: true, total: data.length, data });
  } catch (err) {
    console.error("Error inventario:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /inventario/detalle?codalm=002&codins=I0101001&dias=60
router.get("/detalle", async (req, res) => {
  try {
    const { codalm, codins, dias } = req.query;
    if (!codalm || !codins) return res.status(400).json({ error: "codalm y codins requeridos" });
    const data = await getDetalleArticulo({ codalm, codins, diasAtras: parseInt(dias) || 60 });
    res.json({ ok: true, data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /inventario/tiendas
router.get("/tiendas", async (req, res) => {
  try {
    const tiendas = await getTiendas();
    res.json(tiendas);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
