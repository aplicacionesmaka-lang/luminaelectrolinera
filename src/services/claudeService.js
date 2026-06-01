const Anthropic = require("@anthropic-ai/sdk");

const client = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY,
});

/**
 * Extrae y parsea el primer objeto JSON válido de un texto.
 * Usa conteo de llaves para evitar capturar contenido extra tras el JSON.
 */
function safeParseJSON(text) {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === "\\" && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return JSON.parse(text.slice(start, i + 1));
      }
    }
  }
  return null;
}

/**
 * Llama a la API de Claude con reintentos automáticos en caso de rate limit (429).
 */
async function callWithRetry(params, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await client.messages.create(params);
    } catch (err) {
      const is429 = err?.status === 429 || (err?.message || "").includes("rate_limit");
      if (is429 && attempt < maxRetries) {
        const wait = attempt * 8000; // 8s, 16s, 24s
        console.warn(`⏳ Rate limit Claude (intento ${attempt}/${maxRetries}) — esperando ${wait/1000}s...`);
        await new Promise(r => setTimeout(r, wait));
      } else {
        throw err;
      }
    }
  }
}

/**
 * Genera un mensaje de WhatsApp inicial para un proveedor
 */
async function generarMensajeProveedor({
  nombreProveedor,
  nitProveedor,
  facturas,
  totalPagar,
  banco,
  cuenta,
  tipo_cuenta,
  titular_nombre,
  titular_id,
}) {
  const hayFletesPendientes = facturas.some((f) => !Number(f.flete));
  const solicitudFlete = hayFletesPendientes
    ? `\nIMPORTANTE: Hay facturas sin flete registrado. El flete es un valor que SE RESTA del total (es un descuento que aplica QCUTE). Solicita AMABLEMENTE que nos informen el valor del flete para descontarlo del total a pagar.`
    : ``;

  const detalleFacturas = facturas
    .map((f) => {
      const desc  = Number(f.descuento_pronto_pago) || 0;
      const flete = Number(f.flete) || 0;
      // Calcular % sobre saldo_pendiente (base real del descuento), no sobre valor_bruto del ERP
      const base  = Number(f.saldo_pendiente) || Number(f.valor_factura) || 0;
      const pct   = desc > 0 && base > 0
        ? ` (${((desc / base) * 100).toFixed(0)}%)`
        : '';
      let linea = `🧾 *Factura ${f.numero_factura}*\n`;
      linea += `   • Saldo pendiente: $${base.toLocaleString("es-CO")}\n`;
      if (desc > 0) linea += `   • Dto. pronto pago${pct}: -$${desc.toLocaleString("es-CO")}\n`;
      if (flete > 0) linea += `   • Flete (descuento): -$${flete.toLocaleString("es-CO")}\n`;
      else linea += `   • Flete: ⏳ _pendiente (esperamos su liquidación)_\n`;
      linea += `   💵 *Total a pagar: $${Number(f.valor_final).toLocaleString("es-CO")}*`;
      return linea;
    })
    .join("\n");

  // Detectar qué datos bancarios faltan
  const datosFaltantes = [];
  if (!banco) datosFaltantes.push("banco");
  if (!cuenta) datosFaltantes.push("número de cuenta");
  if (!tipo_cuenta) datosFaltantes.push("tipo de cuenta (Ahorros/Corriente)");
  if (!titular_nombre) datosFaltantes.push("nombre del titular de la cuenta");
  if (!titular_id) datosFaltantes.push("número de cédula/identificación del titular");

  const solicitudDatosBancarios = datosFaltantes.length > 0
    ? `\nIMPORTANTE: El proveedor NO tiene estos datos bancarios registrados: ${datosFaltantes.join(", ")}.
Debes solicitar AMABLEMENTE estos datos en el mensaje, explicando que son necesarios para realizar la transferencia bancaria.`
    : `\nDatos bancarios registrados: ${banco} - Cta ${tipo_cuenta} ${cuenta} a nombre de ${titular_nombre} (${titular_id}). NO necesitas pedirlos.`;

  const prompt = `Eres MakaBot, el asistente virtual de consolidación de cuentas por pagar de MAKA QCUTE SAS (NIT 901.883.025).

ROL: Eres formal, analítico y orientado a la validación financiera. Tu función es gestionar la comunicación de pagos con proveedores de manera estructurada y precisa.

Genera un mensaje de WhatsApp formal en español para notificar al proveedor sobre el pago programado de sus facturas.

Datos del proveedor:
- Nombre: ${nombreProveedor}
- NIT: ${nitProveedor}

Detalle de facturas a pagar:
${detalleFacturas}

Total a pagar: $${Number(totalPagar).toLocaleString("es-CO")} COP
${solicitudDatosBancarios}
${solicitudFlete}

El mensaje debe:
1. Saludar formalmente indicando que eres el equipo de Tesorería de MAKA QCUTE SAS
2. Listar las facturas como A), B), C), D)... con su valor bruto, descuento aplicado, descuento por flete y valor neto a pagar
3. Indicar el total consolidado a pagar
4. Solicitar confirmación de acuerdo con los valores presentados
5. Si hay facturas con flete pendiente, solicitar la liquidación del flete para recalcular el neto
6. Si faltan datos bancarios, solicitarlos de forma estructurada: banco, tipo de cuenta, número de cuenta, nombre del titular y número de identificación del titular
7. Mantener tono formal, claro y profesional. Sin desviarse del proceso de consolidación
8. Firmar como "MakaBot - Equipo de Tesorería MAKA QCUTE SAS"
9. Cerrar con una bendición breve
10. Máximo 400 palabras

Responde SOLO con el mensaje de WhatsApp, sin explicaciones adicionales.`;

  try {
    const response = await callWithRetry({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1200,
      messages: [{ role: "user", content: prompt }],
    });
    return response.content[0].text;
  } catch (err) {
    console.warn("⚠️  Claude no disponible, usando plantilla:", err.message?.slice(0,80));
    return generarMensajePlantilla({ nombreProveedor, facturas, totalPagar, banco, cuenta, tipo_cuenta, titular_nombre, titular_id });
  }
}

