/**
 * Script para crear archivos Excel de ejemplo para probar MAKABOT
 * Ejecutar: node crear-ejemplos.js
 */
const XLSX = require("xlsx");
const path = require("path");

// === EXCEL DE PROVEEDORES ===
const proveedoresData = [
  ["nombre", "nit", "telefono", "banco", "cuenta", "tipo_cuenta"],
  ["Distribuidora Belleza SAS", "900123456", "3201234567", "Bancolombia", "12345678901", "Ahorros"],
  ["Importaciones Gloria", "800987654", "3159876543", "Davivienda", "98765432101", "Corriente"],
  ["Accesorios del Pacifico", "901234567", "57 316 7654321", "BBVA", "11223344556", "Ahorros"],
  ["Cosméticos Medellín", "700111222", "+57-300-9876543", "Nequi", "3009876543", "Nequi"],
  ["Joyería Bogotá Ltda", "830456789", "3124567890", "Bancolombia", "44455566677", "Corriente"],
];

const wsProveedores = XLSX.utils.aoa_to_sheet(proveedoresData);
wsProveedores["!cols"] = [
  { wch: 30 }, { wch: 15 }, { wch: 18 }, { wch: 15 }, { wch: 18 }, { wch: 15 }
];

// === EXCEL DE FACTURAS ===
const facturasData = [
  [
    "numero_factura", "proveedor_nit", "proveedor_nombre",
    "valor_factura", "descuento_pronto_pago", "flete",
    "fecha_factura", "fecha_vencimiento"
  ],
  ["FV-2025-001", "900123456", "Distribuidora Belleza SAS", 1500000, 30000, 25000, "2025-01-10", "2025-01-25"],
  ["FV-2025-002", "900123456", "Distribuidora Belleza SAS", 800000, 16000, 15000, "2025-01-12", "2025-01-27"],
  ["FV-2025-003", "800987654", "Importaciones Gloria", 2300000, 46000, 40000, "2025-01-08", "2025-01-23"],
  ["FV-2025-004", "901234567", "Accesorios del Pacifico", 950000, 0, 20000, "2025-01-15", "2025-01-30"],
  ["FV-2025-005", "700111222", "Cosméticos Medellín", 1200000, 24000, 0, "2025-01-11", "2025-01-26"],
  ["FV-2025-006", "700111222", "Cosméticos Medellín", 600000, 12000, 18000, "2025-01-14", "2025-01-29"],
  ["FV-2025-007", "830456789", "Joyería Bogotá Ltda", 3500000, 70000, 50000, "2025-01-09", "2025-01-24"],
];

const wsFacturas = XLSX.utils.aoa_to_sheet(facturasData);
wsFacturas["!cols"] = [
  { wch: 15 }, { wch: 15 }, { wch: 30 }, { wch: 18 },
  { wch: 22 }, { wch: 12 }, { wch: 15 }, { wch: 18 }
];

// Crear archivos
const wbProveedores = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wbProveedores, wsProveedores, "Proveedores");
const provFile = path.join(__dirname, "ejemplo_proveedores.xlsx");
XLSX.writeFile(wbProveedores, provFile);
console.log("✅ Creado:", provFile);

const wbFacturas = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wbFacturas, wsFacturas, "Facturas");
const facFile = path.join(__dirname, "ejemplo_facturas.xlsx");
XLSX.writeFile(wbFacturas, facFile);
console.log("✅ Creado:", facFile);

console.log("\n📋 Para probar MAKABOT:");
console.log("1. Sube proveedores: curl -F 'archivo=@ejemplo_proveedores.xlsx' http://localhost:3000/proveedores/upload");
console.log("2. Sube facturas:    curl -F 'archivo=@ejemplo_facturas.xlsx' http://localhost:3000/facturas/upload");
console.log("3. Genera mensajes:  curl -X POST http://localhost:3000/mensajes/generar -H 'Content-Type: application/json' -d '{\"fecha_pago\":\"2025-01-30\",\"solo_generar\":true}'");
console.log("4. Genera pagos:     curl 'http://localhost:3000/pagos/generar?fecha_pago=2025-01-30'");
