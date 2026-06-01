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
 * Dashboard de inventario por tienda.
 * - Entradas: traslados (_ET) y compras/contado (_EC)
 * - Ventas: _FV (cankar positivo = unidades vendidas)
 * - Ordenado por saldo ascendente (menos stock primero)
 */
async function getDashboardInventario({ codalm = null, diasAtras = 60 } = {}) {
  const db = await getPool();

  const tiendasFiltro = codalm
    ? `= '${codalm.replace(/'/g, "''")}'`
    : `IN ('002','009','010')`;

  const query = `
    WITH entradas AS (
      SELECT
        k.Codalm,
        k.codins,
        CONVERT(DATE, k.feckar) AS fecha_entrada,
        k.tipkar,
        SUM(k.cankar) AS cant_entrada
      FROM Alm_Kardex k
      WHERE k.tipkar IN ('_ET', '_EC')
        AND k.Codalm ${tiendasFiltro}
        AND k.feckar >= DATEADD(DAY, -${diasAtras}, GETDATE())
        AND k.estado = ''
      GROUP BY k.Codalm, k.codins, CONVERT(DATE, k.feckar), k.tipkar
    )
    SELECT
      e.Codalm                                AS codalm,
      g.nombrecomercial                       AS tienda,
      e.codins                                AS codigo,
      LTRIM(RTRIM(ins.Nomins))               AS nombre_producto,
      ISNULL(LTRIM(RTRIM(ISNULL(t.nombre_com, t.nombre_1))), 'Sin proveedor') AS proveedor,
      e.fecha_entrada,
      CASE e.tipkar
        WHEN '_ET' THEN 'Traslado'
        WHEN '_EC' THEN 'Compra/Contado'
        ELSE e.tipkar
      END                                     AS tipo_entrada,
      e.cant_entrada,
      ISNULL(inv.Caninv, 0)                  AS stock_actual,
      -- Ventas totales desde la fecha de entrada hasta hoy
      ISNULL((
        SELECT SUM(k2.cankar)
        FROM Alm_Kardex k2
        WHERE k2.Codalm = e.Codalm AND k2.codins = e.codins
          AND k2.tipkar = '_FV'
          AND CONVERT(DATE, k2.feckar) >= e.fecha_entrada
      ), 0)                                   AS ventas_total,
      -- Ventas acumuladas por período (cankar FV es positivo)
      ISNULL((
        SELECT SUM(k2.cankar) FROM Alm_Kardex k2
        WHERE k2.Codalm=e.Codalm AND k2.codins=e.codins AND k2.tipkar='_FV'
          AND CONVERT(DATE,k2.feckar) >= e.fecha_entrada
          AND k2.feckar < DATEADD(DAY,5,  CAST(e.fecha_entrada AS DATETIME))
      ), 0) AS ventas_d5,
      ISNULL((
        SELECT SUM(k2.cankar) FROM Alm_Kardex k2
        WHERE k2.Codalm=e.Codalm AND k2.codins=e.codins AND k2.tipkar='_FV'
          AND CONVERT(DATE,k2.feckar) >= e.fecha_entrada
          AND k2.feckar < DATEADD(DAY,10, CAST(e.fecha_entrada AS DATETIME))
      ), 0) AS ventas_d10,
      ISNULL((
        SELECT SUM(k2.cankar) FROM Alm_Kardex k2
        WHERE k2.Codalm=e.Codalm AND k2.codins=e.codins AND k2.tipkar='_FV'
          AND CONVERT(DATE,k2.feckar) >= e.fecha_entrada
          AND k2.feckar < DATEADD(DAY,15, CAST(e.fecha_entrada AS DATETIME))
      ), 0) AS ventas_d15,
      ISNULL((
        SELECT SUM(k2.cankar) FROM Alm_Kardex k2
        WHERE k2.Codalm=e.Codalm AND k2.codins=e.codins AND k2.tipkar='_FV'
          AND CONVERT(DATE,k2.feckar) >= e.fecha_entrada
          AND k2.feckar < DATEADD(DAY,20, CAST(e.fecha_entrada AS DATETIME))
      ), 0) AS ventas_d20,
      ISNULL((
        SELECT SUM(k2.cankar) FROM Alm_Kardex k2
        WHERE k2.Codalm=e.Codalm AND k2.codins=e.codins AND k2.tipkar='_FV'
          AND CONVERT(DATE,k2.feckar) >= e.fecha_entrada
          AND k2.feckar < DATEADD(DAY,25, CAST(e.fecha_entrada AS DATETIME))
      ), 0) AS ventas_d25,
      ISNULL((
        SELECT SUM(k2.cankar) FROM Alm_Kardex k2
        WHERE k2.Codalm=e.Codalm AND k2.codins=e.codins AND k2.tipkar='_FV'
          AND CONVERT(DATE,k2.feckar) >= e.fecha_entrada
          AND k2.feckar < DATEADD(DAY,30, CAST(e.fecha_entrada AS DATETIME))
      ), 0) AS ventas_d30
    FROM entradas e
    LEFT JOIN Gen_Almacenes g   ON g.codalm = e.Codalm
    LEFT JOIN Alm_Insumos   ins ON ins.Codins = e.codins
    LEFT JOIN Cnt_Terceros  t   ON t.Codter = ins.nitpro
    LEFT JOIN Alm_Invent    inv ON inv.Codalm = e.Codalm AND inv.Codins = e.codins
    ORDER BY e.Codalm, ISNULL(inv.Caninv, 0) ASC, e.fecha_entrada DESC
  `;

  const result = await db.request().query(query);

  return result.recordset.map(row => {
    const ent = parseFloat(row.cant_entrada) || 1;
    const pct = (v) => Math.min(100, Math.round((parseFloat(v) / ent) * 100));
    return {
      ...row,
      pct_d5:  pct(row.ventas_d5),
      pct_d10: pct(row.ventas_d10),
      pct_d15: pct(row.ventas_d15),
      pct_d20: pct(row.ventas_d20),
      pct_d25: pct(row.ventas_d25),
      pct_d30: pct(row.ventas_d30),
      saldo:   parseFloat(row.cant_entrada) - parseFloat(row.ventas_total),
    };
  });
}