/**
 * Plantilla de respaldo cuando Claude no está disponible
 */
function generarMensajePlantilla({ nombreProveedor, facturas, totalPagar, banco, cuenta, tipo_cuenta, titular_nombre, titular_id }) {
  const nombre = nombreProveedor.split(" ")[0];
  const hora   = new Date().getHours();
  const saludo = hora < 12 ? "Buenos días" : hora < 18 ? "Buenas tardes" : "Buenas noches";

  const letras = ["A", "B", "C", "D", "E", "F", "G", "H"];
  let msg = `${saludo},\n\n`;
  msg += `Les saluda el equipo de Tesorería de *MAKA QCUTE SAS* (NIT 901.883.025).\n\n`;
  msg += `En el marco de la consolidación de cuentas por pagar, les informamos que tenemos programado el pago de las siguientes facturas:\n\n`;

  facturas.forEach((f, i) => {
    const letra = letras[i] || String(i + 1);
    const desc  = Number(f.descuento_pronto_pago) || 0;
    const flete = Number(f.flete) || 0;
    msg += `*${letra}) Factura ${f.numero_factura}*\n`;
    msg += `   • Valor bruto: $${Number(f.valor_factura || f.valor_final).toLocaleString("es-CO")}\n`;
    if (desc > 0)  msg += `   • Descuento aplicado: -$${desc.toLocaleString("es-CO")}\n`;
    if (flete > 0) msg += `   • Descuento por flete: -$${flete.toLocaleString("es-CO")}\n`;
    else           msg += `   • Flete: ⏳ pendiente de liquidación\n`;
    msg += `   • *Total neto: $${Number(f.valor_final).toLocaleString("es-CO")}*\n\n`;
  });

  msg += `💰 *Total consolidado a pagar: $${Number(totalPagar).toLocaleString("es-CO")} COP*\n\n`;
  msg += `Solicitamos amablemente su confirmación de acuerdo con los valores presentados e indicarnos:\n\n`;
  msg += `✔️ ¿Los valores son correctos según su liquidación?\n`;
  msg += `✔️ Valor del flete en pesos (si aplica según la negociación)\n`;

  const tieneCuenta = banco && cuenta;
  if (!tieneCuenta) {
    msg += `✔️ Datos bancarios para la transferencia:\n`;
    msg += `   🏦 Banco\n`;
    msg += `   💳 Tipo de cuenta (Ahorros / Corriente)\n`;
    msg += `   🔢 Número de cuenta\n`;
    msg += `   👤 Nombre completo del titular\n`;
    msg += `   🪪 Número de identificación del titular\n`;
  } else {
    msg += `\n✅ Registramos la cuenta en *${banco}* (${tipo_cuenta} ${cuenta}) a nombre de ${titular_nombre}. Confirme si desea usar estos datos.\n`;
  }

  msg += `\n¡Que Dios les bendiga y prospere su negocio! 🙏\n\n_MakaBot - Tesorería MAKA QCUTE SAS_`;
  return msg;
}

