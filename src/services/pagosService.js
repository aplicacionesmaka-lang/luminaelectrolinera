const XLSX   = require("xlsx");
const path   = require("path");
const fs     = require("fs");
const db     = require("../models/db");
const { getCuentasPorPagar } = require("./sqlServerService");

const PAGOS_DIR = path.join(__dirname, "../../pagos");
if (!fs.existsSync(PAGOS_DIR)) fs.mkdirSync(PAGOS_DIR, { recursive: true });

/**
 * Busca cuentas bancarias del proveedor por NIT o por nombre (para casos donde
 * el NIT del ERP no coincide con el NIT en SQLite).
 */
function getCuentasProveedor(nitErp, nombreErp) {
  // Helper: convertir fila de proveedores a formato cuentas_bancarias
  const normNit = n => String(n || '').replace(/\D/g, '').replace(/^0+/, '');
  const provToCuenta = (p) => p?.banco ? [{
    proveedor_nit: p.nit, banco: p.banco, tipo_cuenta: p.tipo_cuenta || '',
    numero_cuenta: p.cuenta || '', titular_nombre: p.titular_nombre || '',
    titular_id: p.titular_id || '', valor_asignado: 0, activa: 1, orden: 0,
  }] : [];

  // 1. Buscar en cuentas_bancarias por NIT exacto
  let cuentas = db.prepare(
    "SELECT * FROM cuentas_bancarias WHERE proveedor_nit = ? AND activa = 1 ORDER BY (CASE WHEN banco LIKE '%bancolombia%' THEN 0 ELSE 1 END) ASC, orden ASC"
  ).all(nitErp);
  if (cuentas.length > 0) return cuentas;

  // 2. Buscar en proveedores por NIT exacto
  let prov = db.prepare("SELECT * FROM proveedores WHERE nit = ?").get(nitErp);
  if (prov?.banco) return provToCuenta(prov);

  // 3. Buscar en proveedores por NIT normalizado (sin guiones/puntos)
  const nitNorm = normNit(nitErp);
  if (nitNorm && nitNorm !== nitErp) {
    prov = db.prepare("SELECT * FROM proveedores WHERE REPLACE(REPLACE(nit,'-',''),'.','') = ?").get(nitNorm);
    if (prov?.banco) return provToCuenta(prov);
  }

  // 4. Buscar por coincidencia de nombre
  if (nombreErp) {
    const palabras = nombreErp.trim().split(/\s+/).slice(0, 3);
    for (const palabra of palabras) {
      if (palabra.length < 3) continue;
      // 4a. cuentas_bancarias via nit local
      const provLocal = db.prepare("SELECT * FROM proveedores WHERE nombre LIKE ? LIMIT 1").get(`%${palabra}%`);
      if (provLocal) {
        cuentas = db.prepare(
          "SELECT * FROM cuentas_bancarias WHERE proveedor_nit = ? AND activa = 1 ORDER BY orden ASC"
        ).all(provLocal.nit);
        if (cuentas.length > 0) return cuentas;
        // 4b. datos en tabla proveedores directamente
        if (provLocal.banco) return provToCuenta(provLocal);
      }
    }
  }
  return [];
}

/**
 * Extrae un valor numérico de un texto de nota WA.
 * Ej: "NOTA DESCUENTO: 3% sobre el total" → 0.03 (porcentaje)
 *     "NOTA FLETE: $45.000" → 45000 (valor absoluto)
 *     "no aplica" → null
 */
function extraerValorNota(texto) {
  if (!texto) return null;
  const tl = texto.toLowerCase();
  if (/no aplica|sin flete|0%|no hay|ninguno|n\/a/.test(tl)) return 0;
  // Porcentaje: "3%" → 0.03
  const pctMatch = texto.match(/(\d+(?:[.,]\d+)?)\s*%/);
  if (pctMatch) return parseFloat(pctMatch[1].replace(",", ".")) / 100;
  // Valor en pesos: "$45.000" o "45000" o "45,000"
  const valMatch = texto.match(/\$?\s*([\d]{1,3}(?:[.,\s]\d{3})+|\d{4,})/);
  if (valMatch) return parseInt(valMatch[1].replace(/[.,\s]/g, ""));
  return null;
}

/**
 * Obtiene las notas más recientes del proveedor (descuento/flete/cuentas informadas por WA).
 * Retorna también los valores numéricos extraídos para aplicar al cálculo.
 */
