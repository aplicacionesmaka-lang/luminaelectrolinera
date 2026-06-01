require("dotenv").config();
const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir archivos estáticos (frontend) y archivos de ejemplo
app.use(express.static(path.join(__dirname, "../public")));
app.use(express.static(path.join(__dirname, "..")));  // para descargar ejemplos

// Inicializar base de datos al arrancar
require("./models/db");

// Rutas API
app.use("/facturas",    require("./routes/facturas"));
app.use("/proveedores", require("./routes/proveedores"));
app.use("/mensajes", require("./routes/mensajes"));
app.use("/pagos", require("./routes/pagos"));
app.use("/fondos", require("./routes/fondos"));
app.use("/soportes", require("./routes/soportes"));
app.use("/cxp",        require("./routes/cxp"));
app.use("/inventario", require("./routes/inventario"));
app.use("/webhook",    require("./routes/webhook"));
app.use("/ventas",     require("./routes/ventas"));
app.use("/compras",    require("./routes/compras"));
app.use("/cxc",        require("./routes/cxc"));

// Ruta principal - servir el dashboard
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

// Manejo de errores global
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Error interno del servidor", detalle: err.message });
});

// 404
app.use((req, res) => {
  res.status(404).json({ error: `Ruta no encontrada: ${req.method} ${req.path}` });
});

app.listen(PORT, () => {
  console.log(`\n✨ LUMINA GESTIÓN INTEGRAL arrancado en http://localhost:${PORT}`);

  // WhatsApp deshabilitado en LUMINA (se comparte servidor con MAKABOT)
});
