const path = require("path");
const fs = require("fs");
const db = require("../models/db");
const { enviarMensajeReal, enviarDocumento } = require("./whatsappService");

const SOPORTES_DIR = path.join(__dirname, "../../soportes");
if (!fs.existsSync(SOPORTES_DIR)) fs.mkdirSync(SOPORTES_DIR, { recursive: true });

/**
 * Guarda el archivo de soporte en disco y en la BD,
 * luego notifica al proveedor por WhatsApp.
 */
async function guardarSoporte({ proveedor_nit, proveedor_nombre_erp = null, facturas, valor, fecha_pago, notas, buffer, originalname, mimetype }) {
  let proveedor = db.prepare("SELECT * FROM proveedores WHERE nit = ?").get(proveedor_nit);
  // Si no está en SQLite, usar nombre pasado o NIT como fallback (proveedor solo en ERP)
  if (!proveedor) {
    proveedor = { nit: proveedor_nit, nombre: proveedor_nombre_erp || proveedor_nit, telefono: null, telefono2: null };
  }

  // Guardar archivo en disco
  const timestamp = Date.now();
  const ext = path.extname(originalname) || (mimetype.includes("pdf") ? ".pdf" : ".jpg");
  const filename = `soporte_${proveedor_nit}_${timestamp}${ext}`;
  const filePath = path.join(SOPORTES_DIR, filename);
  fs.writeFileSync(filePath, buffer);

  // Insertar en BD
  const stmt = db.prepare(`
    INSERT INTO soportes_pago (proveedor_nit, proveedor_nombre, facturas, valor, fecha_pago, archivo_nombre, archivo_path, mime_type, notas)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    proveedor_nit,
    proveedor.nombre,
    facturas || "",
    valor || null,
    fecha_pago || null,
    filename,
    filePath,
    mimetype || "image/jpeg",
    notas || null
  );

  // Notificar al proveedor por WhatsApp
  const telefono = proveedor.telefono;
  if (telefono) {
    const valorFmt = valor ? `$${Number(valor).toLocaleString("es-CO")}` : "";
    const fechaFmt = fecha_pago || new Date().toLocaleDateString("es-CO");
    const facturasStr = facturas ? `\n📄 Facturas: ${facturas}` : "";
    const notasStr = notas ? `\n📝 Nota: ${notas}` : "";

    const mensaje =
      `Hola ${proveedor.nombre} 👋\n\n` +
      `✅ *Confirmamos pago realizado*\n` +
      `💰 Valor: ${valorFmt}\n` +
      `📅 Fecha: ${fechaFmt}` +
      facturasStr +
      notasStr +
      `\n\nAdjuntamos el comprobante de pago. Cualquier duda estamos a su disposición.\n\n¡Que Dios les bendiga! 🙏\n\n_MakaBot - Tesorería MAKA QCUTE SAS_`;

    try {
      // Enviar texto primero
      await enviarMensajeReal(telefono, mensaje);

      // Enviar el soporte como imagen/documento
      const SERVER_URL = process.env.SERVER_URL || `http://217.71.206.34:3000`;
      const urlArchivo = `${SERVER_URL}/soportes/ver/${filename}`;
      await enviarDocumento(telefono, urlArchivo, filename, mimetype);

      // Marcar como notificado
      db.prepare("UPDATE soportes_pago SET notificado = 1 WHERE id = ?").run(result.lastInsertRowid);

      // También notificar a telefono2 si existe
      if (proveedor.telefono2) {
        try {
          await enviarMensajeReal(proveedor.telefono2, mensaje);
          await enviarDocumento(proveedor.telefono2, urlArchivo, filename, mimetype);
        } catch (e) {
          console.error("Error notificando telefono2:", e.message);
        }
      }

      console.log(`📤 Soporte enviado a ${proveedor.nombre} (${telefono})`);
    } catch (err) {
      console.error("Error enviando soporte por WhatsApp:", err.message);
    }
  }

  return { id: result.lastInsertRowid, filename, proveedor_nombre: proveedor.nombre };
}

/**
 * Busca el soporte más reciente de un proveedor para responder consultas
 */
function buscarSoporteProveedor(proveedor_nit, facturas = null) {
  if (facturas) {
    // Buscar soporte que mencione esa(s) factura(s)
    const todos = db.prepare(
      "SELECT * FROM soportes_pago WHERE proveedor_nit = ? ORDER BY created_at DESC"
    ).all(proveedor_nit);
    const factNum = facturas.replace(/\D/g, "").slice(-6); // últimos 6 dígitos del número
    const coincide = todos.find(s => s.facturas && s.facturas.includes(factNum));
    if (coincide) return coincide;
  }
  // Retornar el más reciente
  return db.prepare(
    "SELECT * FROM soportes_pago WHERE proveedor_nit = ? ORDER BY created_at DESC LIMIT 1"
  ).get(proveedor_nit);
}

function getSoportesPorProveedor(proveedor_nit) {
  return db.prepare(
    "SELECT * FROM soportes_pago WHERE proveedor_nit = ? ORDER BY created_at DESC"
  ).all(proveedor_nit);
}

function getTodosSoportes() {
  return db.prepare("SELECT * FROM soportes_pago ORDER BY created_at DESC").all();
}

module.exports = { guardarSoporte, buscarSoporteProveedor, getSoportesPorProveedor, getTodosSoportes, SOPORTES_DIR };
