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
`);

// Agregar columnas nuevas a proveedores si no existen (migraciones)
const colsProveedores = ['descuento_cacharro REAL DEFAULT 0', 'descuento_joyeria REAL DEFAULT 0',
  'descuento_activo TEXT', 'flete_condicion TEXT', 'plazo_dias INTEGER',
  'tiendas_nuevas TEXT', 'soporte_iva TEXT', 'net_iva REAL', 'telefono2 TEXT'];
for (const col of colsProveedores) {
  try { db.exec(`ALTER TABLE proveedores ADD COLUMN ${col}`); } catch(e) {}
}

module.exports = db;