/**
 * Responde a un mensaje del proveedor de forma inteligente,
 * guiando la conversación para obtener: descuento, flete y datos bancarios.
 */
async function responderProveedor({
  nombreProveedor,
  respuestaProveedor,
  totalCalculado,
  facturas,
  facturasNumerosStr = null,
  tieneDatosBancarios = false,
  descuentoConfirmado = null,
  fleteConfirmado = null,
}) {
  const detalleFacturas = facturas
    .map((f) => `- Factura ${f.numero_factura}${f.tienda ? ` (${f.tienda})` : ""}: $${Number(f.valor_final).toLocaleString("es-CO")}`)
    .join("\n");

  const numerosFacturas = facturasNumerosStr || facturas.map(f => f.numero_factura).join(", ");

  // Construir estado actual de la conversación
  const estadoActual = [];
  if (descuentoConfirmado) estadoActual.push(`✅ Descuento ya informado: ${descuentoConfirmado}`);
  else estadoActual.push(`⏳ Descuento: pendiente (preguntar si aplica algún descuento o confirmar que no hay)`);

  if (fleteConfirmado) estadoActual.push(`✅ Flete ya informado: ${fleteConfirmado}`);
  else estadoActual.push(`⏳ Flete: pendiente (preguntar valor del flete o confirmar que no aplica)`);

  if (tieneDatosBancarios) estadoActual.push(`✅ Datos bancarios: YA ESTÁN REGISTRADOS en el sistema — NO pedir de nuevo`);
  else estadoActual.push(`⏳ Datos bancarios: NO registrados — solicitar cuando se confirme el valor`);

  const infoFaltante = [];
  if (!descuentoConfirmado) infoFaltante.push("descuento (o confirmar que no aplica)");
  if (!fleteConfirmado) infoFaltante.push("flete (o confirmar que no aplica)");
  if (!tieneDatosBancarios) infoFaltante.push("datos bancarios completos");

  const prompt = `Eres MakaBot, el asistente virtual de consolidación de cuentas por pagar de MAKA QCUTE SAS (NIT 901.883.025).

ROL Y PERSONA:
Eres formal, analítico y orientado a la validación financiera. Tu función es gestionar la comunicación de pagos con proveedores siguiendo un proceso estructurado. Mantienes tono profesional y claro, sin desviarte del proceso de consolidación.

CONTEXTO DE LA EMPRESA:
- La empresa que paga es QCUTE SAS, NIT 901.883.025.
- Las tiendas ADM - PLAZA DEL SOL, ADM - LA 30 SANTA MARTA y MAKA ARRECIFES pertenecen a QCUTE SAS.
- MAKA QCUTE SAS era el nombre anterior. Ahora son empresas separadas.

CIERRE OBLIGATORIO: Siempre terminas con una bendición breve. Ej: "¡Que Dios les bendiga! 🙏"
FIRMA: "MakaBot - Equipo de Tesorería MAKA QCUTE SAS"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROVEEDOR: ${nombreProveedor}
FACTURAS PARA PAGO:
${detalleFacturas}
Total consolidado: $${Number(totalCalculado).toLocaleString("es-CO")} COP
Números de factura: ${numerosFacturas}

ESTADO ACTUAL DE LA CONVERSACIÓN:
${estadoActual.join("\n")}
${infoFaltante.length > 0 ? `\n🎯 PENDIENTE POR OBTENER: ${infoFaltante.join(" | ")}` : "\n🎯 VALIDACIÓN COMPLETA — no solicitar ningún dato adicional, no enviar más mensajes"}

⚠️ RESTRICCIONES ABSOLUTAS:
- NUNCA pidas datos bancarios si ya están registrados
- NUNCA pidas descuento si ya fue confirmado
- NUNCA pidas flete si ya fue confirmado
- Si no hay nada pendiente → confirmar brevemente que la información está completa y el pago será procesado. Despedirse. NO solicitar nada más.
- Si el proveedor dice "gracias", "ok", "listo", "recibido" y todo está completo → responder con confirmación breve y despedida. NO seguir el hilo.
- No aprobar modificaciones de descuento sin validación cruzada (indicar que se revisará la tabla)
- No cerrar el pago si faltan datos bancarios completos
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

MENSAJE DEL PROVEEDOR:
"${respuestaProveedor}"

INSTRUCCIONES DE RESPUESTA SEGÚN SITUACIÓN:

1. PROVEEDOR CONFIRMA ACUERDO:
   - Confirmar recepción formalmente
   - Si falta descuento: "¿Aplica algún descuento por pronto pago sobre esta liquidación, o el valor presentado es el definitivo?"
   - Si falta flete: "¿Aplica descuento por concepto de flete en esta negociación? De ser así, indíquenos el valor en pesos."
   - Si faltan datos bancarios: solicitar banco, tipo de cuenta, número de cuenta, nombre completo del titular y número de identificación del titular
   - Si todo está completo: confirmar que la información está validada y el pago será procesado. Fin de la interacción.
   - accion = "solicitar_datos_bancarios" si no tiene cuenta, "completado" si todo está listo

2. PROVEEDOR DICE QUE SU DESCUENTO ES DIFERENTE AL PRESENTADO:
   - Responder EXACTAMENTE: "Gracias por la observación. Verificaremos el descuento acordado en nuestra tabla de negociaciones y le comunicaremos a la brevedad. Por favor esté pendiente."
   - NO debatir ni confirmar ningún valor diferente al sistema
   - NO seguir pidiendo datos bancarios ni flete en este mismo mensaje — solo confirmar que se revisará
   - Anotar en nota_descuento: "Proveedor indica descuento diferente: [lo que dijo]"
   - accion = "escalar_humano"

3. PROVEEDOR NO RECONOCE LA FACTURA O DICE QUE NO ES SUYA / QUE NO CONOCE ESE NÚMERO:
   - Responder EXACTAMENTE: "Entendemos. Trasladaremos esta situación al equipo de tesorería para que valide la información con el área comercial. Le contactaremos una vez tengamos claridad. Disculpe el inconveniente."
   - NO pedir datos bancarios ni ningún otro dato — esto requiere revisión humana
   - Anotar en nota_descuento: "Proveedor no reconoce la factura"
   - accion = "escalar_humano"

4. PROVEEDOR DICE QUE NO HAY FLETES:
   - Responder: "De acuerdo, confirmaremos que no aplica flete según los términos de la negociación vigente."
   - Anotar en nota_flete: "Proveedor indica que no aplica flete"
   - Continuar solicitando lo que falte (descuento, datos bancarios)
   - accion = "ajustado_flete"

5. PROVEEDOR INFORMA FLETE CON VALOR:
   - Aceptar y anotar en nota_flete con el valor indicado
   - Continuar solicitando lo que falte
   - accion = "ajustado_flete"

6. PROVEEDOR ACEPTA PERO DATOS BANCARIOS INCOMPLETOS:
   - Identificar exactamente qué dato falta: nombre del titular O número de identificación
   - Solicitar SOLO el dato faltante de forma precisa
   - NO volver a pedir lo que ya se tiene
   - accion = "solicitar_datos_bancarios"

7. PROVEEDOR MENCIONA FACTURA O VALOR DIFERENTE AL SISTEMA:
   - Comparar el número de factura y/o valor que menciona el proveedor contra las facturas del sistema listadas arriba
   - Si hay diferencia (número distinto O valor mayor al sistema), responder FORMALMENTE:
     * Indicar que en nuestro sistema tenemos registrada la factura [X] por $[valor_sistema]
     * Indicar que el proveedor menciona la factura [Y] por $[valor_proveedor]
     * Solicitar que ambas partes validen: que el proveedor confirme con su equipo de cartera y que tesorería revisará por su parte
     * NO aprobar ni rechazar el pago hasta que se aclare la discrepancia
   - Guardar en nota_descuento: "DISCREPANCIA — Sistema: factura X por $Y. Proveedor: factura A por $B"
   - accion = "discrepancia"

8. MENSAJE AMBIGUO, CONFUSO O FUERA DEL ÁMBITO DE PAGOS (técnica, legal, comercial, saludo sin contexto):
   - NO inventar información ni hacer suposiciones
   - Responder: "Gracias por su mensaje. Lo trasladaremos al equipo de tesorería de QCUTE SAS para darle la atención adecuada. En breve se comunicarán con usted."
   - accion = "escalar_humano"

9. DOS CUENTAS BANCARIAS:
   - Validar que la suma de valores asignados = total a pagar
   - Si no coincide, pedir confirmación de montos
   - nota_cuentas con detalle de cada cuenta y valor asignado
   - accion = "dos_cuentas"

⚠️ REGLA CRÍTICA ANTI-INCOHERENCIA:
- Si no puedes identificar claramente a qué situación corresponde el mensaje del proveedor → SIEMPRE usar la acción "escalar_humano" con respuesta genérica de traslado al equipo
- NUNCA inventar valores, facturas o acuerdos que no estén en el sistema
- NUNCA pedir datos bancarios si el proveedor está cuestionando una factura o descuento

Responde SOLO con este JSON (sin texto adicional, sin markdown):
{
  "mensaje_respuesta": "mensaje WhatsApp formal y claro, con emoticones moderados y bendición al final",
  "valor_aceptado": número,
  "origen_valor": "proveedor" | "calculado",
  "accion": "completado" | "solicitar_datos_bancarios" | "ajustado_descuento" | "ajustado_flete" | "dos_cuentas" | "pendiente" | "discrepancia" | "escalar_humano" | "escalar_tesoreria",
  "nota_descuento": "detalle exacto del descuento informado o null",
  "nota_flete": "detalle exacto del flete o null",
  "nota_cuentas": "detalle de cuentas con valores si aplica o null"
}`;

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 900,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content[0].text.trim();
  const parsed = safeParseJSON(text);
  if (!parsed) throw new Error("Claude no devolvió JSON válido");
  return parsed;
}

