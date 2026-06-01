# MAKABOT — Arquitectura de Alto Nivel

> Última actualización: Mayo 2026

---

## Visión General

```
┌─────────────────────────────────────────────────────────────────────┐
│                    DASHBOARD WEB (public/index.html)                │
│              HTML + CSS + JS vanilla · Puerto 3000                  │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ HTTP REST
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  MAKABOT — Express (Node.js :3000)                  │
│                      src/index.js · SQLite                          │
│                                                                     │
│  /facturas  /proveedores  /mensajes  /pagos  /fondos  /soportes    │
│  /cxp  /inventario  /webhook  /ventas  /compras  /presupuesto       │
└────┬─────────────┬──────────────┬──────────────┬────────────────────┘
     │             │              │              │
     ▼             ▼              ▼              ▼
┌─────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐
│ SQLite  │  │SQL Server│  │Claude API│  │ WhatsApp Web.js  │
│makabot  │  │BD_SEG_   │  │(IA docs/ │  │(sin Meta Devs,   │
│  .db    │  │QCUTE ERP │  │ mensajes)│  │ sesión local QR) │
└─────────┘  └──────────┘  └──────────┘  └──────────────────┘
                                                   │
                                          ┌────────▼────────┐
                                          │   Proveedores   │
                                          │   WhatsApp      │
                                          └─────────────────┘
```

---

## 1. Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| Runtime | Node.js 22 |
| Framework | Express 4.18 |
| Base de datos local | better-sqlite3 11.7 (SQLite) |
| ERP | mssql 12.2 → SQL Server `BD_SEG_QCUTE` |
| IA | @anthropic-ai/sdk 0.24 → Claude Haiku |
| WhatsApp | whatsapp-web.js 1.26 (sesión QR local) |
| Excel | xlsx 0.18 |
| Archivos | multer 1.4 |
| HTTP externo | node-fetch 2.7 |

---

## 2. Arranque — src/index.js

Al iniciar el servidor se ejecutan en orden:

1. `require("./models/db")` — crea/migra todas las tablas SQLite
2. Registra todas las rutas REST
3. `iniciarCliente()` — conecta WhatsApp (escaneo QR)
4. `iniciarRecordatorios(enviarMensajeReal)` — scheduler CxP cada hora
5. `iniciarScheduler(enviarMensajeReal)` — scheduler OC, dispara a las 10AM Colombia

---

## 3. Base de datos — SQLite (`makabot.db`)

### Tablas

| Tabla | Descripción | Columnas clave |
|-------|-------------|----------------|
| `proveedores` | Directorio de proveedores | nit (UNIQUE), nombre, telefono, telefono2, banco, cuenta, tipo_cuenta, titular_nombre, titular_id, descuento_cacharro, descuento_joyeria, descuento_activo, flete_condicion, plazo_dias, soporte_iva, net_iva, ciudad |
| `facturas` | Facturas importadas desde Excel | numero_factura, proveedor_nit, valor_factura, descuento_pronto_pago, flete, valor_final, valor_proveedor, origen_valor, fecha_factura, fecha_vencimiento, estado |
| `conversaciones` | Historial de mensajes | proveedor_nit, mensaje_enviado, respuesta, estado |
| `estados_conversacion` | Estado activo por proveedor | proveedor_nit (PK), estado, datos_parciales, numero_cuenta |
| `cuentas` | Saldos de cuentas internas | nombre (UNIQUE), saldo |
| `gastos_semana` | Gastos operativos | categoria, descripcion, valor, semana |
| `pagos` | Historial de archivos de pago | proveedor_nit, valor_pago, banco, cuenta, estado, archivo_generado |
| `cuentas_bancarias` | Cuentas bancarias por proveedor | proveedor_nit, banco, tipo_cuenta, numero_cuenta, titular_nombre, titular_id, valor_asignado, activa |
| `facturas_erp_ajustes` | Ajustes manuales sobre facturas del ERP | idreg (PK), incluir_pago, flete, fecha_vencimiento_override, descuento, proveedor_nit_override |
| `soportes_pago` | Comprobantes de pago | proveedor_nit, facturas, valor, fecha_pago, archivo_path, mime_type, notificado |
| `notificaciones_pago` | Control de recordatorios CxP | proveedor_nit, facturas, total, recordatorios_enviados, respondido, ultimo_recordatorio |
| `presupuesto_ventas` | Presupuesto mensual por tienda | codalm, anio, mes, presupuesto — UNIQUE(codalm, anio, mes) |
| `solicitudes_pdf_compra` | Flujo de OC de QCUTE 360 | oc_id (UNIQUE), numero_orden, proveedor_nit, telefono, etapa, pdf_recibido, guia_recibida, etapa_guia, excluir, ultimo_recordatorio |

