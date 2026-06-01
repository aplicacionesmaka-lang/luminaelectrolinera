/**
 * recordatorioService.js
 * Envía recordatorios automáticos a proveedores que no han respondido
 * en 24h después de recibir la notificación de pago.
 * Máximo 2 recordatorios por notificación.
 */
const db = require("../models/db");

const MAX_RECORDATORIOS = 3;   // máximo 3 recordatorios por ciclo de pago
const HORAS_ESPERA      = 24;  // recordatorio cada 24h si no responde
const INTERVALO_CHECK   = 60 * 60 * 1000; // verificar cada hora

let _enviarFn = null; // se inyecta al iniciar para evitar dependencias circulares

/**
 * Registra una notificación de pago enviada a un proveedor.
 * Llamar desde whatsappService.enviarMensajesLote justo después de enviar.
 */
function registrarNotificacion({ proveedor_nit, proveedor_nombre, telefono, facturas, total }) {
  // Si ya existe una notificación reciente (últimas 48h) sin responder, no duplicar
  const existente = db.prepare(`
    SELECT id FROM notificaciones_pago
    WHERE proveedor_nit = ? AND respondido = 0
      AND created_at >= datetime('now', '-48 hours')
  `).get(proveedor_nit);

  if (existente) return; // ya hay una activa

  db.prepare(`
    INSERT INTO notificaciones_pago
      (proveedor_nit, proveedor_nombre, telefono, facturas, total)
    VALUES (?, ?, ?, ?, ?)
  `).run(proveedor_nit, proveedor_nombre || "", telefono || "", facturas || "", total || 0);

  console.log(`📋 Notificación registrada para recordatorio: ${proveedor_nombre}`);
}

/**
 * Marca que un proveedor respondió — cancela los recordatorios pendientes.
 */
function marcarRespondido(proveedor_nit) {
  db.prepare(`
    UPDATE notificaciones_pago
    SET respondido = 1
    WHERE proveedor_nit = ? AND respondido = 0
  `).run(proveedor_nit);
}

/**
 * Verifica y envía recordatorios a quienes no han respondido.
 */
