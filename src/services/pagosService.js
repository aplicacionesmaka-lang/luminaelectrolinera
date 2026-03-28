const XLSX = require("xlsx");
const path = require("path");
const fs = require("fs");
const db = require("../models/db");

const PAGOS_DIR = path.join(__dirname, "../../pagos");

if (!fs.existsSync(PAGOS_DIR)) {
  fs.mkdirSync(PAGOS_DIR, { recursive: true });
}

/**
 * Distribuye el total entre las cuentas bancarias del proveedor.
 * Si valor_asignado > 0, lo usa; el saldo restante va a la última cuenta.
 * Si ninguna tiene valor_asignado, todo va a la cuenta de orden 1.
 */
function distribuirEntreCuentas(cuentas, total) {
  if (!cuentas || cuentas.length === 0) return [];

  const resultado = cuentas.map(c => ({ ...c, valor_a_pagar: 0 }));
  let asignado = 0;

  // Primero asignar los que tienen valor_asignado explícito
  for (const c of resultado) {
    if (c.valor_asignado && c.valor_asignado > 0) {
      c.valor_a_pagar = Math.min(c.valor_asignado, total - asignado);
      asignado += c.valor_a_pagar;
    }
  }

  // El saldo restante va a la primera cuenta sin valor asignado
  const saldo = total - asignado;
  if (saldo > 0.01) {
    const sinAsignar = resultado.find(c => !c.valor_asignado || c.valor_asignado === 0);
    if (sinAsignar) {
      sinAsignar.valor_a_pagar = saldo;
    } else {
      // Si todas tienen valor asignado, agregar saldo a la última
      resultado[resultado.length - 1].valor_a_pagar += saldo;
    }
  }

  return resultado.filter(c => c.valor_a_pagar > 0.01);
}

/**
 * Genera el archivo Excel de pagos con detalle por factura y split por cuenta
 */
