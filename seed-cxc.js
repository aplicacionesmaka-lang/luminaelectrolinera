/**
 * seed-cxc.js — Datos demo Cuentas por Cobrar (~$200M)
 * Todos los clientes con teléfono 3134880672
 * Edades de cartera variadas: vigente, 1-30d, 31-60d, 61-90d, 91+d
 */
require("dotenv").config();
const db = require("./src/models/db");

const hoy = new Date();
const fecha = (dias) => {
  const d = new Date(hoy);
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
};

// Borrar datos demo anteriores para re-insertar limpios
try {
  db.exec(`DELETE FROM facturas_cobrar WHERE numero_factura LIKE 'FC-DEMO-%'`);
  db.exec(`DELETE FROM clientes WHERE nit LIKE '9%-DEMO'`);
} catch(e) {}

// ── Clientes demo ─────────────────────────────────────────────────────────────
const TEL = "3134880672";

const clientes = [
  { nit: "900101010-1", nombre: "COMERCIALIZADORA CARIBE NORTE SAS",   telefono: TEL, ciudad: "Barranquilla", contacto: "Jorge Palomino",   clasificacion: "seguro"  },
  { nit: "900202020-2", nombre: "DISTRIBUCIONES DEL ATLÁNTICO LTDA",   telefono: TEL, ciudad: "Soledad",      contacto: "María Herrera",    clasificacion: "seguro"  },
  { nit: "900303030-3", nombre: "ALMACENES MODA CARIBE SAS",           telefono: TEL, ciudad: "Cartagena",    contacto: "Luis Rodríguez",   clasificacion: "dudoso"  },
  { nit: "900404040-4", nombre: "INVERSIONES COSTA ORO LTDA",          telefono: TEL, ciudad: "Barranquilla", contacto: "Ana Suárez",       clasificacion: "seguro"  },
  { nit: "900505050-5", nombre: "GRUPO TEXTIL DEL CARIBE SAS",         telefono: TEL, ciudad: "Santa Marta",  contacto: "Carlos Mendoza",   clasificacion: "dudoso"  },
  { nit: "900606060-6", nombre: "FERRETERÍA INDUSTRIAL DEL NORTE SAS", telefono: TEL, ciudad: "Barranquilla", contacto: "Roberto Salas",    clasificacion: "cobro"   },
  { nit: "900707070-7", nombre: "SUPERMERCADO EL PROGRESO SAS",        telefono: TEL, ciudad: "Malambo",      contacto: "Isabel Pertuz",    clasificacion: "seguro"  },
  { nit: "900808080-8", nombre: "JOYERÍA Y ACCESORIOS ELEGANCE LTDA",  telefono: TEL, ciudad: "Barranquilla", contacto: "Diana Cárdenas",   clasificacion: "cobro"   },
  { nit: "900909090-9", nombre: "PUNTO DE VENTA SAMARIO",              telefono: TEL, ciudad: "Santa Marta",  contacto: "Pedro Corrales",   clasificacion: "dudoso"  },
  { nit: "901010101-0", nombre: "MULTITIENDAS DEL CARIBE SAS",         telefono: TEL, ciudad: "Cartagena",    contacto: "Sandra Villalba",  clasificacion: "seguro"  },
];

const upsertCliente = db.prepare(`
  INSERT INTO clientes (nit, nombre, telefono, ciudad, contacto)
  VALUES (@nit, @nombre, @telefono, @ciudad, @contacto)
  ON CONFLICT(nit) DO UPDATE SET
    nombre=excluded.nombre, telefono=excluded.telefono,
    ciudad=excluded.ciudad, contacto=excluded.contacto
`);

console.log("📋 Insertando clientes demo...");
for (const c of clientes) {
  upsertCliente.run({ nit: c.nit, nombre: c.nombre, telefono: c.telefono, ciudad: c.ciudad, contacto: c.contacto });
  console.log(`  ✅ ${c.nombre}`);
}

