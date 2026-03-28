const XLSX = require("xlsx");
const db = require("../models/db");
const { getDescuentoActivoValue } = require("./proveedoresService");
const { normalizePhone } = require("../utils/phoneNormalizer");

/**
 * Procesa el Excel de facturas y las guarda agrupadas por proveedor
 * Columnas esperadas (flexible):
 *   numero_factura, proveedor_nit, proveedor_nombre, valor_factura,
 *   descuento_pronto_pago, flete, fecha_factura, fecha_vencimiento
 */
// Convierte un valor de celda Excel a string YYYY-MM-DD
function excelDateToStr(val) {
  if (!val || val === 0) return '';
  // Si ya es un objeto Date (cellDates:true lo convierte automáticamente)
  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  // Si es número serial de Excel (rango razonable para fechas 2000-2099)
  if (typeof val === 'number' && val > 36526 && val < 73050) {
    const d = new Date(Math.round((val - 25569) * 86400 * 1000));
    const y = d.getUTCFullYear();
    const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dy = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${mo}-${dy}`;
  }
  return String(val);
}

/**
 * Busca en un objeto (con claves normalizadas) el primer valor que coincida
 * con alguna de las palabras clave dadas (búsqueda parcial).
 */
function buscarColumna(row, palabras, defVal = '') {
  const keys = Object.keys(row);
  for (const palabra of palabras) {
    const found = keys.find(k => k.includes(palabra));
    if (found && row[found] !== undefined && row[found] !== null && row[found] !== '') {
      return row[found];
    }
  }
  return defVal;
}

function procesarFacturasExcel(buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  if (!rows || rows.length === 0) {
    throw new Error("El archivo Excel no contiene datos");
  }

  // Normalizar nombres de columnas: minúsculas, sin tildes, sin espacios, sin guiones
  const normalize = (str) => String(str)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quitar tildes
    .replace(/[\s\-_.]+/g, '_')                        // espacios/guiones → _
    .replace(/[^a-z0-9_]/g, '');                       // quitar caracteres raros

  const normalizedRows = rows.map((row) => {
    const normalized = {};
    for (const key of Object.keys(row)) {
      normalized[normalize(key)] = row[key];
    }
    return normalized;
  });

  // Log columnas encontradas (útil para diagnóstico)
  if (normalizedRows.length > 0) {
    console.log('[Excel] Columnas detectadas:', Object.keys(normalizedRows[0]).join(', '));
  }

  const insertFactura = db.prepare(`
    INSERT INTO facturas (
      numero_factura, proveedor_nit, proveedor_nombre,
      valor_factura, descuento_pronto_pago, flete, valor_final,
      fecha_factura, fecha_vencimiento, estado, incluir_pago, origen_valor
    ) VALUES (
      @numero_factura, @proveedor_nit, @proveedor_nombre,
      @valor_factura, @descuento_pronto_pago, @flete, @valor_final,
      @fecha_factura, @fecha_vencimiento, 'pendiente', 0, @origen_valor
    )
  `);

  const insertedFacturas = [];
  const errors = [];

  const transaction = db.transaction(() => {
    for (const [index, row] of normalizedRows.entries()) {
      try {
        // Búsqueda flexible por palabras clave parciales
        // Soporta columnas estándar Y columnas tipo "vr_base","vr_dcto","vence" (formato cartera colombiana)
        const valorFactura = parseFloat(
          buscarColumna(row, ['vr_base','valor_factura','valor_bruto','v_factura','importe','total_factura','vr_total','valor','monto'], 0)
        ) || 0;
        const flete = parseFloat(
          buscarColumna(row, ['flete','transporte','envio','freight'], 0)
        ) || 0;

        // Obtener saldo o neto del Excel (lo que realmente se debe)
        const vrSaldo = parseFloat(buscarColumna(row, ['vr_saldo'], 0)) || 0;
        const vrNeto = parseFloat(buscarColumna(row, ['vr_neto','valor_neto'], 0)) || 0;
        // Base para aplicar descuento pronto pago: saldo > neto > base
        const baseDescuento = vrSaldo || vrNeto || valorFactura;

        // Aplicar descuento pronto pago del proveedor SIEMPRE sobre la base
        const nitProveedor = String(buscarColumna(row, ['proveedor_nit','nit_proveedor','nit','rut','identificacion']));
        let descuento = 0;
        let origenDescuento = 'proveedor';
        if (nitProveedor) {
          const tasaProveedor = getDescuentoActivoValue(nitProveedor);
          if (tasaProveedor > 0) {
            descuento = baseDescuento * tasaProveedor;
          }
        }

        const valorFinal = baseDescuento - descuento + flete;

        const factura = {
          numero_factura: String(
            buscarColumna(row, ['numero_factura','num_factura','nro_factura','no_factura','numero','nro','factura'], `F-${index + 1}`)
          ),
          proveedor_nit: String(
            buscarColumna(row, ['proveedor_nit','nit_proveedor','nit','rut','identificacion'])
          ),
          proveedor_nombre: String(
            buscarColumna(row, ['proveedor_nombre','nombre_proveedor','proveedor','nombre','razon_social','empresa'])
          ).split(/\s*[\\|\/]\s*nit|\s*[\\|\/]\s*cels/i)[0].trim(),
          valor_factura: valorFactura || vrNeto,
          descuento_pronto_pago: descuento,
          flete: flete,
          valor_final: valorFinal,
          origen_valor: origenDescuento,
          fecha_factura: excelDateToStr(
            buscarColumna(row, ['fecha_factura','fecha_emision','f_factura','fecha_doc','fecha'], '')
          ),
          fecha_vencimiento: excelDateToStr(
            buscarColumna(row, ['vence','fecha_vencimiento','vencimiento','fecha_venc','f_vencimiento','vto','fecha_pago','due_date'], '')
          ),
        };

        if (!factura.proveedor_nit) {
          errors.push(`Fila ${index + 1}: NIT de proveedor requerido`);
          continue;
        }

        // Actualizar teléfonos del proveedor si vienen en el Excel
        const tel1 = normalizePhone(String(buscarColumna(row, ['telefono','tel','celular','movil'], '') || '').trim());
        const tel2 = normalizePhone(String(buscarColumna(row, ['telefono2','tel2','celular2','movil2','whatsapp2'], '') || '').trim());
        if (tel1 || tel2) {
          const provExistente = db.prepare('SELECT id FROM proveedores WHERE nit = ?').get(factura.proveedor_nit);
          if (provExistente) {
            const setCols = [];
            const vals = [];
            if (tel1) { setCols.push('telefono = ?'); vals.push(tel1); }
            if (tel2) { setCols.push('telefono2 = ?'); vals.push(tel2); }
            vals.push(factura.proveedor_nit);
            db.prepare(`UPDATE proveedores SET ${setCols.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE nit = ?`).run(...vals);
          } else {
            db.prepare(`INSERT OR IGNORE INTO proveedores (nombre, nit, telefono, telefono2) VALUES (?, ?, ?, ?)`)
              .run(factura.proveedor_nombre, factura.proveedor_nit, tel1 || null, tel2 || null);
          }
        }

        insertFactura.run(factura);
        insertedFacturas.push(factura);
      } catch (err) {
        errors.push(`Fila ${index + 1}: ${err.message}`);
      }
    }
  });

  transaction();

  // Agrupar por proveedor
  const porProveedor = {};
  for (const f of insertedFacturas) {
    const key = f.proveedor_nit;
    if (!porProveedor[key]) {
      porProveedor[key] = {
        proveedor_nit: f.proveedor_nit,
        proveedor_nombre: f.proveedor_nombre,
        facturas: [],
        total: 0,
      };
    }
    porProveedor[key].facturas.push(f);
    porProveedor[key].total += f.valor_final;
  }

  // Diagnóstico: qué columnas se encontraron vs cuáles faltaron
  const colsEncontradas = normalizedRows.length > 0 ? Object.keys(normalizedRows[0]) : [];
  const diagnostico = {
    columnas_excel: colsEncontradas,
    advertencias: [],
  };
  const chk = (palabras, campo) => {
    const ok = palabras.some(p => colsEncontradas.some(c => c.includes(p)));
    if (!ok) diagnostico.advertencias.push(`Campo "${campo}" no encontrado. Columnas disponibles: ${colsEncontradas.join(', ')}`);
  };
  chk(['valor_factura','valor_bruto','valor_neto','valor','monto','importe'], 'valor_factura');
  chk(['vencimiento','fecha_venc','f_vencimiento','vto'], 'fecha_vencimiento');
  chk(['nit','proveedor_nit','rut','identificacion'], 'proveedor_nit');

  return {
    total_procesadas: insertedFacturas.length,
    errores: errors,
    diagnostico,
    por_proveedor: Object.values(porProveedor),
  };
}

function getFacturasPendientes() {
  return db
    .prepare(
      `SELECT * FROM facturas WHERE estado = 'pendiente' ORDER BY proveedor_nit`
    )
    .all();
}

function getFacturasAgrupadas() {
  return db
    .prepare(`
    SELECT
      proveedor_nit,
      proveedor_nombre,
      COUNT(*) as cantidad_facturas,
      SUM(valor_factura) as total_valor_factura,
      SUM(descuento_pronto_pago) as total_descuento,
      SUM(flete) as total_flete,
      SUM(valor_final) as total_valor_final,
      estado
    FROM facturas
    GROUP BY proveedor_nit, estado
    ORDER BY proveedor_nit
  `)
    .all();
}

module.exports = { procesarFacturasExcel, getFacturasPendientes, getFacturasAgrupadas };