function getNotasProveedor(nitErp, nombreErp) {
  const notas = { descuento: "", flete: "", cuentas: "", descuento_valor: null, flete_valor: null };

  // Buscar por NIT directo y también por NIT local (mismo mecanismo que cuentas)
  const nitsABuscar = [nitErp];
  if (nombreErp) {
    const palabras = nombreErp.trim().split(/\s+/).slice(0, 3);
    for (const palabra of palabras) {
      if (palabra.length < 3) continue;
      const provLocal = db.prepare(
        "SELECT nit FROM proveedores WHERE nombre LIKE ? LIMIT 1"
      ).get(`%${palabra}%`);
      if (provLocal && !nitsABuscar.includes(provLocal.nit)) {
        nitsABuscar.push(provLocal.nit);
      }
    }
  }

  for (const nit of nitsABuscar) {
    const nd = db.prepare(
      "SELECT respuesta FROM conversaciones WHERE proveedor_nit=? AND estado='nota_descuento' ORDER BY created_at DESC LIMIT 1"
    ).get(nit);
    const nf = db.prepare(
      "SELECT respuesta FROM conversaciones WHERE proveedor_nit=? AND estado='nota_flete' ORDER BY created_at DESC LIMIT 1"
    ).get(nit);
    const nc = db.prepare(
      "SELECT respuesta FROM conversaciones WHERE proveedor_nit=? AND estado='nota_cuentas' ORDER BY created_at DESC LIMIT 1"
    ).get(nit);
    if (nd) {
      notas.descuento = nd.respuesta.replace("NOTA DESCUENTO: ", "");
      notas.descuento_valor = extraerValorNota(notas.descuento);
    }
    if (nf) {
      notas.flete = nf.respuesta.replace("NOTA FLETE: ", "");
      notas.flete_valor = extraerValorNota(notas.flete);
    }
    if (nc) notas.cuentas = nc.respuesta.replace("NOTA CUENTAS: ", "");
    if (notas.descuento || notas.flete || notas.cuentas) break;
  }
  return notas;
}

/**
 * Distribuye el total entre cuentas bancarias.
 * Si valor_asignado > 0, lo usa; el saldo va a la primera sin asignar.
 */
function distribuirEntreCuentas(cuentas, total) {
  if (!cuentas || cuentas.length === 0) return [];
  const res = cuentas.map(c => ({ ...c, valor_a_pagar: 0 }));
  let asignado = 0;
  for (const c of res) {
    if (c.valor_asignado > 0) {
      c.valor_a_pagar = Math.min(c.valor_asignado, total - asignado);
      asignado += c.valor_a_pagar;
    }
  }
  const saldo = total - asignado;
  if (saldo > 0.01) {
    const libre = res.find(c => !c.valor_asignado || c.valor_asignado === 0);
    if (libre) libre.valor_a_pagar = saldo;
    else res[res.length - 1].valor_a_pagar += saldo;
  }
  return res.filter(c => c.valor_a_pagar > 0.01);
}

/**
 * Genera el archivo Excel de pagos — UNA FILA POR FACTURA con datos bancarios y notas.
 * Solo incluye facturas marcadas con incluir_pago=1 en la pestaña Vencimientos.
 * No requiere fechas: usa exactamente lo que está seleccionado.
 */