// ── Facturas demo con edades y montos variados (~$200M total) ─────────────────
// Nomenclatura vencimiento: días desde hoy (negativo = ya venció)
const facturas = [
  // ── COMERCIALIZADORA CARIBE NORTE SAS — Seguro — $38M ──────────────────────
  { numero_factura:"FC-DEMO-001", cliente_nit:"900101010-1", cliente_nombre:"COMERCIALIZADORA CARIBE NORTE SAS",   valor_factura:18000000, valor_abonado:0,        fv: fecha(25),  ff: fecha(-5)  },
  { numero_factura:"FC-DEMO-002", cliente_nit:"900101010-1", cliente_nombre:"COMERCIALIZADORA CARIBE NORTE SAS",   valor_factura:12000000, valor_abonado:0,        fv: fecha(10),  ff: fecha(-20) },
  { numero_factura:"FC-DEMO-003", cliente_nit:"900101010-1", cliente_nombre:"COMERCIALIZADORA CARIBE NORTE SAS",   valor_factura: 8000000, valor_abonado:2000000,  fv: fecha(-8),  ff: fecha(-38) },

  // ── DISTRIBUCIONES DEL ATLÁNTICO LTDA — Seguro — $42M ──────────────────────
  { numero_factura:"FC-DEMO-010", cliente_nit:"900202020-2", cliente_nombre:"DISTRIBUCIONES DEL ATLÁNTICO LTDA",   valor_factura:22000000, valor_abonado:0,        fv: fecha(30),  ff: fecha(0)   },
  { numero_factura:"FC-DEMO-011", cliente_nit:"900202020-2", cliente_nombre:"DISTRIBUCIONES DEL ATLÁNTICO LTDA",   valor_factura:15000000, valor_abonado:5000000,  fv: fecha(5),   ff: fecha(-25) },
  { numero_factura:"FC-DEMO-012", cliente_nit:"900202020-2", cliente_nombre:"DISTRIBUCIONES DEL ATLÁNTICO LTDA",   valor_factura:10000000, valor_abonado:0,        fv: fecha(-12), ff: fecha(-42) },

  // ── ALMACENES MODA CARIBE — Dudoso — $28M ──────────────────────────────────
  { numero_factura:"FC-DEMO-020", cliente_nit:"900303030-3", cliente_nombre:"ALMACENES MODA CARIBE SAS",           valor_factura:12000000, valor_abonado:0,        fv: fecha(-35), ff: fecha(-65) },
  { numero_factura:"FC-DEMO-021", cliente_nit:"900303030-3", cliente_nombre:"ALMACENES MODA CARIBE SAS",           valor_factura: 9000000, valor_abonado:0,        fv: fecha(-20), ff: fecha(-50) },
  { numero_factura:"FC-DEMO-022", cliente_nit:"900303030-3", cliente_nombre:"ALMACENES MODA CARIBE SAS",           valor_factura: 7000000, valor_abonado:3000000,  fv: fecha(-5),  ff: fecha(-35) },

  // ── INVERSIONES COSTA ORO LTDA — Seguro — $35M ─────────────────────────────
  { numero_factura:"FC-DEMO-030", cliente_nit:"900404040-4", cliente_nombre:"INVERSIONES COSTA ORO LTDA",          valor_factura:20000000, valor_abonado:0,        fv: fecha(45),  ff: fecha(15)  },
  { numero_factura:"FC-DEMO-031", cliente_nit:"900404040-4", cliente_nombre:"INVERSIONES COSTA ORO LTDA",          valor_factura:15000000, valor_abonado:0,        fv: fecha(15),  ff: fecha(-15) },

  // ── GRUPO TEXTIL DEL CARIBE — Dudoso — $24M ────────────────────────────────
  { numero_factura:"FC-DEMO-040", cliente_nit:"900505050-5", cliente_nombre:"GRUPO TEXTIL DEL CARIBE SAS",         valor_factura:14000000, valor_abonado:0,        fv: fecha(-42), ff: fecha(-72) },
  { numero_factura:"FC-DEMO-041", cliente_nit:"900505050-5", cliente_nombre:"GRUPO TEXTIL DEL CARIBE SAS",         valor_factura:10000000, valor_abonado:4000000,  fv: fecha(-18), ff: fecha(-48) },

  // ── FERRETERÍA INDUSTRIAL — En Cobro — $18M ────────────────────────────────
  { numero_factura:"FC-DEMO-050", cliente_nit:"900606060-6", cliente_nombre:"FERRETERÍA INDUSTRIAL DEL NORTE SAS", valor_factura:10000000, valor_abonado:0,        fv: fecha(-95), ff: fecha(-125)},
  { numero_factura:"FC-DEMO-051", cliente_nit:"900606060-6", cliente_nombre:"FERRETERÍA INDUSTRIAL DEL NORTE SAS", valor_factura: 8000000, valor_abonado:0,        fv: fecha(-70), ff: fecha(-100)},

  // ── SUPERMERCADO EL PROGRESO — Seguro — $30M ───────────────────────────────
  { numero_factura:"FC-DEMO-060", cliente_nit:"900707070-7", cliente_nombre:"SUPERMERCADO EL PROGRESO SAS",        valor_factura:16000000, valor_abonado:0,        fv: fecha(20),  ff: fecha(-10) },
  { numero_factura:"FC-DEMO-061", cliente_nit:"900707070-7", cliente_nombre:"SUPERMERCADO EL PROGRESO SAS",        valor_factura:14000000, valor_abonado:0,        fv: fecha(3),   ff: fecha(-27) },

  // ── JOYERÍA ELEGANCE — En Cobro — $22M ─────────────────────────────────────
  { numero_factura:"FC-DEMO-070", cliente_nit:"900808080-8", cliente_nombre:"JOYERÍA Y ACCESORIOS ELEGANCE LTDA",  valor_factura:13000000, valor_abonado:0,        fv: fecha(-110),ff: fecha(-140)},
  { numero_factura:"FC-DEMO-071", cliente_nit:"900808080-8", cliente_nombre:"JOYERÍA Y ACCESORIOS ELEGANCE LTDA",  valor_factura: 9000000, valor_abonado:0,        fv: fecha(-65), ff: fecha(-95) },

  // ── PUNTO DE VENTA SAMARIO — Dudoso — $16M ─────────────────────────────────
  { numero_factura:"FC-DEMO-080", cliente_nit:"900909090-9", cliente_nombre:"PUNTO DE VENTA SAMARIO",              valor_factura: 9000000, valor_abonado:0,        fv: fecha(-55), ff: fecha(-85) },
  { numero_factura:"FC-DEMO-081", cliente_nit:"900909090-9", cliente_nombre:"PUNTO DE VENTA SAMARIO",              valor_factura: 7000000, valor_abonado:2000000,  fv: fecha(-22), ff: fecha(-52) },

  // ── MULTITIENDAS DEL CARIBE — Seguro — $28M ────────────────────────────────
  { numero_factura:"FC-DEMO-090", cliente_nit:"901010101-0", cliente_nombre:"MULTITIENDAS DEL CARIBE SAS",         valor_factura:16000000, valor_abonado:0,        fv: fecha(35),  ff: fecha(5)   },
  { numero_factura:"FC-DEMO-091", cliente_nit:"901010101-0", cliente_nombre:"MULTITIENDAS DEL CARIBE SAS",         valor_factura:12000000, valor_abonado:0,        fv: fecha(8),   ff: fecha(-22) },
];

