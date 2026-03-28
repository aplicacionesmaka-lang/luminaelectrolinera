require("dotenv").config();
const sql = require("mssql");

let pool = null;

function getConfig() {
  return {
    user:     process.env.SQLSERVER_USER     || "js",
    password: process.env.SQLSERVER_PASSWORD || "JustR34d#",
    server:   process.env.SQLSERVER_HOST     || "localhost",
    port:     parseInt(process.env.SQLSERVER_PORT || "2987"),
    database: process.env.SQLSERVER_DB       || "BD_SEG_QCUTE",
    options:  { encrypt: false, trustServerCertificate: true },
    pool:     { max: 5, min: 0, idleTimeoutMillis: 30000 },
  };
}

async function getPool() {
  if (!pool) pool = await sql.connect(getConfig());
  return pool;
}

/**
 * Obtiene todas las facturas pendientes de pago del ERP
 */
async function getCuentasPorPagar({ soloVencidas = false, nit = null } = {}) {
  const db = await getPool();

  let where = "(f.ValNeto - f.ValAbo) > 0 AND f.estado = ''";
  if (soloVencidas) where += " AND f.fecven < GETDATE()";
  if (nit)          where += ` AND f.Codter = '${nit.replace(/'/g, "''")}'`;

  const result = await db.request().query(`
    SELECT
      f.idreg,
      f.numfac                          AS numero_factura,
      f.NumRad                          AS radicado,
      ISNULL(f.Prefijo,'') + ' ' + f.numfac AS factura_completa,
      f.Codter                          AS nit,
      ISNULL(t.nombre_com, t.nombre_1)  AS proveedor_nombre,
      ISNULL(t.celular_1,'')            AS celular,
      ISNULL(t.telefono_1,'')           AS telefono,
      CONVERT(DATE, f.fecfac)           AS fecha_factura,
      CONVERT(DATE, f.fecven)           AS fecha_vencimiento,
      f.valfac                          AS valor_bruto,
      f.valdes                          AS descuento,
      f.valret                          AS retencion,
      f.valiva                          AS iva,
      f.ValNeto                         AS valor_neto,
      f.ValAbo                          AS valor_abonado,
      (f.ValNeto - f.ValAbo)            AS saldo_pendiente,
      DATEDIFF(DAY, GETDATE(), f.fecven) AS dias_para_vencer,
      f.estado
    FROM CxP_Facturas f
    LEFT JOIN Cnt_Terceros t ON f.Codter = t.Codter
    WHERE ${where}
    ORDER BY f.fecven ASC
  `);

  return result.recordset;
}

/**
 * Resumen de CxP agrupado por proveedor
 */
async function getResumenCxP() {
  const db = await getPool();
  const result = await db.request().query(`
    SELECT
      f.Codter                          AS nit,
      ISNULL(t.nombre_com, t.nombre_1)  AS proveedor_nombre,
      ISNULL(t.celular_1,'')            AS celular,
      COUNT(*)                          AS total_facturas,
      SUM(f.ValNeto - f.ValAbo)         AS total_pendiente,
      MIN(CONVERT(DATE, f.fecven))      AS proxima_vencimiento,
      SUM(CASE WHEN f.fecven < GETDATE() THEN (f.ValNeto - f.ValAbo) ELSE 0 END) AS total_vencido
    FROM CxP_Facturas f
    LEFT JOIN Cnt_Terceros t ON f.Codter = t.Codter
    WHERE (f.ValNeto - f.ValAbo) > 0 AND f.estado = ''
    GROUP BY f.Codter, t.nombre_com, t.nombre_1, t.celular_1
    ORDER BY total_pendiente DESC
  `);
  return result.recordset;
}

/**
 * Busca facturas de un proveedor por nombre (para el bot de WhatsApp)
 */
async function buscarFacturasProveedor(nombreONit) {
  const db = await getPool();
  const term = nombreONit.replace(/'/g, "''");
  const result = await db.request().query(`
    SELECT
      f.numfac AS numero_factura,
      ISNULL(f.Prefijo,'') + ' ' + f.numfac AS factura_completa,
      f.Codter AS nit,
      ISNULL(t.nombre_com, t.nombre_1) AS proveedor_nombre,
      CONVERT(DATE, f.fecfac) AS fecha_factura,
      CONVERT(DATE, f.fecven) AS fecha_vencimiento,
      f.ValNeto AS valor_neto,
      f.ValAbo  AS valor_abonado,
      (f.ValNeto - f.ValAbo) AS saldo_pendiente,
      DATEDIFF(DAY, GETDATE(), f.fecven) AS dias_para_vencer
    FROM CxP_Facturas f
    LEFT JOIN Cnt_Terceros t ON f.Codter = t.Codter
    WHERE (f.ValNeto - f.ValAbo) > 0 AND f.estado = ''
      AND (
        t.nombre_com LIKE '%${term}%'
        OR t.nombre_1 LIKE '%${term}%'
        OR f.Codter LIKE '%${term}%'
        OR f.numfac LIKE '%${term}%'
      )
    ORDER BY f.fecven ASC
  `);
  return result.recordset;
}

module.exports = { getCuentasPorPagar, getResumenCxP, buscarFacturasProveedor };