---

## 4. Rutas API

### `/facturas`

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/upload` | Importar Excel de facturas (procesa y guarda en SQLite) |
| GET | `/` | Listar facturas con filtros (`vencimiento_hasta`, `estado`) |
| GET | `/agrupadas` | Facturas agrupadas por proveedor (`solo_incluir=1`) |
| GET | `/vencimientos` | Facturas en tiempo real desde ERP SQL Server + ajustes locales |
| POST | `/analizar-imagen` | Analizar imagen/PDF con Claude para extraer datos |
| POST | `/confirmar-soporte` | Guardar soporte e notificar proveedor por WhatsApp |
| PUT | `/:id/valor-proveedor` | Actualizar valor con el informado por el proveedor |
| PATCH | `/:id/ajustar` | Editar flete o fecha de vencimiento |
| PATCH | `/:id/corregir-proveedor` | Corregir NIT/nombre de factura ERP |
| PATCH | `/:id/incluir` | Marcar/desmarcar para pago (`incluir_pago`) |
| PATCH | `/incluir-lote` | Marcar múltiples facturas en un solo request |

### `/proveedores`

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/upload` | Importar Excel de proveedores (INSERT/UPDATE) |
| GET | `/` | Listar todos los proveedores |
| GET | `/:nit` | Obtener proveedor por NIT |
| POST | `/` | Crear proveedor manualmente |
| PUT | `/:nit` | Actualizar proveedor completo |
| PUT | `/:nit/bancario` | Actualizar datos bancarios |
| PUT | `/:nit/descuento` | Cambiar descuento activo (cacharro/joyeria) |
| POST | `/:nit/recalcular-facturas` | Recalcular descuentos en facturas pendientes |

### `/mensajes`

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/generar` | Generar y enviar mensajes WhatsApp a proveedores seleccionados |
| POST | `/responder` | Procesar respuesta del proveedor con IA |
| POST | `/recordatorio` | Enviar recordatorio inmediato a un proveedor |
| GET | `/historial` | Historial de conversaciones (`?nit=`) |

### `/pagos`

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/generar` | Generar Excel de pagos (`fecha_pago`, `vencimiento_hasta`) |
| GET | `/descargar/:filename` | Descargar archivo de pagos generado |
| GET | `/historial` | Historial de archivos generados |

### `/fondos`

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/cuentas` | Listar cuentas con saldos |
| PUT | `/cuentas/:id` | Actualizar saldo de cuenta |
| GET | `/gastos` | Listar gastos por semana |
| POST | `/gastos` | Crear gasto |
| PUT | `/gastos/:id` | Actualizar gasto |
| DELETE | `/gastos/:id` | Eliminar gasto |
| GET | `/resumen` | Total fondos vs total a pagar |

### `/soportes`

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/upload` | Subir comprobante y notificar proveedor |
| POST | `/analizar-ia` | Analizar imagen/PDF con Claude |
| GET | `/` | Todos los soportes |
| GET | `/proveedor/:nit` | Soportes de un proveedor |
| PUT | `/:id` | Actualizar datos del soporte |
| POST | `/analizar-archivo/:id` | Re-analizar archivo guardado con IA |
| GET | `/ver/:filename` | Ver/descargar archivo de soporte |

### `/cxp`

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/` | Facturas pendientes del ERP (`vencidas=1`, `nit=`) |
| GET | `/resumen` | Resumen agrupado por proveedor con totales |
| GET | `/buscar` | Búsqueda por nombre o número de factura (`q=`) |

### `/inventario`

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/` | Dashboard inventario por tienda (`dias=60`, `codalm=`) |
| GET | `/detalle` | Movimientos de un artículo (`codalm`, `codins`, `dias`) |
| GET | `/tiendas` | Lista de tiendas disponibles |

### `/ventas`

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/` | Reporte de ventas (`desde`, `hasta`, `agrupacion`, `codalm`) |

### `/compras` (integración QCUTE 360)

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/nueva-orden` | Webhook: nueva OC desde Supabase/QCUTE 360 |
| GET | `/solicitudes` | Lista de solicitudes (`pendientes=1`) |
| PATCH | `/solicitudes/:id/excluir` | Toggle excluir OC del flujo |
| GET | `/pdf/:id` | Descargar PDF guardado de solicitud |
| POST | `/enviar-recordatorio` | Recordatorio manual de OC (`nit` o `nombre`) |

