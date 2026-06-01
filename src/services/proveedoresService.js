const XLSX = require("xlsx");
const db = require("../models/db");
const { normalizePhone } = require("../utils/phoneNormalizer");

/**
 * Procesa el Excel de proveedores y hace INSERT o UPDATE
 * Columnas esperadas:
 *   nombre, nit, telefono, banco, cuenta, tipo_cuenta
 */
function procesarProveedoresExcel(buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

  if (!rows || rows.length === 0) {
    throw new Error("El archivo Excel no contiene datos");
  }

  const normalize = (str) => String(str).toLowerCase().replace(/\s+/g, "_");
  const normalizedRows = rows.map((row) => {
    const normalized = {};
    for (const key of Object.keys(row)) {
      normalized[normalize(key)] = row[key];
    }
    return normalized;
  });

  const upsert = db.prepare(`
    INSERT INTO proveedores (nombre, nit, telefono, banco, cuenta, tipo_cuenta, ciudad, direccion, descuento_cacharro, descuento_joyeria, descuento_activo)
    VALUES (@nombre, @nit, @telefono, @banco, @cuenta, @tipo_cuenta, @ciudad, @direccion, @descuento_cacharro, @descuento_joyeria, @descuento_activo)
    ON CONFLICT(nit) DO UPDATE SET
      nombre = excluded.nombre,
      telefono = excluded.telefono,
      banco = CASE WHEN excluded.banco != '' THEN excluded.banco ELSE proveedores.banco END,
      cuenta = CASE WHEN excluded.cuenta != '' THEN excluded.cuenta ELSE proveedores.cuenta END,
      tipo_cuenta = CASE WHEN excluded.tipo_cuenta != '' THEN excluded.tipo_cuenta ELSE proveedores.tipo_cuenta END,
      ciudad = excluded.ciudad,
      direccion = excluded.direccion,
      descuento_cacharro = excluded.descuento_cacharro,
      descuento_joyeria = excluded.descuento_joyeria,
      updated_at = CURRENT_TIMESTAMP
  `);

  const results = [];
  const errors = [];

  const transaction = db.transaction(() => {
    for (const [index, row] of normalizedRows.entries()) {
      try {
        const nit = String(row.nit || row.documento || "").trim();
        if (!nit) {
          errors.push(`Fila ${index + 1}: NIT requerido`);
          continue;
        }

        const telefono = normalizePhone(row.telefono || row.celular || row.whatsapp);

        const descCacharro = parseFloat(row.descuento_cacharro || row["descuento cacharro"] || 0) || 0;
        const descJoyeria = row.descuento_joyeria != null && row.descuento_joyeria !== ""
          ? parseFloat(row.descuento_joyeria || row["descuento joyeria"])
          : null;

        const proveedor = {
          nombre: String(row.nombre || row.razon_social || row.proveedor || "").trim(),
          nit: nit,
          telefono: telefono || null,
          banco: String(row.banco || "").trim(),
          cuenta: String(row.cuenta || row.numero_cuenta || "").trim(),
          tipo_cuenta: String(row.tipo_cuenta || row.tipo || "").trim(),
          ciudad: String(row.ciudad || "").trim() || null,
          direccion: String(row["dirección"] || row.direccion || "").trim() || null,
          descuento_cacharro: descCacharro,
          descuento_joyeria: descJoyeria,
          descuento_activo: "cacharro",
        };

        if (!proveedor.nombre) {
          errors.push(`Fila ${index + 1}: Nombre requerido`);
          continue;
        }

        upsert.run(proveedor);
        results.push({ ...proveedor, accion: "insertado/actualizado" });
      } catch (err) {
        errors.push(`Fila ${index + 1}: ${err.message}`);
      }
    }
  });

  transaction();

  return {
    total_procesados: results.length,
    errores: errors,
    proveedores: results,
  };
}

function getAllProveedores() {
  return db.prepare("SELECT * FROM proveedores ORDER BY nombre").all();
}