/**
 * Detalle de movimientos de un artículo en una tienda (para reporte)
 */
async function getDetalleArticulo({ codalm, codins, diasAtras = 60 }) {
  const db = await getPool();
  const result = await db.request().query(`
    SELECT
      k.tipkar,
      CASE k.tipkar
        WHEN '_FV'  THEN 'Venta'
        WHEN '_ET'  THEN 'Traslado Entrada'
        WHEN '_EC'  THEN 'Compra/Contado'
        WHEN '_ST'  THEN 'Traslado Salida'
        WHEN '_AS'  THEN 'Ajuste Salida'
        WHEN '_AE'  THEN 'Ajuste Entrada'
        ELSE k.tipkar
      END                                      AS tipo_movimiento,
      CONVERT(DATE, k.feckar)                  AS fecha,
      k.cankar                                 AS cantidad,
      k.dockar                                 AS documento,
      ISNULL(k.observa, '')                    AS observacion,
      LTRIM(RTRIM(ins.Nomins))                AS producto,
      ISNULL(LTRIM(RTRIM(ISNULL(t.nombre_com, t.nombre_1))), '') AS proveedor,
      g.nombrecomercial                        AS tienda
    FROM Alm_Kardex k
    LEFT JOIN Alm_Insumos  ins ON ins.Codins = k.codins
    LEFT JOIN Cnt_Terceros t   ON t.Codter = ins.nitpro
    LEFT JOIN Gen_Almacenes g  ON g.codalm = k.Codalm
    WHERE k.Codalm = '${codalm.replace(/'/g, "''")}'
      AND k.codins = '${codins.replace(/'/g, "''")}'
      AND k.feckar >= DATEADD(DAY, -${diasAtras}, GETDATE())
    ORDER BY k.feckar ASC
  `);
  return result.recordset;
}

async function getTiendas() {
  const db = await getPool();
  const result = await db.request().query(`
    SELECT codalm, nombrecomercial AS nombre
    FROM Gen_Almacenes
    WHERE codalm IN ('002','009','010')
    ORDER BY orden
  `);
  return result.recordset;
}

module.exports = { getDashboardInventario, getDetalleArticulo, getTiendas };