### `/presupuesto`

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/` | Presupuestos por tienda (`anio`, `mes`) |
| PUT | `/` | Crear o actualizar presupuesto |

### `/webhook`

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/enviar-manual` | Envío manual de WhatsApp (`telefono`, `mensaje`) |
| GET | `/whatsapp/qr` | Retorna QR actual en base64 para escanear |

---

## 5. Servicios

### `claudeService.js` — Inteligencia Artificial

Modelo usado: `claude-haiku-4-5-20251001`

| Función | Propósito |
|---------|-----------|
| `generarMensajeProveedor()` | Mensaje inicial con detalle de facturas a pagar |
| `generarMensajesLote()` | Genera mensajes para múltiples proveedores |
| `responderProveedor()` | Responde inteligentemente al proveedor según contexto |
| `analizarImagenProveedor()` | Analiza imagen/PDF: detecta tipo, extrae facturas y valores |
| `extraerDatosCuenta()` | Extrae datos bancarios de texto libre |
| `extraerDatosCuentaImagen()` | Extrae datos bancarios de imagen/PDF |
| `extraerDatosSoporte()` | Extrae datos de comprobante de pago (caption + imagen) |

Todos los parseos de JSON usan `safeParseJSON()` — extractor con conteo de llaves para evitar fallos si Claude agrega texto extra.

---

### `whatsappClient.js` — Sesión WhatsApp

| Función | Propósito |
|---------|-----------|
| `iniciarCliente()` | Inicia cliente, genera QR, maneja reconexión |
| `getClient()` | Singleton del cliente activo |
| `getStatus()` | Estado: `disconnected` / `qr_ready` / `connected` |
| `getQR()` | QR actual en base64 |
| `onMessage(handler)` | Registra handler de mensajes entrantes |

Autenticación: sesión local (`LocalAuth`) — no requiere Meta Developers.

---

### `whatsappService.js` — Envío de mensajes

| Función | Propósito |
|---------|-----------|
| `enviarMensajeReal(tel, msg)` | Envía texto por WhatsApp |
| `enviarDocumento(tel, buffer, mime, filename, caption)` | Envía archivo adjunto |
| `descargarMedia(msg)` | Descarga media de mensaje entrante |
| `enviarMensajesLote(lista)` | Envío en lote + registro en conversaciones |
| `getHistorialConversaciones(nit)` | Historial de conversaciones por proveedor |

---

### `sqlServerService.js` — ERP SQL Server

**Conexión:** `BD_SEG_QCUTE` en `localhost:2987`

**Tablas consultadas:**

| Tabla ERP | Uso |
|-----------|-----|
| `CxP_Facturas f` | Facturas pendientes de pago |
| `Cnt_Terceros t` | Nombre y NIT del proveedor |
| `Ven_Facturas` | Facturas de ventas |
| `Gen_Almacenes` | Tiendas/almacenes |
| `Alm_Kardex` | Movimientos de inventario |
| `Alm_Invent` | Stock actual por artículo |

| Función | Propósito |
|---------|-----------|
| `getCuentasPorPagar()` | Facturas con `estado=''` y saldo pendiente > 0 |
| `getResumenCxP()` | Totales agrupados por proveedor |
| `buscarFacturasProveedor(nit)` | Búsqueda por NIT o nombre |
| `getReporteVentas(params)` | Ventas por período, tienda y agrupación |

**Filtro clave CxP:** `f.estado = '' AND (f.ValNeto - f.ValAbo) > 0`

---

### `recordatorioService.js` — Scheduler CxP

Recordatorios automáticos cuando el proveedor no responde a la notificación de pago.

- **Ventana de envío:** 9AM–11AM hora Colombia
- **Frecuencia:** Verifica cada hora
- **Espera entre recordatorios:** 24h
- **Máximo recordatorios:** 3 por ciclo de pago

| Función | Propósito |
|---------|-----------|
| `iniciarRecordatorios(fn)` | Inicia scheduler inyectando función de envío |
| `registrarNotificacion(datos)` | Registra proveedor para recordatorio |
| `marcarRespondido(nit)` | Cancela recordatorios pendientes |
| `enviarRecordatorioInmediato(datos)` | Recordatorio manual sin esperar scheduler |

---

### `solicitudPdfService.js` — Scheduler OC (QCUTE 360)

Gestiona el flujo completo de comunicación con proveedores para cada Orden de Compra.

**Flujo de etapas:**