function generarArchivoPagos(fechaPago = null) {
  const facturas = db.prepare(`
    SELECT f.*, p.nombre as p_nombre, p.banco, p.cuenta, p.tipo_cuenta,
           p.titular_nombre, p.titular_id
    FROM facturas f
    LEFT JOIN proveedores p ON f.proveedor_nit = p.nit
    WHERE f.estado = 'pendiente'
    ORDER BY f.proveedor_nit, f.numero_factura
  `).all();

  if (facturas.length === 0) {
    throw new Error("No hay facturas pendientes para generar pagos");
  }

  // Agrupar por proveedor
  const porProveedor = {};
  for (const f of facturas) {
    const nit = f.proveedor_nit;
    if (!porProveedor[nit]) {
      porProveedor[nit] = {
        proveedor_nit: nit,
        proveedor_nombre: f.proveedor_nombre || f.p_nombre,
        banco_legacy: f.banco,
        cuenta_legacy: f.cuenta,
        tipo_cuenta_legacy: f.tipo_cuenta,
        titular_legacy: f.titular_nombre,
        id_legacy: f.titular_id,
        facturas: [],
        total: 0,
      };
    }
    porProveedor[nit].facturas.push(f);
    porProveedor[nit].total += f.valor_final || 0;
  }

  // Hoja 1: Detalle de facturas
  const hFacturas = [
    ["NIT", "Proveedor", "N° Factura", "Fecha Factura", "Vencimiento",
     "Valor Factura", "Descuento", "Flete", "Valor a Pagar"]
  ];

  // Hoja 2: Instrucciones de pago por cuenta
  const hPagos = [
    ["NIT", "Proveedor", "Facturas", "Total Facturas",
     "Banco", "Tipo Cuenta", "N° Cuenta", "Titular", "Cédula/NIT Titular",
     "Valor a Transferir", "Fecha Pago"]
  ];

  const pagosInsertados = [];

  for (const prov of Object.values(porProveedor)) {
    // Obtener cuentas bancarias capturadas por el bot
    const cuentas = db.prepare(`
      SELECT * FROM cuentas_bancarias
      WHERE proveedor_nit = ? AND activa = 1
      ORDER BY orden ASC
    `).all(prov.proveedor_nit);

    // Si no hay cuentas en cuentas_bancarias, usar datos legacy del proveedor
    const cuentasAUsar = cuentas.length > 0 ? cuentas : (
      prov.banco_legacy ? [{
        banco: prov.banco_legacy,
        tipo_cuenta: prov.tipo_cuenta_legacy || '',
        numero_cuenta: prov.cuenta_legacy || '',
        titular_nombre: prov.titular_legacy || '',
        titular_id: prov.id_legacy || '',
        valor_asignado: null,
      }] : []
    );

    // Filas de facturas
    const numFacturas = prov.facturas.map(f => f.numero_factura).join(', ');
    for (const f of prov.facturas) {
      hFacturas.push([
        prov.proveedor_nit,
        prov.proveedor_nombre,
        f.numero_factura,
        f.fecha_factura || '',
        f.fecha_vencimiento || '',
        f.valor_factura || 0,
        f.descuento_pronto_pago || 0,
        f.flete || 0,
        f.valor_final || 0,
      ]);
    }

    // Distribución entre cuentas
    if (cuentasAUsar.length > 0) {
      const distribucion = distribuirEntreCuentas(cuentasAUsar, prov.total);
      for (const c of distribucion) {
        hPagos.push([
          prov.proveedor_nit,
          prov.proveedor_nombre,
          numFacturas,
          prov.total,
          c.banco || '',
          c.tipo_cuenta || '',
          c.numero_cuenta || '',
          c.titular_nombre || '',
          c.titular_id || '',
          c.valor_a_pagar,
          fechaPago || '',
        ]);

        // Registrar en tabla pagos
        db.prepare(`
          INSERT INTO pagos (proveedor_nit, proveedor_nombre, valor_pago,
            banco, cuenta, tipo_cuenta, estado)
          VALUES (?, ?, ?, ?, ?, ?, 'generado')
        `).run(
          prov.proveedor_nit, prov.proveedor_nombre, c.valor_a_pagar,
          c.banco, c.numero_cuenta, c.tipo_cuenta
        );
      }
    } else {
      // Sin datos bancarios
      hPagos.push([
        prov.proveedor_nit,
        prov.proveedor_nombre,
        numFacturas,
        prov.total,
        'SIN DATOS BANCARIOS', '', '', '', '',
        prov.total,
        fechaPago || '',
      ]);
    }

    pagosInsertados.push(prov);
  }

  // Crear workbook
  const wb = XLSX.utils.book_new();

  const wsFacturas = XLSX.utils.aoa_to_sheet(hFacturas);
  wsFacturas["!cols"] = [
    { wch: 15 }, { wch: 35 }, { wch: 18 }, { wch: 14 }, { wch: 14 },
    { wch: 16 }, { wch: 14 }, { wch: 12 }, { wch: 16 }
  ];

  const wsPagos = XLSX.utils.aoa_to_sheet(hPagos);
  wsPagos["!cols"] = [
    { wch: 15 }, { wch: 35 }, { wch: 40 }, { wch: 16 },
    { wch: 20 }, { wch: 14 }, { wch: 22 }, { wch: 30 }, { wch: 20 },
    { wch: 20 }, { wch: 14 }
  ];

  XLSX.utils.book_append_sheet(wb, wsPagos, "Instrucciones de Pago");
  XLSX.utils.book_append_sheet(wb, wsFacturas, "Detalle Facturas");

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").substring(0, 19);
  const filename = `pagos_${timestamp}.xlsx`;
  const filePath = path.join(PAGOS_DIR, filename);
  XLSX.writeFile(wb, filePath);

  // Marcar facturas como procesadas
  db.prepare(`UPDATE facturas SET estado = 'procesado' WHERE estado = 'pendiente'`).run();

  return {
    archivo: filename,
    ruta: filePath,
    total_proveedores: pagosInsertados.length,
    total_facturas: facturas.length,
    total_pagar: pagosInsertados.reduce((s, p) => s + p.total, 0),
    pagos: pagosInsertados.map(p => ({
      proveedor_nit: p.proveedor_nit,
      proveedor_nombre: p.proveedor_nombre,
      total: p.total,
    })),
  };
}

function getPagosHistorial() {
  return db.prepare("SELECT * FROM pagos ORDER BY created_at DESC").all();
}

module.exports = { generarArchivoPagos, getPagosHistorial, PAGOS_DIR };
