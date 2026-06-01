const express = require("express");
const router  = express.Router();
const db      = require("../models/db");

const TIENDAS = { '002': 'ARRE', '009': 'LA30', '010': 'PLAZA' };

// GET /presupuesto?anio=2026&mes=3  — trae todos o filtrado
router.get("/", (req, res) => {
  try {
    const { anio, mes } = req.query;
    let query = "SELECT * FROM presupuesto_ventas WHERE 1=1";
    const params = [];
    if (anio) { query += " AND anio=?"; params.push(parseInt(anio)); }
    if (mes)  { query += " AND mes=?";  params.push(parseInt(mes)); }
    query += " ORDER BY anio, mes, codalm";
    const rows = db.prepare(query).all(...params);
    res.json({ presupuestos: rows });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PUT /presupuesto — upsert { codalm, anio, mes, presupuesto }
router.put("/", express.json(), (req, res) => {
  try {
    const { codalm, anio, mes, presupuesto } = req.body;
    if (!codalm || !anio || !mes || presupuesto == null)
      return res.status(400).json({ error: "codalm, anio, mes y presupuesto son requeridos" });
    db.prepare(`
      INSERT INTO presupuesto_ventas (codalm, anio, mes, presupuesto, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(codalm, anio, mes) DO UPDATE SET
        presupuesto = excluded.presupuesto,
        updated_at  = CURRENT_TIMESTAMP
    `).run(codalm, parseInt(anio), parseInt(mes), parseFloat(presupuesto));
    res.json({ ok: true, codalm, anio, mes, presupuesto });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