```
Etapa 0 → OC registrada, sin mensaje aún
Etapa 1 → Mensaje inicial (al crear la OC, inmediato)
Etapa 2 → Primera solicitud de factura/remisión (24h sin doc)
Etapa 2+ → Recordatorio diario hasta recibir factura
pdf_recibido = 1
Etapa guía 0 → Sin solicitud de guía aún
Etapa guía 1 → Primera solicitud de guía (24h desde PDF recibido)
Etapa guía 1+ → Recordatorio diario hasta recibir en tienda
guia_recibida = 1 → FIN del flujo
```

- **Scheduler diario:** 10AM hora Colombia
- **Sincronización Supabase:** cada 30 min (marca OCs cerradas)
- **Archivos PDF guardados en:** `/pdfs_compras/{nit}_{nombre}/OC{num}_{ts}.pdf`

| Función | Propósito |
|---------|-----------|
| `registrarOrden(datos)` | Registra OC nueva y envía etapa 1 |
| `iniciarScheduler(fn)` | Inicia scheduler con función de envío |
| `registrarPdfRecibido(nit, nombre, buffer, mime)` | Guarda PDF en disco y avanza etapa |
| `registrarGuiaRecibida(nit, nombre, texto)` | Marca OC como recibida, cierra en Supabase |
| `enviarOCInmediato(nit, nombre)` | Recordatorio manual para una OC |
| `sincronizarOrdenes()` | Consulta Supabase y marca OCs cerradas |
| `getSolicitudes(opts)` | Lista solicitudes para el panel |
| `toggleExcluir(id, excluir)` | Excluir OC del flujo de mensajes |

---

### `facturasService.js` — Importación de facturas

| Función | Propósito |
|---------|-----------|
| `procesarFacturasExcel(buffer)` | Procesa Excel flexible (múltiples formatos de columna) |
| `getFacturasPendientes()` | Facturas en estado pendiente |
| `getFacturasAgrupadas()` | Agrupadas por proveedor con totales |

---

### `proveedoresService.js` — CRUD proveedores

| Función | Propósito |
|---------|-----------|
| `procesarProveedoresExcel(buffer)` | Importar desde Excel (INSERT OR REPLACE) |
| `getAllProveedores()` | Listar todos |
| `getProveedorByNit(nit)` | Por NIT |
| `updateBancario(nit, datos)` | Actualizar cuenta bancaria |
| `updateDescuentoActivo(nit, tipo)` | Cambiar entre cacharro/joyeria |
| `updateProveedor(nit, datos)` | Actualización completa |
| `getDescuentoActivoValue(nit)` | Tasa de descuento vigente |
| `recalcularFacturasPendientes(nit)` | Recalcular `valor_final` con nuevo descuento |

---

### `soportesService.js` — Comprobantes de pago

| Función | Propósito |
|---------|-----------|
| `guardarSoporte(datos, buffer, mime)` | Guarda archivo en disco + registro en BD |
| `buscarSoporteProveedor(nit)` | Soporte más reciente del proveedor |
| `getSoportesPorProveedor(nit)` | Todos los soportes de un proveedor |
| `getTodosSoportes()` | Todos los soportes del sistema |

Archivos en: `/soportes/soporte_{nit}_{timestamp}.{ext}`

---

### `pagosService.js` — Generación de pagos

| Función | Propósito |
|---------|-----------|
| `generarArchivoPagos(params)` | Excel con facturas agrupadas por proveedor y cuentas |
| `getPagosHistorial()` | Historial de archivos generados |

---

### `inventarioService.js` — Inventario ERP

| Función | Propósito |
|---------|-----------|
| `getDashboardInventario(params)` | Entradas, ventas y stock por tienda |
| `getDetalleArticulo(params)` | Movimientos de un artículo específico |
| `getTiendas()` | Lista de almacenes del ERP |

---

## 6. Utilidades

| Archivo | Función | Propósito |
|---------|---------|-----------|
| `utils/excelValidator.js` | `validateExcelFile()` | Valida MIME type y tamaño máx 10MB |
| `utils/phoneNormalizer.js` | `normalizePhone()` | Normaliza número colombiano → `573XXXXXXXXX` |

---

## 7. Flujos principales

### A. Cuentas por Pagar (CxP)

```
ERP SQL Server
    │ getCuentasPorPagar()
    ▼
Dashboard web (tabla vencimientos)
    │ Usuario marca facturas para pago
    │ PATCH /facturas/:id/incluir
    ▼
POST /mensajes/generar
    │ generarMensajeProveedor() → Claude
    │ enviarMensajesLote() → WhatsApp
    ▼
Proveedor responde por WhatsApp
    │ webhook.js onMessage()
    │ responderProveedor() → Claude
    │ extrae: descuento, flete, datos bancarios
    ▼
recordatorioService (si no responde en 24h)
    │ máx 3 recordatorios, ventana 9-11AM
    ▼
GET /pagos/generar → Excel de pagos
```