/**
 * Analiza una imagen enviada por el proveedor (descuento, flete, valor)
 * @param {string} imageBase64
 * @param {string} mimeType
 */
async function analizarImagenProveedor(imageBase64, mimeType = "image/jpeg") {
  const prompt = `Eres un asistente de cuentas por pagar de MAKA QCUTE SAS.

La imagen puede ser:
A) Una liquidación de proveedor con detalle de factura, descuento y flete.
B) Un comprobante de transferencia bancaria / pago realizado.
C) Un catálogo de productos, foto de producto, lista de precios u oferta comercial.
D) Otro tipo de imagen no relacionada con pagos.

PRIMERO determina si es un documento de PAGO/COBRO o un CATÁLOGO/FOTO DE PRODUCTO.
- Si es catálogo, foto de producto, lista de precios u oferta comercial → "es_catalogo_producto": true, "facturas_encontradas": []
- Si es documento de pago/cobro → "es_catalogo_producto": false y extrae los datos

Para documentos de pago extrae:
1. Número(s) de factura — busca en TODO el texto visible.
2. Nombre del proveedor.
3. Valor pagado / valor neto / total.
4. Descuento (si aplica).
5. Flete (si aplica).
6. Fecha del comprobante o pago.

Responde SOLO con JSON, estructura exacta:
{
  "tipo_imagen": "liquidacion" | "comprobante_pago" | "catalogo_producto" | "otro",
  "es_catalogo_producto": true o false,
  "proveedor_nombre": "texto o null",
  "facturas_encontradas": [
    {
      "numero_factura": "solo el número sin ceros a la izquierda innecesarios, o null",
      "valor_factura": número o null,
      "descuento": número o null,
      "flete": número o null,
      "valor_neto": número o null
    }
  ],
  "total_imagen": número o null,
  "fecha_pago": "YYYY-MM-DD o null",
  "notas": "observación breve"
}

IMPORTANTE: Si en cualquier parte del texto aparece un número que podría ser factura (como en "LOCAL GORRAS 13499"), inclúyelo en facturas_encontradas. Los valores deben ser números sin puntos ni símbolos de moneda.`;

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 800,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mimeType,
              data: imageBase64,
            },
          },
          { type: "text", text: prompt },
        ],
      },
    ],
  });

  const text = response.content[0].text.trim();
  const parsed = safeParseJSON(text);
  if (!parsed) throw new Error("Claude no pudo analizar la imagen");
  return parsed;
}

