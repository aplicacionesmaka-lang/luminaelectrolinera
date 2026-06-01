const Database = require("better-sqlite3");
const path = require("path");

const DB_PATH = path.join(__dirname, "../../makabot.db");
const db = new Database(DB_PATH);

// Habilitar WAL para mejor rendimiento
db.pragma("journal_mode = WAL");

// Crear tablas si no existen
db.exec(`
  CREATE TABLE IF NOT EXISTS proveedores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    nit TEXT UNIQUE NOT NULL,
    telefono TEXT,
    telefono2 TEXT,
    banco TEXT,
    cuenta TEXT,
    tipo_cuenta TEXT,
    descuento_cacharro REAL DEFAULT 0,
    descuento_joyeria REAL DEFAULT 0,
    descuento_activo TEXT,
    flete_condicion TEXT,
    plazo_dias INTEGER,
    tiendas_nuevas TEXT,
    soporte_iva TEXT,
    net_iva REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS facturas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numero_factura TEXT NOT NULL,
    proveedor_nit TEXT NOT NULL,
    proveedor_nombre TEXT,
    valor_factura REAL NOT NULL,
    descuento_pronto_pago REAL DEFAULT 0,
    flete REAL DEFAULT 0,
    valor_final REAL NOT NULL,
    valor_proveedor REAL,
    origen_valor TEXT DEFAULT 'calculado',
    fecha_factura TEXT,
    fecha_vencimiento TEXT,
    estado TEXT DEFAULT 'pendiente',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS conversaciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    proveedor_nit TEXT NOT NULL,
    mensaje_enviado TEXT,
    respuesta TEXT,
    estado TEXT DEFAULT 'enviado',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS cuentas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT UNIQUE NOT NULL,
    saldo REAL DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS gastos_semana (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    categoria TEXT NOT NULL,
    descripcion TEXT DEFAULT '',
    valor REAL DEFAULT 0,
    semana TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS pagos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    proveedor_nit TEXT NOT NULL,
    proveedor_nombre TEXT,
    valor_pago REAL NOT NULL,
    banco TEXT,
    cuenta TEXT,
    tipo_cuenta TEXT,
    estado TEXT DEFAULT 'pendiente',
    archivo_generado TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS cuentas_bancarias (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    proveedor_nit TEXT NOT NULL,
    banco TEXT NOT NULL,
    tipo_cuenta TEXT NOT NULL,
    numero_cuenta TEXT NOT NULL,
    titular_nombre TEXT NOT NULL,
    titular_id TEXT NOT NULL,
    valor_asignado REAL,
    orden INTEGER DEFAULT 1,
    activa INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS estados_conversacion (
    proveedor_nit TEXT PRIMARY KEY,
    estado TEXT,
    datos_parciales TEXT,
    numero_cuenta INTEGER DEFAULT 1,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS facturas_erp_ajustes (
    idreg TEXT PRIMARY KEY,
    incluir_pago INTEGER DEFAULT 1,
    flete REAL DEFAULT 0,
    fecha_vencimiento_override TEXT,
    notas TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS soportes_pago (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    proveedor_nit TEXT NOT NULL,
    proveedor_nombre TEXT,
    facturas TEXT,
    valor REAL,
    fecha_pago TEXT,
    archivo_nombre TEXT NOT NULL,
    archivo_path TEXT NOT NULL,
    mime_type TEXT DEFAULT 'image/jpeg',
    notas TEXT,
    notificado INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS notificaciones_pago (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    proveedor_nit TEXT NOT NULL,
    proveedor_nombre TEXT,
    telefono TEXT,
    facturas TEXT,
    total REAL,
    recordatorios_enviados INTEGER DEFAULT 0,
    respondido INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    ultimo_recordatorio DATETIME
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS presupuesto_ventas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codalm TEXT NOT NULL,
    anio INTEGER NOT NULL,
    mes INTEGER NOT NULL,
    presupuesto REAL NOT NULL DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(codalm, anio, mes)
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS solicitudes_pdf_compra (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    oc_id               TEXT NOT NULL UNIQUE,
    numero_orden        TEXT NOT NULL,
    proveedor_nit       TEXT DEFAULT '',
    proveedor_nombre    TEXT DEFAULT '',
    telefono            TEXT DEFAULT '',
    tienda              TEXT DEFAULT '',
    valor_total         REAL DEFAULT 0,
    descripcion         TEXT DEFAULT '',
    estado              TEXT DEFAULT 'pendiente',
    etapa               INTEGER DEFAULT 0,
    fecha_confirmacion  DATETIME,
    solicitudes_enviadas INTEGER DEFAULT 0,
    pdf_recibido        INTEGER DEFAULT 0,
    excluir             INTEGER DEFAULT 0,
    archivo_path        TEXT DEFAULT '',
    ultimo_recordatorio DATETIME,
    updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at          DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Migraciones solicitudes_pdf_compra
const colsOC = ['estado TEXT DEFAULT \'pendiente\'', 'etapa INTEGER DEFAULT 0',
  'fecha_confirmacion DATETIME',
  'guia_recibida INTEGER DEFAULT 0',
  'etapa_guia INTEGER DEFAULT 0',
  'ultimo_recordatorio_guia DATETIME',
];
for (const col of colsOC) {
  try { db.exec(`ALTER TABLE solicitudes_pdf_compra ADD COLUMN ${col}`); } catch(e) {}
}

// Migraciones facturas_erp_ajustes
const colsAjustes = ['proveedor_nit_override TEXT', 'proveedor_nombre_override TEXT'];
for (const col of colsAjustes) {
  try { db.exec(`ALTER TABLE facturas_erp_ajustes ADD COLUMN ${col}`); } catch(e) {}
}

// Agregar columnas nuevas a proveedores si no existen (migraciones)
const colsProveedores = ['descuento_cacharro REAL DEFAULT 0', 'descuento_joyeria REAL DEFAULT 0',
  'descuento_activo TEXT', 'flete_condicion TEXT', 'plazo_dias INTEGER',
  'tiendas_nuevas TEXT', 'soporte_iva TEXT', 'net_iva REAL', 'telefono2 TEXT',
  'titular_nombre TEXT', 'titular_id TEXT', 'ciudad TEXT', 'direccion TEXT',
  'bot_pausado INTEGER DEFAULT 0'];
for (const col of colsProveedores) {
  try { db.exec(`ALTER TABLE proveedores ADD COLUMN ${col}`); } catch(e) {}
}

// Migraciones facturas_erp_ajustes: descuento por factura
try { db.exec(`ALTER TABLE facturas_erp_ajustes ADD COLUMN descuento REAL DEFAULT 0`); } catch(e) {}

// ── TABLAS CUENTAS POR COBRAR (CxC) ─────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS clientes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    nit TEXT UNIQUE NOT NULL,
    telefono TEXT,
    telefono2 TEXT,
    email TEXT,
    ciudad TEXT,
    direccion TEXT,
    contacto TEXT,
    bot_pausado INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS facturas_cobrar (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numero_factura TEXT NOT NULL,
    cliente_nit TEXT NOT NULL,
    cliente_nombre TEXT,
    valor_factura REAL NOT NULL,
    valor_abonado REAL DEFAULT 0,
    saldo_pendiente REAL NOT NULL,
    fecha_factura TEXT,
    fecha_vencimiento TEXT,
    dias_para_vencer INTEGER,
    estado TEXT DEFAULT 'pendiente',
    notas TEXT,
    recordatorio_enviado INTEGER DEFAULT 0,
    ultimo_recordatorio DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS recordatorios_cxc (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_nit TEXT NOT NULL,
    cliente_nombre TEXT,
    mensaje TEXT,
    tipo TEXT DEFAULT 'vencimiento',
    estado TEXT DEFAULT 'enviado',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);
try { db.exec(`ALTER TABLE clientes ADD COLUMN bot_pausado INTEGER DEFAULT 0`); } catch(e) {}

// Columnas nuevas en facturas_cobrar
const colsFacCobrar = [
  'descuento REAL DEFAULT 0',
  'flete REAL DEFAULT 0',
  'valor_final_cobrar REAL',
  'clasificacion TEXT',
];
for (const col of colsFacCobrar) {
  try { db.exec(`ALTER TABLE facturas_cobrar ADD COLUMN ${col}`); } catch(e) {}
}

// Tabla comprobantes de clientes
db.exec(`
  CREATE TABLE IF NOT EXISTS comprobantes_clientes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_nit TEXT NOT NULL,
    cliente_nombre TEXT,
    facturas TEXT,
    valor REAL,
    fecha_pago TEXT,
    archivo_nombre TEXT,
    archivo_path TEXT,
    mime_type TEXT DEFAULT 'image/jpeg',
    notas TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Checkpoint WAL para no perder datos en restart
try { db.pragma("wal_checkpoint(TRUNCATE)"); } catch(e) {}

// Auto-recuperación de soportes: re-insertar archivos físicos huérfanos
(function autoRecuperarSoportes() {
  const fs   = require("fs");
  const path = require("path");
  const SOPORTES_DIR = path.join(__dirname, "../../soportes");
  if (!fs.existsSync(SOPORTES_DIR)) return;

  const existentes = new Set(
    db.prepare("SELECT archivo_nombre FROM soportes_pago").all().map(r => r.archivo_nombre)
  );

  const insert = db.prepare(`
    INSERT INTO soportes_pago (proveedor_nit, proveedor_nombre, archivo_nombre, archivo_path, mime_type, fecha_pago, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const files = fs.readdirSync(SOPORTES_DIR).filter(f => /\.(png|jpg|jpeg|pdf)$/i.test(f));
  let recuperados = 0;

  for (const file of files) {
    if (existentes.has(file)) continue;
    // Patrón: soporte_{nit}_{timestamp}.ext
    const m = file.match(/^soporte_([^_]+(?:_[^_]+)*)_(\d+)\.(png|jpg|jpeg|pdf)$/i);
    const nit  = m ? m[1] : "desconocido";
    const ts   = m ? parseInt(m[2]) : Date.now();
    const ext  = (m ? m[3] : "jpg").toLowerCase();
    const mime = ext === "pdf" ? "application/pdf" : `image/${ext === "jpeg" ? "jpeg" : ext}`;
    const fecha = new Date(ts).toISOString().slice(0, 10);
    const prov  = db.prepare("SELECT nombre FROM proveedores WHERE nit = ?").get(nit);
    const nombre = prov ? prov.nombre : nit;
    const filepath = path.join(SOPORTES_DIR, file);
    try {
      insert.run(nit, nombre, file, filepath, mime, fecha, new Date(ts).toISOString());
      recuperados++;
    } catch(e) {}
  }

  if (recuperados > 0) {
    console.log(`[db] Auto-recuperados ${recuperados} soportes huérfanos`);
  }
})();

module.exports = db;