### B. Órdenes de Compra QCUTE 360 (OC)

```
QCUTE 360 crea OC en Supabase
    │ POST /compras/nueva-orden (webhook)
    ▼
registrarOrden() → etapa 0
    │ Inmediatamente: enviarEtapa1() → WhatsApp
    ▼
24h sin factura → enviarEtapa2() (scheduler 10AM)
    │ Recordatorios diarios hasta recibir
    ▼
Proveedor envía PDF/imagen → webhook onMessage()
    │ registrarPdfRecibido() → guarda en disco
    │ WhatsApp: "gracias, esperamos la guía"
    ▼
24h después → enviarSolicitudGuia()
    │ Recordatorios diarios hasta recibir
    ▼
Proveedor envía guía → registrarGuiaRecibida()
    │ cerrarOCenSupabase() → estado = "cerrada"
    ▼
FIN del flujo
```

### C. Análisis de Soportes con IA

```
Usuario sube comprobante → POST /soportes/analizar-ia
    │ extraerDatosSoporte() → Claude (caption + imagen)
    │ Retorna: proveedor_nit, facturas, valor, fecha_pago
    ▼
Usuario confirma → POST /soportes/upload
    │ guardarSoporte() → /soportes/{nit}_{ts}.ext
    │ WhatsApp al proveedor: "recibimos su pago"
    ▼
Registro en soportes_pago (notificado = 1)
```

---

## 8. Integraciones externas

| Servicio | Librería | Uso |
|----------|----------|-----|
| **Claude API** | `@anthropic-ai/sdk` | Análisis de documentos, generación de mensajes |
| **SQL Server ERP** | `mssql` | CxP_Facturas, inventario, ventas |
| **WhatsApp** | `whatsapp-web.js` | Envío/recepción mensajes (sesión QR local) |
| **Supabase** | `node-fetch` REST | Webhook OC + sincronizar estados |

---

## 9. Variables de entorno

```env
PORT=3000
CLAUDE_API_KEY=sk-ant-api03-...
SERVER_URL=http://217.71.206.34:3000
NUMEROS_INTERNOS=3134880672        # números del equipo interno (ignora sus mensajes)

# SQL Server ERP
SQLSERVER_HOST=localhost
SQLSERVER_PORT=2987
SQLSERVER_USER=js
SQLSERVER_PASSWORD=JustR34d#
SQLSERVER_DB=BD_SEG_QCUTE

# WhatsApp (no usados activamente — sesión local)
WHATSAPP_TOKEN=...
WHATSAPP_PHONE_ID=...
WHATSAPP_VERIFY_TOKEN=makabot2024
```

---

## 10. Frontend — Dashboard web

**Archivo:** `public/index.html` (HTML + CSS + JS vanilla)
**Acceso:** `http://217.71.206.34:3000`

### Pestañas principales

| Pestaña | Funcionalidad |
|---------|---------------|
| Vencimientos | Tabla de facturas ERP, marcar para pago, ajustar flete/fecha |
| Proveedores | CRUD, subir Excel, datos bancarios |
| Mensajes | Generar y enviar mensajes WhatsApp, historial de conversaciones |
| Pagos | Generar archivo Excel de pagos, descargar historial |
| Fondos | Saldos de cuentas, gastos semanales, resumen |
| Soportes | Subir comprobantes, análisis IA, notificar proveedores |
| Compras | OC de QCUTE 360, estado por etapa, recordatorios manuales |
| Inventario | Dashboard por tienda, movimientos por artículo |
| Ventas | Reporte por período y tienda vs. presupuesto |
| QR | Escanear QR para conectar WhatsApp |

---

## 11. Despliegue

**Servidor:** `217.71.206.34` · **Proceso:** NSSM (Windows Service)
**Comando local:** `python3 deploy_bot_compras.py`

```
Flujo de deploy:
1. Crear ZIP con archivos modificados (src/ + public/)
2. SFTP → C:\makabot\deploy_bot_compras.zip
3. Expand-Archive -Force (sobreescribe solo los archivos del ZIP)
4. nssm stop MAKABOT → taskkill /F /IM node.exe (si hay zombies)
5. nssm start MAKABOT
6. Verificar puerto 3000 activo
```

**Logs:** `C:\makabot\nssm_out.log` / `C:\makabot\nssm_err.log`
(NSSM rota logs automáticamente cada ~5MB)