async function generarArchivoPagos(fechaPago = null, vencimientoHasta = null) {
  // Obtener solo los idreg marcados para pago
  const ajustes = db.prepare("SELECT idreg FROM facturas_erp_ajustes WHERE incluir_pago = 1").all();
  const idregsSeleccionados = new Set(ajustes.map(a => String(a.idreg)));

  if (idregsSeleccionados.size === 0) {
    throw new Error("No hay facturas seleccionadas para pago. Márcalas en la pestaña Vencimientos.");
  }

  // Traer solo esas facturas del ERP (sin filtro de fecha)
  const erpRows = await getCuentasPorPagar({});
  if (!erpRows || erpRows.length === 0) {
    throw new Error("No se pudo consultar el ERP.");
  }

  const filas = erpRows.filter(f => idregsSeleccionados.has(String(f.idreg)));

  if (filas.length === 0) {
    throw new Error("Las facturas seleccionadas no se encontraron en el ERP. Actualiza Vencimientos.");
  }

  // Traer ajustes locales (descuento y flete por factura) y proveedores para descuento %
  const ajustesRows = db.prepare("SELECT idreg, flete FROM facturas_erp_ajustes").all();
  const ajMap = {};
  ajustesRows.forEach(a => { ajMap[String(a.idreg)] = a; });

  const provRows = db.prepare("SELECT nit, descuento_cacharro, descuento_joyeria, descuento_activo FROM proveedores").all();
  const provDescMap = {};
  provRows.forEach(p => { provDescMap[p.nit] = p; });

  // Calcular valor_final por factura = saldo - flete - descuento
  // Prioridad: valor WA del proveedor > ajuste manual > catálogo %
  function calcValorFinal(f, notas) {
    const saldo = Number(f.saldo_pendiente) || 0;
    const aj = ajMap[String(f.idreg)] || {};
    const prov = provDescMap[f.nit] || {};

    // Flete: WA > ajuste manual > 0
    let flete = 0;
    if (notas?.flete_valor != null) {
      // Si es porcentaje, aplicar sobre saldo
      flete = notas.flete_valor < 1 ? Math.round(saldo * notas.flete_valor) : notas.flete_valor;
    } else if (aj.flete != null) {
      flete = Number(aj.flete);
    }

    // Descuento: WA > catálogo %
    let descuento = 0;
    if (notas?.descuento_valor != null) {
      descuento = notas.descuento_valor < 1 ? Math.round(saldo * notas.descuento_valor) : notas.descuento_valor;
    } else {
      const tipo = prov.descuento_activo || 'cacharro';
      const pct  = tipo === 'joyeria' ? (prov.descuento_joyeria || 0) : (prov.descuento_cacharro || 0);
      descuento  = Math.round(saldo * pct);
    }

    const fuenteDescuento = notas?.descuento_valor != null ? "WA" : "catálogo";
    const fuenteFlete     = notas?.flete_valor != null ? "WA" : "manual";
    return { saldo, flete, descuento, valorFinal: Math.max(0, saldo - flete - descuento), fuenteDescuento, fuenteFlete };
  }

  // Agrupar por proveedor usando valor_final como base del total
  // Pre-calcular notas por proveedor para usar en el cálculo
  const notasCache = {};
  const porProveedor = {};
  for (const f of filas) {
    if (!notasCache[f.nit]) notasCache[f.nit] = getNotasProveedor(f.nit, f.proveedor_nombre);
    const notas = notasCache[f.nit];
    if (!porProveedor[f.nit]) {
      porProveedor[f.nit] = { nombre: f.proveedor_nombre, total: 0, facturas: [], notas };
    }
    const calc = calcValorFinal(f, notas);
    porProveedor[f.nit].total += calc.valorFinal;
    porProveedor[f.nit].facturas.push(f);
  }

  // Encabezado: una fila por factura con todos los datos
  const headers = [
    "NIT Proveedor", "Proveedor", "Tienda", "N° Factura",
    "Fecha Factura", "Fecha Vencimiento", "Días para Vencer",
    "Saldo Pendiente ERP", "Descuento Aplicado", "Fuente Descuento", "Flete (descuento)", "Fuente Flete", "Valor Final a Pagar",
    "Banco", "Tipo Cuenta", "N° Cuenta", "Titular Cuenta", "Cédula/NIT Titular",
    "Valor a Transferir", "Fecha Pago",
    "Nota Descuento Proveedor (WA)", "Nota Flete Proveedor (WA)", "Nota Cuentas (WA)"
  ];

  const filasPagos = [headers];
  const pagosInsertados = [];
  let sinBancoCount = 0;

  for (const [nit, prov] of Object.entries(porProveedor)) {
    const cuentas     = getCuentasProveedor(nit, prov.nombre);
    const notas       = prov.notas; // ya calculado en el loop anterior
    const distribucion = cuentas.length > 0
      ? distribuirEntreCuentas(cuentas, prov.total)
      : [];

    // Calcular cuánto corresponde a cada factura en proporción al total (para múltiples cuentas)
    // Si hay 1 cuenta o ninguna, toda la factura va a esa cuenta
    // Si hay 2+ cuentas con valor_asignado, se respeta; resto proporcional

    for (const f of prov.facturas) {
      const { saldo, flete, descuento, valorFinal, fuenteDescuento, fuenteFlete } = calcValorFinal(f, notas);
      const venc    = f.fecha_vencimiento ? String(f.fecha_vencimiento).slice(0, 10) : "";
      const fecFac  = f.fecha_factura     ? String(f.fecha_factura).slice(0, 10)     : "";
      const numFac  = (f.factura_completa || f.numero_factura || "").trim();
      const hoy     = fechaPago || new Date().toISOString().slice(0, 10);

      if (distribucion.length === 0) {
        // Sin datos bancarios — incluir con anotación para que tesorería gestione
        sinBancoCount++;
        filasPagos.push([
          nit, prov.nombre, f.tienda_nombre || "", numFac,
          fecFac, venc, f.dias_para_vencer ?? "",
          saldo, descuento, fuenteDescuento, flete, fuenteFlete, valorFinal,
          "⚠️ SIN DATOS BANCARIOS", "", "", "", "",
          valorFinal, hoy,
          notas.descuento || "", notas.flete || "", notas.cuentas || "⏳ Pendiente captura de cuenta bancaria vía WhatsApp",
        ]);
      } else if (distribucion.length === 1) {
        const c = distribucion[0];
        filasPagos.push([
          nit, prov.nombre, f.tienda_nombre || "", numFac,
          fecFac, venc, f.dias_para_vencer ?? "",
          saldo, descuento, fuenteDescuento, flete, fuenteFlete, valorFinal,
          c.banco, c.tipo_cuenta, c.numero_cuenta, c.titular_nombre, c.titular_id,
          valorFinal, hoy,
          notas.descuento || "", notas.flete || "", notas.cuentas || "",
        ]);
      } else {
        // 2+ cuentas: solo agregar fila de factura sin cuenta (se agrega por cuenta abajo)
        filasPagos.push([
          nit, prov.nombre, f.tienda_nombre || "", numFac,
          fecFac, venc, f.dias_para_vencer ?? "",
          saldo, descuento, fuenteDescuento, flete, fuenteFlete, valorFinal,
          "→ ver distribución abajo", "", "", "", "",
          "", hoy,
          notas.descuento || "", notas.flete || "", notas.cuentas || "",
        ]);
      }
    }

    // 2+ cuentas: agregar UNA FILA POR CUENTA con valor asignado total
    if (distribucion.length > 1) {
      const distribucionOrdenada = [...distribucion].sort((a, b) => {
        const esBA = /bancolombia/i.test(a.banco || "");
        const esBB = /bancolombia/i.test(b.banco || "");
        return esBB - esBA;
      });
      const todasFacturas = prov.facturas.map(f => (f.factura_completa || f.numero_factura || "").trim()).join(", ");
      for (const c of distribucionOrdenada) {
        filasPagos.push([
          nit, prov.nombre, "", `PAGAR → ${todasFacturas}`,
          "", "", "",
          "", "", "", "", "", "",
          c.banco, c.tipo_cuenta, c.numero_cuenta, c.titular_nombre, c.titular_id,
          c.valor_a_pagar, new Date().toISOString().slice(0, 10),
          notas.descuento || "", notas.flete || "", notas.cuentas || "",
        ]);
      }
    }

    // Registrar en historial de pagos
    if (cuentas.length > 0) {
      for (const c of distribucion) {
        db.prepare(`INSERT INTO pagos (proveedor_nit, proveedor_nombre, valor_pago, banco, cuenta, tipo_cuenta, estado)
          VALUES (?, ?, ?, ?, ?, ?, 'generado')`
        ).run(nit, prov.nombre, c.valor_a_pagar, c.banco, c.numero_cuenta, c.tipo_cuenta);
      }
    }
    pagosInsertados.push({ nit, nombre: prov.nombre, total: prov.total });
  }

  // Crear Excel
  if (filasPagos.length <= 1) {
    throw new Error("No se generaron filas de pago. Verifica que las facturas estén seleccionadas en Vencimientos.");
  }

  const wb  = XLSX.utils.book_new();
  const ws  = XLSX.utils.aoa_to_sheet(filasPagos);
  ws["!cols"] = [
    { wch: 16 }, { wch: 32 }, { wch: 22 }, { wch: 18 },
    { wch: 13 }, { wch: 13 }, { wch: 8  },
    { wch: 15 }, { wch: 14 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 14 },
    { wch: 20 }, { wch: 12 }, { wch: 22 }, { wch: 28 }, { wch: 18 },
    { wch: 18 }, { wch: 13 },
    { wch: 40 }, { wch: 40 }, { wch: 40 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, "Pagos");

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").substring(0, 19);
  const filename  = `pagos_${timestamp}.xlsx`;
  XLSX.writeFile(wb, path.join(PAGOS_DIR, filename));

  return {
    archivo: filename,
    total_proveedores: pagosInsertados.length,
    total_facturas: filas.length,
    total_pagar: pagosInsertados.reduce((s, p) => s + p.total, 0),
    sin_banco: sinBancoCount,
    pagos: pagosInsertados,
  };
}

function getPagosHistorial() {
  return db.prepare("SELECT * FROM pagos ORDER BY created_at DESC").all();
}

module.exports = { generarArchivoPagos, getPagosHistorial, PAGOS_DIR };