const calcDias = (fechaVenc) => {
  if (!fechaVenc) return null;
  const h = new Date(); h.setHours(0,0,0,0);
  const v = new Date(fechaVenc); v.setHours(0,0,0,0);
  return Math.round((v - h) / 86400000);
};

const insertFac = db.prepare(`
  INSERT OR REPLACE INTO facturas_cobrar
    (numero_factura, cliente_nit, cliente_nombre, valor_factura, valor_abonado,
     saldo_pendiente, fecha_factura, fecha_vencimiento, dias_para_vencer, estado, notas)
  VALUES
    (@numero_factura, @cliente_nit, @cliente_nombre, @valor_factura, @valor_abonado,
     @saldo, @ff, @fv, @dias, @estado, @notas)
`);

// Aplicar clasificación por factura (para que aparezca en cartera)
const upsertClasif = db.prepare(`
  UPDATE facturas_cobrar SET clasificacion = ? WHERE cliente_nit = ?
`);

// Mapa clasificacion por nit
const clasificMap = {};
for (const c of clientes) clasificMap[c.nit] = c.clasificacion;

console.log("\n📄 Insertando facturas demo...");
let totalPorCobrar = 0;
for (const f of facturas) {
  const saldo = f.valor_factura - (f.valor_abonado || 0);
  const dias  = calcDias(f.fv);
  const estado = saldo <= 0 ? "pagada" : "pendiente";
  insertFac.run({
    numero_factura: f.numero_factura,
    cliente_nit:    f.cliente_nit,
    cliente_nombre: f.cliente_nombre,
    valor_factura:  f.valor_factura,
    valor_abonado:  f.valor_abonado || 0,
    saldo,
    ff: f.ff,
    fv: f.fv,
    dias,
    estado,
    notas: f.notas || "",
  });
  if (estado !== "pagada") totalPorCobrar += saldo;
  const label = dias < 0 ? `⚠️  VENCIDA ${Math.abs(dias)}d` : dias === 0 ? "🔴 HOY" : `🟢 vigente ${dias}d`;
  console.log(`  ${label} — ${f.numero_factura} — $${saldo.toLocaleString("es-CO")}`);
}

// Aplicar clasificacion a facturas por cliente
console.log("\n🏷️  Aplicando clasificaciones...");
for (const [nit, cls] of Object.entries(clasificMap)) {
  upsertClasif.run(cls, nit);
  console.log(`  ${nit} → ${cls}`);
}

console.log(`\n✅ Seed demo CxC completado`);
console.log(`   Clientes : ${clientes.length}`);
console.log(`   Facturas : ${facturas.length}`);
console.log(`   Total CxC: $${totalPorCobrar.toLocaleString("es-CO")}`);