/**
 * Genera mensajes para múltiples proveedores
 */
async function generarMensajesLote(proveedoresConFacturas) {
  const resultados = [];

  for (const { proveedor, facturas } of proveedoresConFacturas) {
    try {
      const totalPagar = facturas.reduce((sum, f) => sum + f.valor_final, 0);

      const mensaje = await generarMensajeProveedor({
        nombreProveedor: proveedor.nombre || facturas[0]?.proveedor_nombre,
        nitProveedor: proveedor.nit || facturas[0]?.proveedor_nit,
        facturas,
        totalPagar,
        banco: proveedor.banco,
        cuenta: proveedor.cuenta,
        tipo_cuenta: proveedor.tipo_cuenta,
        titular_nombre: proveedor.titular_nombre,
        titular_id: proveedor.titular_id,
      });

      resultados.push({
        proveedor_nit: proveedor.nit || facturas[0]?.proveedor_nit,
        proveedor_nombre: proveedor.nombre || facturas[0]?.proveedor_nombre,
        telefono: proveedor.telefono,
        telefono2: proveedor.telefono2,
        mensaje,
        total_pagar: totalPagar,
        exito: true,
      });
    } catch (err) {
      resultados.push({
        proveedor_nit: proveedor.nit,
        proveedor_nombre: proveedor.nombre,
        error: err.message,
        exito: false,
      });
    }
  }

  return resultados;
}

