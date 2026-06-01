const express = require("express");
const router = express.Router();
const multer = require("multer");
const { validateExcelFile } = require("../utils/excelValidator");
const {
  procesarFacturasExcel,
  getFacturasPendientes,
  getFacturasAgrupadas,
} = require("../services/facturasService");
const { analizarImagenProveedor } = require("../services/claudeService");
const db = require("../models/db");
const { getCuentasPorPagar, getResumenCxP } = require("../services/sqlServerService");
const { guardarSoporte } = require("../services/soportesService");

const upload = multer({ storage: multer.memoryStorage() });

// POST /facturas/upload
router.post("/upload", upload.single("archivo"), (req, res) => {
  try {
    const validation = validateExcelFile(req.file);
    if (!validation.valid) return res.status(400).json({ error: validation.error });
    // Borrar todas las facturas pendientes antes de cargar el nuevo archivo
    const eliminadas = db.prepare("DELETE FROM facturas WHERE estado = 'pendiente'").run();
    const resultado = procesarFacturasExcel(req.file.buffer);
    res.json({
      mensaje: `Se procesaron ${resultado.total_procesadas} facturas (se eliminaron ${eliminadas.changes} anteriores)`,
      ...resultado
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /facturas?vencimiento_hasta=YYYY-MM-DD&estado=pendiente
router.get("/", (req, res) => {
  try {
    const { vencimiento_hasta, vencimiento_desde, estado = "pendiente" } = req.query;
    let query = "SELECT * FROM facturas WHERE 1=1";
    const params = [];

    if (estado) { query += " AND estado = ?"; params.push(estado); }
    if (vencimiento_desde) { query += " AND fecha_vencimiento >= ?"; params.push(vencimiento_desde); }
    if (vencimiento_hasta) { query += " AND fecha_vencimiento <= ?"; params.push(vencimiento_hasta); }
    query += " ORDER BY proveedor_nit, fecha_vencimiento";

    const facturas = db.prepare(query).all(...params);
    res.json({ facturas, total: facturas.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /facturas/agrupadas — desde ERP en tiempo real
router.get("/agrupadas", async (req, res) => {
  try {
    const { solo_incluir, vencimiento_hasta, vencimiento_desde } = req.query;

    if (solo_incluir === "1") {
      // Traer facturas individuales y filtrar solo las marcadas para pago
      const erpFacturas = await getCuentasPorPagar({ soloVencidas: false });
      const ajustesRows = db.prepare("SELECT idreg, incluir_pago, flete FROM facturas_erp_ajustes").all();
      const ajMap = {};
      ajustesRows.forEach(a => { ajMap[a.idreg] = a; });

      // Solo incluir facturas ESTRICTAMENTE marcadas para pago (incluir_pago=1)
      const toISO = d => { if (!d) return null; if (d instanceof Date) return d.toISOString().slice(0,10); return String(d).slice(0,10); };
      const incluidas = erpFacturas.filter(f => {
        const aj = ajMap[String(f.idreg)];
        if (!aj || aj.incluir_pago !== 1) return false;
        const fecVen = toISO(f.fecha_vencimiento);
        if (vencimiento_hasta && fecVen && fecVen > vencimiento_hasta) return false;
        if (vencimiento_desde && fecVen && fecVen < vencimiento_desde) return false;
        return true;
      });

      // Agrupar por proveedor
      const grupos = {};
      incluidas.forEach(f => {
        const nit = f.nit;
        const aj = ajMap[String(f.idreg)] || {};
        const flete = aj.flete || 0;
        const saldo = parseFloat(f.saldo_pendiente) || 0;
        const valorFinal = Math.max(0, saldo - flete);
        if (!grupos[nit]) {
          grupos[nit] = {
            proveedor_nit:       nit,
            proveedor_nombre:    f.proveedor_nombre,
            cantidad_facturas:   0,
            total_valor_final:   0,
            primera_vencimiento: null,
            estado:              'pendiente',
          };
        }
        grupos[nit].cantidad_facturas++;
        grupos[nit].total_valor_final += valorFinal;
        const fecVen = f.fecha_vencimiento ? String(f.fecha_vencimiento).slice(0,10) : null;
        if (fecVen && (!grupos[nit].primera_vencimiento || fecVen < grupos[nit].primera_vencimiento))
          grupos[nit].primera_vencimiento = fecVen;
      });

      const agrupadas = Object.values(grupos).sort((a,b) => (a.proveedor_nombre||'').localeCompare(b.proveedor_nombre||''));
      return res.json({ agrupadas, total: agrupadas.length });
    }

    // Sin filtro: resumen completo del ERP
    const erp = await getResumenCxP();
    const agrupadas = erp.map(r => ({
      proveedor_nit:         r.nit,
      proveedor_nombre:      r.proveedor_nombre,
      cantidad_facturas:     r.total_facturas,
      total_valor_final:     r.total_pendiente,
      primera_vencimiento:   r.proxima_vencimiento,
      total_vencido:         r.total_vencido,
      estado:                'pendiente',
    }));

    res.json({ agrupadas, total: agrupadas.length });
  } catch (err) {
    console.error("agrupadas ERP:", err.message);
    // fallback SQLite
    try {
      const { vencimiento_hasta, vencimiento_desde, estado = "pendiente", solo_incluir } = req.query;
      let query = `SELECT proveedor_nit,proveedor_nombre,COUNT(*) as cantidad_facturas,SUM(valor_factura) as total_valor_factura,SUM(descuento_pronto_pago) as total_descuento,SUM(flete) as total_flete,SUM(valor_final) as total_valor_final,MIN(fecha_vencimiento) as primera_vencimiento,MAX(fecha_vencimiento) as ultima_vencimiento,estado FROM facturas WHERE 1=1`;
      const params = [];
      if (estado) { query += " AND estado = ?"; params.push(estado); }
      if (vencimiento_desde) { query += " AND fecha_vencimiento >= ?"; params.push(vencimiento_desde); }
      if (vencimiento_hasta) { query += " AND fecha_vencimiento <= ?"; params.push(vencimiento_hasta); }
      if (solo_incluir === "1") { query += " AND incluir_pago = 1"; }
      query += " GROUP BY proveedor_nit, estado ORDER BY proveedor_nit";
      const agrupadas2 = db.prepare(query).all(...params);
      res.json({ agrupadas: agrupadas2 });
    } catch (err2) {
      res.status(500).json({ error: err2.message });
    }
  }
});

// POST /facturas/analizar-imagen — analiza imagen de proveedor con IA
router.post("/analizar-imagen", upload.single("imagen"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Se requiere una imagen" });

    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf"];
    if (!allowedTypes.includes(req.file.mimetype)) {
      return res.status(400).json({ error: "Formato no válido. Use JPG, PNG, WEBP o PDF" });
    }

    const imageBase64 = req.file.buffer.toString("base64");
    const resultado = await analizarImagenProveedor(imageBase64, req.file.mimetype);

    // Intentar identificar proveedor automáticamente por número de factura en el ERP
    let proveedor_sugerido = null;
    const numeros = (resultado.facturas_encontradas || []).map(f => f.numero_factura).filter(Boolean);
    const erpFacturas = await getCuentasPorPagar({ soloVencidas: false });

    // Buscar por número de factura en ERP — coincidencia exacta primero
    for (const num of numeros) {
      const digits = num.replace(/\D/g,'');
      // Exact match first (numero_factura == digits exactly)
      let matches = erpFacturas.filter(f =>
        f.numero_factura && f.numero_factura.replace(/\D/g,'') === digits
      );
      // Fallback: endsWith only if no exact match
      if (matches.length === 0) {
        matches = erpFacturas.filter(f =>
          f.numero_factura && f.numero_factura.replace(/\D/g,'').endsWith(digits)
        );
      }
      if (matches.length === 1) {
        const match = matches[0];
        const prov = db.prepare("SELECT * FROM proveedores WHERE nit = ?").get(match.nit);
        proveedor_sugerido = {
          nit:    match.nit,
          nombre: prov?.nombre || match.proveedor_nombre,
          telefono: prov?.telefono || '',
          facturas_erp: erpFacturas
            .filter(f => f.nit === match.nit)
            .map(f => ({ numero_factura: f.numero_factura, saldo: parseFloat(f.saldo_pendiente)||0 })),
        };
        break;
      } else if (matches.length > 1) {
        // Ambiguous: multiple providers have same invoice number — do NOT auto-assign
        console.warn(`[analizar-imagen] Número de factura ${digits} encontrado en ${matches.length} proveedores:`, matches.map(m => m.proveedor_nombre));
        // Return all candidates so the UI can ask the user to pick
        proveedor_sugerido = {
          nit: null,
          nombre: null,
          ambiguo: true,
          candidatos: matches.map(m => ({
            nit: m.nit,
            nombre: m.proveedor_nombre,
            numero_factura: m.numero_factura,
            saldo: parseFloat(m.saldo_pendiente)||0,
          })),
        };
        break;
      }
    }

    // Fallback: buscar por nombre del proveedor extraído por la IA
    if (!proveedor_sugerido && resultado.proveedor_nombre) {
      const nombreIA = resultado.proveedor_nombre.toUpperCase().replace(/[^A-Z0-9 ]/g,'');
      // Buscar en SQLite proveedores
      const provRows = db.prepare("SELECT * FROM proveedores").all();
      const matchProv = provRows.find(p => {
        if (!p.nombre) return false;
        const n = p.nombre.toUpperCase().replace(/[^A-Z0-9 ]/g,'');
        return nombreIA.includes(n.slice(0,8)) || n.includes(nombreIA.slice(0,8));
      });
      if (matchProv) {
        proveedor_sugerido = { nit: matchProv.nit, nombre: matchProv.nombre, telefono: matchProv.telefono, facturas_erp: [] };
      }
      // Buscar en ERP por nombre similar
      if (!proveedor_sugerido) {
        const matchERP = erpFacturas.find(f => {
          if (!f.proveedor_nombre) return false;
          const n = f.proveedor_nombre.toUpperCase().replace(/[^A-Z0-9 ]/g,'');
          return nombreIA.includes(n.slice(0,6)) || n.includes(nombreIA.slice(0,6));
        });
        if (matchERP) {
          proveedor_sugerido = { nit: matchERP.nit, nombre: matchERP.proveedor_nombre, telefono: '', facturas_erp: [] };
        }
      }
    }

    // Guardar imagen temporalmente en memoria con un token para confirmar después
    const token = Date.now().toString(36) + Math.random().toString(36).slice(2);
    req.app.locals._imgBuffer = req.app.locals._imgBuffer || {};
    req.app.locals._imgBuffer[token] = {
      buffer: req.file.buffer,
      mimetype: req.file.mimetype,
      originalname: req.file.originalname,
      ts: Date.now(),
    };

    res.json({ analisis: resultado, proveedor_sugerido, token_imagen: token });
  } catch (err) {
    console.error("Error analizando imagen:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /facturas/confirmar-soporte — guarda imagen como soporte de pago tras confirmación del usuario
router.post("/confirmar-soporte", express.json(), async (req, res) => {
  try {
    const { token_imagen, proveedor_nit, proveedor_nombre_erp, facturas, valor, fecha_pago, notas } = req.body;
    if (!token_imagen || !proveedor_nit) return res.status(400).json({ error: "token_imagen y proveedor_nit requeridos" });

    const imgData = req.app.locals._imgBuffer?.[token_imagen];
    if (!imgData) return res.status(404).json({ error: "Imagen expirada o no encontrada. Vuelve a subir." });

    // Limpiar token
    delete req.app.locals._imgBuffer[token_imagen];

    const resultado = await guardarSoporte({
      proveedor_nit,
      proveedor_nombre_erp: proveedor_nombre_erp || null,
      facturas: facturas || '',
      valor:    valor ? parseFloat(valor) : null,
      fecha_pago: fecha_pago || new Date().toISOString().slice(0,10),
      notas:    notas || 'Guardado desde análisis IA',
      buffer:   imgData.buffer,
      originalname: imgData.originalname,
      mimetype:     imgData.mimetype,
    });

    res.json({ mensaje: "Soporte guardado y proveedor notificado", ...resultado });
  } catch (err) {
    console.error("Error confirmando soporte:", err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /facturas/:id/valor-proveedor — actualiza valor con el del proveedor si es menor
router.put("/:id/valor-proveedor", express.json(), (req, res) => {
  try {
    const { valor_proveedor, descuento, flete } = req.body;
    if (valor_proveedor == null) return res.status(400).json({ error: "valor_proveedor requerido" });

    const factura = db.prepare("SELECT * FROM facturas WHERE id = ?").get(req.params.id);
    if (!factura) return res.status(404).json({ error: "Factura no encontrada" });

    const valorFinalNuevo = Number(valor_proveedor);
    const valorFinalAnterior = factura.valor_final;

    // Solo aceptar si es menor o igual (favorece a MAKA)
    if (valorFinalNuevo > valorFinalAnterior) {
      return res.status(400).json({
        error: "El valor del proveedor es mayor al calculado. No se puede aplicar.",
        valor_calculado: valorFinalAnterior,
        valor_proveedor: valorFinalNuevo,
      });
    }

    db.prepare(`
      UPDATE facturas SET
        valor_final = ?,
        valor_proveedor = ?,
        descuento_pronto_pago = COALESCE(?, descuento_pronto_pago),
        flete = COALESCE(?, flete),
        origen_valor = 'proveedor'
      WHERE id = ?
    `).run(valorFinalNuevo, valorFinalNuevo, descuento ?? null, flete ?? null, req.params.id);

    res.json({
      mensaje: "Valor del proveedor aplicado",
      valor_anterior: valorFinalAnterior,
      valor_nuevo: valorFinalNuevo,
      ahorro: valorFinalAnterior - valorFinalNuevo,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /facturas/vencimientos — facturas en tiempo real desde ERP SQL Server
router.get("/vencimientos", async (req, res) => {
  try {
    const { proveedor_nit, vencimiento_desde, vencimiento_hasta } = req.query;

    // 1. Traer todas las facturas pendientes del ERP
    const erpFacturas = await getCuentasPorPagar({
      soloVencidas: false,
      nit: proveedor_nit || null,
    });

    // 2. Traer ajustes locales (incluir_pago, flete, notas, fecha override) de SQLite
    const ajustesRows = db.prepare("SELECT * FROM facturas_erp_ajustes").all();
    const ajustesMap = {};
    ajustesRows.forEach(a => { ajustesMap[a.idreg] = a; });

    // 3. Traer datos de proveedores (banco, cuenta, titular, descuentos) de SQLite
    const provRows = db.prepare("SELECT nit, nombre, banco, cuenta, tipo_cuenta, telefono, titular_nombre, titular_id, descuento_cacharro, descuento_joyeria, descuento_activo FROM proveedores").all();
    const provMap = {};
    // Indexar por NIT original Y por NIT normalizado (solo dígitos) para tolerar diferencias de formato
    const normNit = n => String(n || '').replace(/\D/g, '').replace(/^0+/, '');
    provRows.forEach(p => {
      provMap[p.nit] = p;
      const normalized = normNit(p.nit);
      if (normalized && normalized !== p.nit) provMap[normalized] = p;
    });
    const findProv = nit => provMap[nit] || provMap[normNit(nit)] || {};

    // Helper para convertir Date de SQL Server a YYYY-MM-DD
    const toISO = d => {
      if (!d) return null;
      if (d instanceof Date) return d.toISOString().slice(0, 10);
      return String(d).slice(0, 10);
    };

    // 4. Mapear al formato que espera el frontend
    let facturas = erpFacturas.map(f => {
      const idreg     = String(f.idreg);
      const aj        = ajustesMap[idreg] || {};
      const prov      = findProv(f.nit);
      const fecVen    = aj.fecha_vencimiento_override || toISO(f.fecha_vencimiento);
      const hoy       = new Date(); hoy.setHours(0,0,0,0);
      const dVen      = fecVen ? Math.round((new Date(fecVen) - hoy) / 86400000) : null;
      const fecFac    = toISO(f.fecha_factura);
      const diasSist  = fecFac ? Math.round((hoy - new Date(fecFac)) / 86400000) : null;
      const flete     = aj.flete != null ? aj.flete : 0;
      const saldo     = parseFloat(f.saldo_pendiente) || 0;

      // Calcular descuento: override manual > catálogo proveedor > 0
      let descuento = 0;
      if (aj.descuento != null && aj.descuento > 0) {
        descuento = aj.descuento;
      } else {
        const tipo = prov.descuento_activo || 'cacharro';
        const pct  = tipo === 'joyeria' ? (prov.descuento_joyeria || 0) : (prov.descuento_cacharro || 0);
        descuento  = Math.round(saldo * pct);
      }

      // Override de proveedor: si el ERP tiene el NIT/nombre equivocado, usar el corregido manualmente
      const nitFinal    = aj.proveedor_nit_override    || f.nit;
      const nombreFinal = aj.proveedor_nombre_override || f.proveedor_nombre;
      const provFinal   = (aj.proveedor_nit_override ? findProv(nitFinal) : null) || prov;

      return {
        id:                    idreg,
        numero_factura:        f.numero_factura,
        factura_completa:      f.factura_completa,
        radicado:              f.radicado,
        proveedor_nit:         nitFinal,
        proveedor_nombre:      nombreFinal,
        p_nombre:              provFinal.nombre || nombreFinal,
        fecha_factura:         fecFac,
        fecha_vencimiento:     fecVen,
        dias_para_vencer:      dVen,
        dias_sistema:          diasSist,
        valor_factura:         parseFloat(f.valor_bruto) || saldo,
        descuento_pronto_pago: descuento,
        flete:                 flete,
        valor_final:           Math.max(0, saldo - flete - descuento),
        valor_neto:            parseFloat(f.valor_neto) || 0,
        valor_abonado:         parseFloat(f.valor_abonado) || 0,
        saldo_pendiente:       saldo,
        origen_valor:          'ERP',
        estado:                'pendiente',
        incluir_pago:          aj.incluir_pago != null ? aj.incluir_pago : 0,
        notas:                 aj.notas || '',
        banco:                 provFinal.banco || '',
        cuenta:                provFinal.cuenta || '',
        tipo_cuenta:           provFinal.tipo_cuenta || '',
        titular_nombre:        provFinal.titular_nombre || '',
        titular_id:            provFinal.titular_id || '',
        codalm:                f.Codalm || f.codalm || '',
        tienda:                ({'001':'ARRE','005':'LA30','006':'PLAZA'}[f.Codalm||f.codalm]) || f.tienda_nombre || f.Codalm || '',
      };
    });

    // 5. Filtrar por fechas si vienen en query
    if (vencimiento_desde) {
      facturas = facturas.filter(f => f.fecha_vencimiento && f.fecha_vencimiento >= vencimiento_desde);
    }
    if (vencimiento_hasta) {
      facturas = facturas.filter(f => f.fecha_vencimiento && f.fecha_vencimiento <= vencimiento_hasta);
    }

    // 6. Ordenar por fecha vencimiento ASC
    facturas.sort((a, b) => {
      if (!a.fecha_vencimiento) return 1;
      if (!b.fecha_vencimiento) return -1;
      return a.fecha_vencimiento.localeCompare(b.fecha_vencimiento);
    });

    res.json({ facturas, total: facturas.length });
  } catch (err) {
    console.error("vencimientos ERP:", err.message);
    res.status(500).json({ error: "Error consultando ERP: " + err.message });
  }
});

// PATCH /facturas/:id/ajustar — editar flete y/o fecha_vencimiento (ERP: upsert en ajustes locales)
router.patch("/:id/ajustar", express.json(), (req, res) => {
  try {
    const { flete, fecha_vencimiento } = req.body;
    const idreg = req.params.id;
    if (flete === undefined && fecha_vencimiento === undefined) {
      return res.status(400).json({ error: "Nada que actualizar" });
    }
    // Obtener valores actuales
    const actual = db.prepare("SELECT * FROM facturas_erp_ajustes WHERE idreg = ?").get(idreg) || {};
    const nuevoFlete = flete !== undefined ? (Number(flete) || 0) : (actual.flete || 0);
    const nuevaFecha = fecha_vencimiento !== undefined ? (fecha_vencimiento || null) : (actual.fecha_vencimiento_override || null);

    db.prepare(`
      INSERT INTO facturas_erp_ajustes (idreg, flete, fecha_vencimiento_override, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(idreg) DO UPDATE SET
        flete                      = excluded.flete,
        fecha_vencimiento_override = excluded.fecha_vencimiento_override,
        updated_at                 = CURRENT_TIMESTAMP
    `).run(idreg, nuevoFlete, nuevaFecha);

    res.json({ mensaje: "Factura ajustada", id: idreg, flete: nuevoFlete, fecha_vencimiento: nuevaFecha });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /facturas/:id/corregir-proveedor — corregir manualmente el proveedor de una factura del ERP
router.patch("/:id/corregir-proveedor", express.json(), (req, res) => {
  try {
    const { proveedor_nit, proveedor_nombre } = req.body;
    const idreg = req.params.id;
    if (!proveedor_nit && !proveedor_nombre) return res.status(400).json({ error: "proveedor_nit o proveedor_nombre requerido" });
    db.prepare(`
      INSERT INTO facturas_erp_ajustes (idreg, proveedor_nit_override, proveedor_nombre_override, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(idreg) DO UPDATE SET
        proveedor_nit_override    = excluded.proveedor_nit_override,
        proveedor_nombre_override = excluded.proveedor_nombre_override,
        updated_at                = CURRENT_TIMESTAMP
    `).run(idreg, proveedor_nit || null, proveedor_nombre || null);
    res.json({ ok: true, id: idreg, proveedor_nit, proveedor_nombre });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /facturas/:id/incluir — marcar/desmarcar para pago (ERP: upsert en ajustes locales)
router.patch("/:id/incluir", express.json(), (req, res) => {
  try {
    const { incluir, notas } = req.body;
    const idreg = req.params.id;
    db.prepare(`
      INSERT INTO facturas_erp_ajustes (idreg, incluir_pago, notas, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(idreg) DO UPDATE SET
        incluir_pago = excluded.incluir_pago,
        notas        = COALESCE(excluded.notas, notas),
        updated_at   = CURRENT_TIMESTAMP
    `).run(idreg, incluir ? 1 : 0, notas ?? null);
    res.json({ id: idreg, incluir_pago: incluir ? 1 : 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /facturas/incluir-lote — marcar/desmarcar múltiples
router.patch("/incluir-lote", express.json(), (req, res) => {
  try {
    const { ids, incluir } = req.body;
    if (!ids?.length) return res.status(400).json({ error: "ids requerido" });
    const stmt = db.prepare(`
      INSERT INTO facturas_erp_ajustes (idreg, incluir_pago, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(idreg) DO UPDATE SET incluir_pago = excluded.incluir_pago, updated_at = CURRENT_TIMESTAMP
    `);
    const txn = db.transaction(() => ids.forEach(id => stmt.run(String(id), incluir ? 1 : 0)));
    txn();
    res.json({ actualizadas: ids.length, incluir_pago: incluir ? 1 : 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