async function procesarRecordatorios() {
  if (!_enviarFn) return;

  const ahora = new Date();
  // Hora Colombia (UTC-5)
  const horaCol = ((ahora.getUTCHours() - 5) + 24) % 24;
  console.log(`\n⏰ Verificando recordatorios... ${ahora.toLocaleString("es-CO")} (hora Colombia: ${horaCol}:${String(ahora.getUTCMinutes()).padStart(2,"0")})`);

  // Solo enviar entre las 9AM y 11AM hora Colombia para no molestar fuera de horario laboral
  if (horaCol < 9 || horaCol >= 11) {
    console.log("   ⏸ Fuera de la ventana de envío (9AM–11AM Colombia). Se reintentará en la siguiente verificación.");
    return;
  }

  const pendientes = db.prepare(`
    SELECT * FROM notificaciones_pago
    WHERE respondido = 0
      AND recordatorios_enviados < ?
      AND (
        -- Primer recordatorio: 24h después de la notificación original
        (recordatorios_enviados = 0 AND created_at <= datetime('now', '-${HORAS_ESPERA} hours'))
        OR
        -- Recordatorios siguientes: 24h después del último recordatorio
        (recordatorios_enviados > 0 AND ultimo_recordatorio <= datetime('now', '-${HORAS_ESPERA} hours'))
      )
  `).all(MAX_RECORDATORIOS);

  if (pendientes.length === 0) {
    console.log("   Sin recordatorios pendientes.");
    return;
  }

  for (const notif of pendientes) {
    try {
      const numRecordatorio = notif.recordatorios_enviados + 1;

      // Verificar si ya completó la validación — no enviar recordatorio
      const yaCompleto = db.prepare(
        "SELECT id FROM conversaciones WHERE proveedor_nit = ? AND estado = 'validacion_completa' AND created_at >= datetime('now', '-7 days') LIMIT 1"
      ).get(notif.proveedor_nit);
      if (yaCompleto) {
        db.prepare("UPDATE notificaciones_pago SET respondido = 1 WHERE id = ?").run(notif.id);
        console.log(`   ✅ ${notif.proveedor_nombre} ya completó validación — notificación cerrada`);
        continue;
      }

      // Determinar qué le falta específicamente a este proveedor
      const tieneCuenta = db.prepare(
        "SELECT id FROM cuentas_bancarias WHERE proveedor_nit = ? AND activa = 1 LIMIT 1"
      ).get(notif.proveedor_nit);
      const notaDescuento = db.prepare(
        "SELECT respuesta FROM conversaciones WHERE proveedor_nit = ? AND estado = 'nota_descuento' ORDER BY created_at DESC LIMIT 1"
      ).get(notif.proveedor_nit);
      const notaFlete = db.prepare(
        "SELECT respuesta FROM conversaciones WHERE proveedor_nit = ? AND estado = 'nota_flete' ORDER BY created_at DESC LIMIT 1"
      ).get(notif.proveedor_nit);

      const pendientesCuenta  = !tieneCuenta;
      const pendienteDescuento = !notaDescuento;
      const pendienteFlete     = !notaFlete;

      const facturasList = notif.facturas
        ? notif.facturas.split(",").map(f => `🧾 *${f.trim()}*`).join("\n")
        : "";
      const totalFmt = notif.total
        ? `$${Number(notif.total).toLocaleString("es-CO")} COP`
        : "";

      const hora = new Date().getHours();
      const saludoHora = hora < 12 ? "Buenos días" : hora < 18 ? "Buenas tardes" : "Buenas noches";
      const nombre = (notif.proveedor_nombre || "").split(" ")[0];

      let mensaje = `${saludoHora}, ${nombre}. 😊\n\n`;
      mensaje += `Le contacta el equipo de Tesorería de *MAKA QCUTE SAS* con un recordatorio sobre el pago de sus facturas.\n\n`;

      if (facturasList) mensaje += `📋 *Facturas en proceso:*\n${facturasList}\n`;
      if (totalFmt)     mensaje += `\n💰 *Total a pagar: ${totalFmt}*\n`;

      // Solo pedir lo que aún falta
      const itemsPendientes = [];
      if (pendienteDescuento) itemsPendientes.push(`✔️ Confirmar si aplica *descuento* por pronto pago o si el valor es el definitivo`);
      if (pendienteFlete)     itemsPendientes.push(`✔️ Informar valor del *flete* en pesos (o confirmar que no aplica según la negociación)`);
      if (pendientesCuenta)   itemsPendientes.push(`✔️ *Datos bancarios* completos: banco, tipo de cuenta, número de cuenta, nombre del titular y número de identificación`);

      if (itemsPendientes.length === 0) {
        // Todo capturado pero no marcado como completo — avisar que se revisará
        mensaje += `\nTenemos la información registrada y estamos procesando su pago. Si tiene alguna consulta, con gusto le atendemos.\n`;
      } else {
        mensaje += `\nPara procesar el pago necesitamos que nos confirme:\n\n`;
        mensaje += itemsPendientes.join("\n");
        mensaje += `\n\n⚠️ Sin esta información no podremos incluirle en la programación de pago. ⏳`;
      }

      mensaje += `\n\n¡Que Dios les bendiga y prospere su negocio! 🙏\n\n_MakaBot - Tesorería MAKA QCUTE SAS_`;

      // Enviar por WhatsApp
      if (notif.telefono) {
        await _enviarFn(notif.telefono, mensaje);
        console.log(`   📤 Recordatorio #${numRecordatorio} enviado a ${notif.proveedor_nombre} (${notif.telefono})`);
      }

      // Registrar en conversaciones
      db.prepare(`
        INSERT INTO conversaciones (proveedor_nit, mensaje_enviado, respuesta, estado)
        VALUES (?, ?, ?, 'recordatorio_pago')
      `).run(notif.proveedor_nit, `[RECORDATORIO #${numRecordatorio}]`, mensaje);

      // Actualizar contador
      db.prepare(`
        UPDATE notificaciones_pago
        SET recordatorios_enviados = recordatorios_enviados + 1,
            ultimo_recordatorio = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(notif.id);

    } catch (err) {
      console.error(`   ❌ Error recordatorio ${notif.proveedor_nombre}:`, err.message);
    }
  }
}

/**
 * Envía recordatorio inmediato a un proveedor y lo registra para ciclos futuros de 72h.
 * @param {{ proveedor_nit, proveedor_nombre, telefono, facturas, total }} datos
 */
async function enviarRecordatorioInmediato({ proveedor_nit, proveedor_nombre, telefono, facturas, total }) {
  if (!_enviarFn) throw new Error("WhatsApp no inicializado");

  const facturasList = facturas
    ? facturas.split(",").map(f => `🧾 *${f.trim()}*`).join("\n")
    : "";
  const totalFmt = total
    ? `$${Number(total).toLocaleString("es-CO")} COP`
    : "";

  let mensaje = `Hola 👋 ¡Que Dios les bendiga!\n\n`;
  mensaje += `Le escribe el equipo de Tesorería de *QCUTE SAS* 😊\n\n`;
  mensaje += `Aún estamos esperando la información necesaria para procesar el pago de las siguientes facturas:\n\n`;
  if (facturasList) mensaje += `${facturasList}\n`;
  if (totalFmt)     mensaje += `\n💰 *Total estimado: ${totalFmt}*\n`;
  mensaje += `\nPor favor ayúdanos confirmando:\n`;
  mensaje += `✔️ *Descuento* aplicado (o confirmar que no aplica)\n`;
  mensaje += `✔️ *Flete* (o confirmar que no aplica)\n`;
  mensaje += `✔️ *Datos bancarios:* Banco, tipo de cuenta, número, titular y cédula/NIT\n`;
  mensaje += `\nSin esta información no podemos procesar el pago. ⏳\n\n`;
  mensaje += `¡Que Dios les bendiga y prospere su negocio! 🙏✨\n\n_MakaBot - Tesorería QCUTE SAS_`;

  if (telefono) {
    await _enviarFn(telefono, mensaje);
    console.log(`📤 Recordatorio inmediato enviado a ${proveedor_nombre} (${telefono})`);
  }

  // Registrar conversación
  db.prepare(`
    INSERT INTO conversaciones (proveedor_nit, mensaje_enviado, respuesta, estado)
    VALUES (?, ?, ?, 'recordatorio_pago')
  `).run(proveedor_nit, `[RECORDATORIO INMEDIATO]`, mensaje);

  // Registrar / actualizar en notificaciones_pago para ciclos futuros cada 72h
  const existente = db.prepare(`
    SELECT id FROM notificaciones_pago
    WHERE proveedor_nit = ? AND respondido = 0
  `).get(proveedor_nit);

  if (existente) {
    // Resetear el contador de tiempo para que el próximo sea en 72h
    db.prepare(`
      UPDATE notificaciones_pago
      SET ultimo_recordatorio = CURRENT_TIMESTAMP,
          recordatorios_enviados = recordatorios_enviados + 1
      WHERE id = ?
    `).run(existente.id);
  } else {
    db.prepare(`
      INSERT INTO notificaciones_pago
        (proveedor_nit, proveedor_nombre, telefono, facturas, total, recordatorios_enviados, ultimo_recordatorio)
      VALUES (?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
    `).run(proveedor_nit, proveedor_nombre || "", telefono || "", facturas || "", total || 0);
  }

  return mensaje;
}

/**
 * Inicia el scheduler de recordatorios.
 * @param {Function} enviarFn - función enviarMensajeReal(telefono, mensaje)
 */
function iniciarRecordatorios(enviarFn) {
  _enviarFn = enviarFn;
  console.log(`⏰ Scheduler de recordatorios activo (cada hora, recordatorio cada ${HORAS_ESPERA}h si no responde)`);
  // Primera verificación al arrancar (con delay de 30s para que WhatsApp conecte)
  setTimeout(procesarRecordatorios, 30 * 1000);
  // Luego cada hora
  setInterval(procesarRecordatorios, INTERVALO_CHECK);
}

module.exports = { iniciarRecordatorios, registrarNotificacion, marcarRespondido, enviarRecordatorioInmediato };
