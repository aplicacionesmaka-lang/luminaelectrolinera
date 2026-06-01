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
async function getCuentasPorPagar({ soloVencidas = false, nit = null, hasta = null } = {}) {
  const db = await getPool();

  let where = "(f.ValNeto - f.ValAbo) > 0 AND f.estado = ''";
  if (soloVencidas) where += " AND f.fecven < GETDATE()";
  if (hasta)        where += ` AND CONVERT(DATE, f.fecven) <= '${hasta}'`;
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
      f.estado,
      f.Codalm                            AS codalm,
      ISNULL(g.nombrecomercial, f.Codalm) AS tienda_nombre
    FROM CxP_Facturas f
    LEFT JOIN Cnt_Terceros  t ON f.Codter  = t.Codter
    LEFT JOIN Gen_Almacenes g ON g.codalm  = f.Codalm
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
      DATEDIFF(DAY, GETDATE(), f.fecven) AS dias_para_vencer,
      f.Codalm AS codalm,
      ISNULL(g.nombrecomercial, f.Codalm) AS tienda_nombre
    FROM CxP_Facturas f
    LEFT JOIN Cnt_Terceros t ON f.Codter = t.Codter
    LEFT JOIN Gen_Almacenes g ON g.codalm = f.Codalm
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

/**
 * Reporte de ventas por tienda y período — usa ValNeto (incluye IVA, igual al ERP)
 */
async function getReporteVentas({ desde, hasta, codalm = null, agrupacion = 'dia' } = {}) {
  const db = await getPool();

  const almFiltro = codalm ? `AND f.codalm = '${codalm.replace(/'/g,"''")}'` : `AND f.codalm IN ('002','009','010')`;

  let periodoExpr;
  if (agrupacion === 'mes') {
    periodoExpr = `FORMAT(f.fecfac, 'yyyy-MM')`;
  } else if (agrupacion === 'periodo') {
    periodoExpr = `CONVERT(VARCHAR(7), f.fecfac, 120)`;
  } else {
    periodoExpr = `CONVERT(DATE, f.fecfac)`;
  }

  const result = await db.request().query(`
    SELECT
      f.codalm,
      ISNULL(g.nombrecomercial, f.codalm)  AS tienda,
      ${periodoExpr}                        AS periodo,
      COUNT(*)                              AS num_facturas,
      SUM(f.ValNeto)                        AS ventas,
      SUM(f.valcosto)                       AS costo,
      SUM(f.ValNeto) - SUM(f.valcosto)      AS margen,
      SUM(f.Fp_Efectivo)                    AS fp_efectivo,
      SUM(f.Fp_Td)                          AS fp_td,
      SUM(f.Fp_Tc)                          AS fp_tc,
      SUM(f.Fp_Tr)                          AS fp_tr,
      SUM(f.Fp_CR)                          AS fp_cr
    FROM Ven_Facturas f
    LEFT JOIN Gen_Almacenes g ON g.codalm = f.codalm
    WHERE f.tipfac IN ('_FV','_DV')
      AND f.estado = ''
      AND CONVERT(DATE, f.fecfac) BETWEEN '${desde}' AND '${hasta}'
      ${almFiltro}
    GROUP BY f.codalm, g.nombrecomercial, ${periodoExpr}
    ORDER BY f.codalm, ${periodoExpr}
  `);

  return result.recordset.map(r => ({
    ...r,
    ventas:   parseFloat(r.ventas)   || 0,
    costo:    parseFloat(r.costo)    || 0,
    margen:   parseFloat(r.margen)   || 0,
    pct_margen: r.ventas > 0 ? Math.round(((parseFloat(r.margen)||0) / parseFloat(r.ventas)) * 100) : 0,
  }));
}

/**
 * Estado de Pérdidas y Ganancias — basado en Cnt_Comprobantes (cuentas PUC)
 */
async function getPyG({ desde, hasta } = {}) {
  const db = await getPool();
  const d = desde.replace(/'/g,"''");
  const h = hasta.replace(/'/g,"''");

  const res = await db.request().query(`
    SELECT
      ISNULL(c.codcos,'') AS codcos,
      c.CodCue,
      SUM(c.Debito)   AS debito,
      SUM(c.Credito)  AS credito
    FROM Cnt_Comprobantes c
    WHERE (c.CodCue LIKE '4%' OR c.CodCue LIKE '5%' OR c.CodCue LIKE '6135%')
      AND CONVERT(DATE, c.fecdoc) BETWEEN '${d}' AND '${h}'
      AND ISNULL(c.estdoc,'') != 'A'
    GROUP BY c.codcos, c.CodCue
  `);

  const data = {};
  for (const r of res.recordset) {
    const cc  = r.codcos || 'CORP';
    const cue = (r.CodCue || '').trim();
    const deb = parseFloat(r.debito)  || 0;
    const crd = parseFloat(r.credito) || 0;
    if (!data[cc]) data[cc] = {};
    const nat4 = cue.startsWith('4');
    data[cc][cue] = (data[cc][cue] || 0) + (nat4 ? crd - deb : deb - crd);
  }

  const GRUPOS_GASTO = [
    { id:'arrendamientos', label:'1. Arrendamientos y Admon PH', cuentas: ['61352005','61352035','51201001'] },
    { id:'personal',       label:'2. Personal Indirecto',        cuentas: ['51058501','61351512','61352505','61352520'] },
    { id:'aseo',           label:'3. Aseo y Vigilancia',         cuentas: ['51350501','61352525'] },
    { id:'energia',        label:'4. Energía Eléctrica',         cuentas: ['51353001','61353530'] },
    { id:'internet',       label:'5. Internet y Celulares',      cuentas: ['51354502','61353535','61353536'] },
    { id:'agua',           label:'6. Agua y Gas',                cuentas: ['51352501','51355501','61353525'] },
    { id:'transporte',     label:'7. Transporte y Fletes',       cuentas: ['51355001','61353550'] },
    { id:'honorarios',     label:'8. Honorarios',                cuentas: ['5110','51356005','51602001'] },
    { id:'personal_adm',   label:'   Personal Administrativo',   cuentas: ['5105'] },
    { id:'gastos_leg',     label:'9. Gastos Legales',            cuentas: ['5215','52150501'] },
    { id:'gastos_div',     label:'10. Gastos Diversos',          tipo: 'gastos_div' },
    { id:'gastos_fin',     label:'Gastos Financieros',           tipo: 'gastos_fin' },
  ];

  const PREFIJOS_ASIGNADOS = [
    '61352005','61352035','51201001',
    '51058501','61351512','61352505','61352520',
    '51350501','61352525',
    '51353001','61353530',
    '51354502','61353535','61353536',
    '51352501','51355501','61353525',
    '51355001','61353550',
    '5110','51356005','51602001',
    '5105',
    '5215','52150501',
    '61350501',
  ];

  function sumar(ccData, grupo) {
    if (!ccData) return 0;
    let total = 0;
    if (grupo.tipo === 'gastos_fin') {
      for (const [k, v] of Object.entries(ccData)) { if (k.startsWith('53')) total += v; }
      return total;
    }
    if (grupo.tipo === 'gastos_div') {
      for (const [k, v] of Object.entries(ccData)) {
        const es5    = k.startsWith('5') && !k.startsWith('53');
        const es6135 = k.startsWith('6135') && !k.startsWith('61350501');
        if (!es5 && !es6135) continue;
        if (!PREFIJOS_ASIGNADOS.some(p => k.startsWith(p))) total += v;
      }
      return total;
    }
    if (grupo.cuentas) {
      for (const cue of grupo.cuentas)
        for (const [k, v] of Object.entries(ccData))
          if (k.startsWith(cue)) total += v;
    }
    return total;
  }

  function sumIngresos(ccData) {
    if (!ccData) return 0;
    return Object.entries(ccData).filter(([k]) => k.startsWith('4')).reduce((s,[,v]) => s+v, 0);
  }
  function sumCosto(ccData) {
    if (!ccData) return 0;
    return Object.entries(ccData).filter(([k]) => k.startsWith('61350501')).reduce((s,[,v]) => s+v, 0);
  }

  const ENTIDADES = [
    { id:'adm_arre',  label:'ADM Arrecifes',  codcos:['001'],      ventas:false },
    { id:'pto_arre',  label:'PTO Arrecifes',  codcos:['002'],      ventas:true  },
    { id:'adm_la30',  label:'ADM La 30',       codcos:['005'],      ventas:false },
    { id:'pto_la30',  label:'PTO La 30',       codcos:['009'],      ventas:true  },
    { id:'adm_plaza', label:'ADM Plaza Sol',   codcos:['006'],      ventas:false },
    { id:'pto_plaza', label:'PTO Plaza Sol',   codcos:['010'],      ventas:true  },
    { id:'corp',      label:'Corporativo',     codcos:['CORP','003','004','007','008','011','012'], ventas:false },
  ];

  const KNOWN_CC = new Set(ENTIDADES.flatMap(e => e.codcos));
  const unknownCC = Object.keys(data).filter(cc => !KNOWN_CC.has(cc));
  if (unknownCC.length) ENTIDADES.find(e => e.id === 'corp').codcos.push(...unknownCC);

  const resultado = {};
  for (const ent of ENTIDADES) {
    const merged = {};
    for (const cc of ent.codcos)
      for (const [cue, val] of Object.entries(data[cc] || {}))
        merged[cue] = (merged[cue] || 0) + val;

    const ingresos   = ent.ventas ? sumIngresos(merged) : 0;
    const costo_merc = sumCosto(merged);
    const util_bruta = ingresos - costo_merc;
    const grupos = {};
    let total_gastos = 0;
    for (const g of GRUPOS_GASTO) {
      const v = sumar(merged, g);
      grupos[g.id] = v;
      total_gastos += v;
    }
    const util_neta = util_bruta - total_gastos;
    resultado[ent.id] = {
      label: ent.label,
      ingresos, costo_merc, util_bruta, grupos, total_gastos, util_neta,
      mg_bruto: ingresos > 0 ? Math.round((util_bruta/ingresos)*100) : null,
      mg_neto:  ingresos > 0 ? Math.round((util_neta /ingresos)*100) : null,
    };
  }

  const ents = Object.values(resultado);
  const sumE = f => ents.reduce((s,e) => s+(f(e)||0), 0);
  const ingCons = sumE(e=>e.ingresos), cstCons = sumE(e=>e.costo_merc);
  const gruposCons = {};
  for (const g of GRUPOS_GASTO) gruposCons[g.id] = sumE(e=>e.grupos[g.id]);
  const tgCons = Object.values(gruposCons).reduce((s,v)=>s+v,0);
  const ubCons = ingCons - cstCons, unCons = ubCons - tgCons;
  resultado.cons = {
    label:'CONSOLIDADO', ingresos:ingCons, costo_merc:cstCons, util_bruta:ubCons,
    grupos:gruposCons, total_gastos:tgCons, util_neta:unCons,
    mg_bruto: ingCons>0 ? Math.round((ubCons/ingCons)*100) : null,
    mg_neto:  ingCons>0 ? Math.round((unCons/ingCons)*100) : null,
  };

  return { entidades: resultado, grupos: GRUPOS_GASTO.map(g=>({id:g.id,label:g.label})), periodo:{desde,hasta} };
}

module.exports = { getCuentasPorPagar, getResumenCxP, buscarFacturasProveedor, getReporteVentas, getPyG };
