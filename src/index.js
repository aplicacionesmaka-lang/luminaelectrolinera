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
app.use("/facturas", require("./routes/facturas"));
app.use("/proveedores", require("./routes/proveedores"));
app.use("/mensajes", require("./routes/mensajes"));
app.use("/pagos", require("./routes/pagos"));
app.use("/fondos", require("./routes/fondos"));
app.use("/soportes", require("./routes/soportes"));
app.use("/webhook", require("./routes/webhook"));

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
  console.log(`\n🤖 MAKABOT arrancado en http://localhost:${PORT}`);
  console.log(`📊 Empresa: MAKA QCUTE SAS`);
  console.log(`🗄️  Base de datos: makabot.db`);
  console.log(`\n📋 Endpoints disponibles:`);
  console.log(`  POST /facturas/upload`);
  console.log(`  POST /proveedores/upload`);
  console.log(`  POST /mensajes/generar`);
  console.log(`  GET  /pagos/generar\n`);
});
