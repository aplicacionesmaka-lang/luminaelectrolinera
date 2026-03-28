const express = require("express");
const router = express.Router();
const db = require("../models/db");

// Cuentas predefinidas con saldo inicial 0
const CUENTAS_DEFAULT = [
  { nombre: "Efectivo Disponible" },
  { nombre: "Bancolombia Negocios" },
  { nombre: "Bancolombia Personal" },
  { nombre: "Banco Bold" },
];

// Inicializar cuentas si no existen
function initCuentas() {
  const stmt = db.prepare("INSERT OR IGNORE INTO cuentas (nombre, saldo) VALUES (?, 0)");
  CUENTAS_DEFAULT.forEach(c => stmt.run(c.nombre));
}
initCuentas();

// GET /fondos/cuentas
router.get("/cuentas", (req, res) => {
  try {
    const cuentas = db.prepare("SELECT * FROM cuentas ORDER BY id").all();
    res.json({ cuentas });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /fondos/cuentas/:id
router.put("/cuentas/:id", express.json(), (req, res) => {
  try {
    const { saldo } = req.body;
    db.prepare("UPDATE cuentas SET saldo = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(Number(saldo) || 0, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /fondos/gastos
router.get("/gastos", (req, res) => {
  try {
    const gastos = db.prepare("SELECT * FROM gastos_semana ORDER BY categoria, id").all();
    res.json({ gastos });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /fondos/gastos
router.post("/gastos", express.json(), (req, res) => {
  try {
    const { categoria, descripcion = "", valor = 0, semana = "" } = req.body;
    if (!categoria) return res.status(400).json({ error: "categoria requerida" });
    const r = db.prepare(
      "INSERT INTO gastos_semana (categoria, descripcion, valor, semana) VALUES (?, ?, ?, ?)"
    ).run(categoria, descripcion, Number(valor) || 0, semana);
    res.json({ id: r.lastInsertRowid, ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /fondos/gastos/:id
router.put("/gastos/:id", express.json(), (req, res) => {
  try {
    const { categoria, descripcion, valor } = req.body;
    db.prepare("UPDATE gastos_semana SET categoria=?, descripcion=?, valor=? WHERE id=?")
      .run(categoria, descripcion || "", Number(valor) || 0, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /fondos/gastos/:id
router.delete("/gastos/:id", (req, res) => {
  try {
    db.prepare("DELETE FROM gastos_semana WHERE id=?").run(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /fondos/resumen — total fondos vs total a pagar
// Acepta ?vencimiento_desde=YYYY-MM-DD&vencimiento_hasta=YYYY-MM-DD para filtrar totalAPagar
router.get("/resumen", (req, res) => {
  try {
    const { vencimiento_desde, vencimiento_hasta } = req.query;
    const cuentas = db.prepare("SELECT * FROM cuentas ORDER BY id").all();
    const gastos = db.prepare("SELECT * FROM gastos_semana").all();

    let queryTotal = "SELECT SUM(valor_final) as total FROM facturas WHERE incluir_pago = 1 AND estado = 'pendiente'";
    const params = [];
    if (vencimiento_desde) { queryTotal += " AND fecha_vencimiento >= ?"; params.push(vencimiento_desde); }
    if (vencimiento_hasta) { queryTotal += " AND fecha_vencimiento <= ?"; params.push(vencimiento_hasta); }

    const facturasMarcadas = db.prepare(queryTotal).get(...params);

    const totalFondos = cuentas.reduce((s, c) => s + (c.saldo || 0), 0);
    const totalGastos = gastos.reduce((s, g) => s + (g.valor || 0), 0);
    const totalAPagar = facturasMarcadas?.total || 0;
    const saldoNeto = totalFondos - totalGastos;
    const saldoFinal = saldoNeto - totalAPagar;
    const fondosSuficientes = saldoFinal >= 0;

    res.json({
      cuentas,
      gastos,
      totalFondos,
      totalGastos,
      saldoNeto,
      totalAPagar,
      saldoFinal,
      fondosSuficientes,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