function getProveedorByNit(nit) {
  return db.prepare("SELECT * FROM proveedores WHERE nit = ?").get(nit);
}

function updateBancario(nit, banco, cuenta, tipo_cuenta) {
  return db
    .prepare(
      `UPDATE proveedores SET banco = ?, cuenta = ?, tipo_cuenta = ?, updated_at = CURRENT_TIMESTAMP WHERE nit = ?`
    )
    .run(banco, cuenta, tipo_cuenta, nit);
}

function updateDescuentoActivo(nit, descuento_activo) {
  if (!["cacharro", "joyeria"].includes(descuento_activo)) {
    throw new Error("descuento_activo debe ser 'cacharro' o 'joyeria'");
  }
  return db
    .prepare(`UPDATE proveedores SET descuento_activo = ?, updated_at = CURRENT_TIMESTAMP WHERE nit = ?`)
    .run(descuento_activo, nit);
}

function updateProveedor(nit, data) {
  const { nombre, telefono, banco, cuenta, tipo_cuenta, ciudad, direccion,
          descuento_cacharro, descuento_joyeria, descuento_activo,
          titular_nombre, titular_id } = data;
  // Para campos bancarios: solo sobrescribir si el nuevo valor no está vacío
  // Así se protegen los datos bancarios registrados por WhatsApp
  const existing = db.prepare("SELECT banco, cuenta, tipo_cuenta, titular_nombre, titular_id FROM proveedores WHERE nit = ?").get(nit) || {};
  const safeBanco         = banco?.trim()          || existing.banco         || null;
  const safeCuenta        = cuenta?.trim()         || existing.cuenta        || null;
  const safeTipo          = tipo_cuenta?.trim()    || existing.tipo_cuenta   || null;
  const safeTitularNombre = titular_nombre?.trim() || existing.titular_nombre || null;
  const safeTitularId     = titular_id?.trim()     || existing.titular_id    || null;
  return db.prepare(`
    UPDATE proveedores SET
      nombre = ?, telefono = ?, banco = ?, cuenta = ?, tipo_cuenta = ?,
      ciudad = ?, direccion = ?, descuento_cacharro = ?, descuento_joyeria = ?,
      descuento_activo = ?, titular_nombre = ?, titular_id = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE nit = ?
  `).run(nombre, telefono, safeBanco, safeCuenta, safeTipo, ciudad, direccion,
         descuento_cacharro, descuento_joyeria || null, descuento_activo,
         safeTitularNombre, safeTitularId, nit);
}

function getDescuentoActivoValue(nit) {
  const p = db.prepare("SELECT descuento_cacharro, descuento_joyeria, descuento_activo FROM proveedores WHERE nit = ?").get(nit);
  if (!p) return 0;
  return p.descuento_activo === "joyeria" && p.descuento_joyeria != null
    ? p.descuento_joyeria
    : p.descuento_cacharro || 0;
}

function recalcularFacturasPendientes(nit) {
  const tasa = getDescuentoActivoValue(nit);
  const facturas = db.prepare(
    "SELECT id, valor_factura, flete FROM facturas WHERE proveedor_nit = ? AND estado = 'pendiente'"
  ).all(nit);
  if (facturas.length === 0) return 0;
  const stmt = db.prepare(
    "UPDATE facturas SET descuento_pronto_pago = ?, valor_final = ? WHERE id = ?"
  );
  const txn = db.transaction(() => {
    for (const f of facturas) {
      const descuento = (f.valor_factura || 0) * tasa;
      const valorFinal = (f.valor_factura || 0) - descuento + (f.flete || 0);
      stmt.run(descuento, valorFinal, f.id);
    }
  });
  txn();
  return facturas.length;
}

module.exports = {
  procesarProveedoresExcel,
  getAllProveedores,
  getProveedorByNit,
  updateBancario,
  updateDescuentoActivo,
  updateProveedor,
  getDescuentoActivoValue,
  recalcularFacturasPendientes,
};