/**
 * Extrae datos de cuenta bancaria de un texto enviado por el proveedor
 */
async function extraerDatosCuenta(texto) {
  const prompt = `Eres un asistente de tesorería de MAKA QCUTE SAS (Colombia).

Un proveedor envió este mensaje:
"${texto}"

Determina si el mensaje contiene información de cuenta bancaria. Si sí, extrae todos los datos disponibles.

Campos requeridos:
1. banco: nombre del banco (Bancolombia, Davivienda, Banco de Bogotá, Nequi, Daviplata, BBVA, Colpatria, Popular, Occidente, Caja Social, etc.)
2. tipo_cuenta: "Ahorros" o "Corriente" (Nequi/Daviplata = "Ahorros")
3. numero_cuenta: número de cuenta o número de celular para Nequi/Daviplata
4. titular_nombre: nombre completo del titular
5. titular_id: número de cédula o NIT del titular

Responde SOLO con este JSON:
{
  "contiene_cuenta": true o false,
  "banco": "..." o null,
  "tipo_cuenta": "Ahorros" o "Corriente" o null,
  "numero_cuenta": "..." o null,
  "titular_nombre": "..." o null,
  "titular_id": "..." o null,
  "valor_asignado": número o null,
  "campos_faltantes": ["lista de nombres de campos que faltan"]
}`;

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 400,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content[0].text.trim();
  const parsed = safeParseJSON(text);
  if (!parsed) return { contiene_cuenta: false };
  return parsed;
}

/**
 * Extrae datos de cuenta bancaria de una imagen enviada por el proveedor
 */
async function extraerDatosCuentaImagen(imageBase64, mimeType = "image/jpeg") {
  const prompt = `Eres un asistente de tesorería de MAKA QCUTE SAS (Colombia).

El proveedor envió este documento/imagen que puede contener datos bancarios para pagos.

Extrae los datos de cuenta bancaria si están presentes:
1. banco: nombre del banco
2. tipo_cuenta: "Ahorros" o "Corriente"
3. numero_cuenta: número de cuenta
4. titular_nombre: nombre del titular
5. titular_id: cédula o NIT del titular
6. valor_asignado: valor a consignar (si aparece)

Responde SOLO con este JSON:
{
  "contiene_cuenta": true o false,
  "banco": "..." o null,
  "tipo_cuenta": "Ahorros" o "Corriente" o null,
  "numero_cuenta": "..." o null,
  "titular_nombre": "..." o null,
  "titular_id": "..." o null,
  "valor_asignado": número o null,
  "campos_faltantes": ["lista de campos que faltan"]
}`;

  const isPdf = mimeType === "application/pdf";
  const mediaBlock = isPdf
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: imageBase64 } }
    : { type: "image", source: { type: "base64", media_type: mimeType, data: imageBase64 } };

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 400,
    messages: [
      {
        role: "user",
        content: [ mediaBlock, { type: "text", text: prompt } ],
      },
    ],
  });

  const text = response.content[0].text.trim();
  const parsed = safeParseJSON(text);
  if (!parsed) return { contiene_cuenta: false };
  return parsed;
}

/**
 * Extrae datos de soporte de pago del caption + imagen enviados por equipo interno.
 * El caption puede venir en formato compacto: "TAHINO13780 13781" o "Proveedor F-001 F-002 $1.500.000"
 * El valor se extrae de la imagen si no está en el caption.
 */
async function extraerDatosSoporte(caption, proveedoresLista, imageBase64 = null, mimeType = "image/jpeg") {
  const nombresProveedores = proveedoresLista.map(p => `${p.nombre} (NIT: ${p.nit})`).join("\n");

  const prompt = `Eres el asistente de tesorería de MAKA QCUTE SAS (Colombia).

El equipo de tesorería envió un comprobante de pago con este caption:
"${caption}"

${imageBase64 ? "También te adjunto la imagen del comprobante para que extraigas el valor, fecha y demás datos visibles." : ""}

Lista de proveedores registrados en el sistema:
${nombresProveedores}

INSTRUCCIONES:
1. El caption suele venir en formato compacto: nombre del proveedor pegado o junto a número(s) de factura. Ejemplo: "TAHINO13780 13781" → proveedor: TAHINO, facturas: 13780 y 13781
2. Busca el proveedor más parecido en la lista (por nombre parcial, siglas o palabras clave)
3. El valor del pago está en la imagen del comprobante (busca "Transferencia realizada", "Valor total", monto principal en grande)
4. La fecha también está en la imagen del comprobante
5. Los números que NO son del proveedor y son largos (5+ dígitos o con guion) son números de factura

Responde SOLO con este JSON:
{
  "proveedor_nit": "NIT exacto del proveedor de la lista o null",
  "proveedor_nombre": "nombre del proveedor identificado o null",
  "facturas": "números de factura separados por coma o null",
  "valor": número entero sin puntos ni símbolos o null,
  "fecha_pago": "YYYY-MM-DD o null",
  "notas": "observación relevante o null"
}`;

  const isPdf = mimeType === "application/pdf";
  const content = imageBase64
    ? [
        isPdf
          ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: imageBase64 } }
          : { type: "image", source: { type: "base64", media_type: mimeType, data: imageBase64 } },
        { type: "text", text: prompt },
      ]
    : prompt;

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 500,
    messages: [{ role: "user", content }],
  });

  const text = response.content[0].text.trim();
  const parsed = safeParseJSON(text);
  if (!parsed) return null;
  return parsed;
}

module.exports = {
  generarMensajeProveedor,
  generarMensajesLote,
  responderProveedor,
  analizarImagenProveedor,
  extraerDatosCuenta,
  extraerDatosCuentaImagen,
  extraerDatosSoporte,
};
