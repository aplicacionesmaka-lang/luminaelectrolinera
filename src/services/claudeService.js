const Anthropic = require("@anthropic-ai/sdk");

const client = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY,
});

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
    ? `\nIMPORTANTE: Hay facturas sin flete registrado. Debes solicitar AMABLEMENTE que nos envíen la liquidación del flete cobrado (valor en pesos) para poder recalcular el total final a pagar.`
    : ``;

  const detalleFacturas = facturas
    .map((f) => {
      const desc = Number(f.descuento_pronto_pago) || 0;
      const flete = Number(f.flete) || 0;
      const pct = desc > 0 && f.valor_factura > 0
        ? ` (${((desc / f.valor_factura) * 100).toFixed(0)}%)`
        : '';
      let linea = `🧾 *Factura ${f.numero_factura}*\n`;
      linea += `   • Valor bruto: $${Number(f.valor_factura).toLocaleString("es-CO")}\n`;
      if (desc > 0) linea += `   • Dto. pronto pago${pct}: -$${desc.toLocaleString("es-CO")}\n`;
      if (flete > 0) linea += `   • Flete: +$${flete.toLocaleString("es-CO")}\n`;
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

  const prompt = `Eres MakaBot, el asistente de pagos de MAKA QCUTE SAS, empresa colombiana de accesorios y belleza (NIT 901.883.025).

Eres muy amable, cálido y cercano. Siempre tratas a los proveedores con respeto y cariño.

Genera un mensaje de WhatsApp en español para notificar al proveedor sobre el pago programado de sus facturas.

Datos del proveedor:
- Nombre: ${nombreProveedor}
- NIT: ${nitProveedor}

Detalle de facturas a pagar:
${detalleFacturas}

Total a pagar: $${Number(totalPagar).toLocaleString("es-CO")} COP
${solicitudDatosBancarios}
${solicitudFlete}

El mensaje debe:
1. Saludar calurosamente con el nombre del proveedor
2. Informar sobre las facturas pendientes con su detalle
3. Mencionar el total a pagar
4. Indicar que las facturas serán incluidas en la programación de pago de la semana (NO mencionar fecha exacta)
5. Solicitar amablemente que confirmen si los valores son correctos o nos informen el valor según su liquidación
6. Si hay facturas con flete pendiente, pedir que nos envíen la liquidación del flete (valor en pesos) para recalcular el total final
7. Si faltan datos bancarios, pedirlos de forma clara y amable indicando que son necesarios para la transferencia
8. Ser muy amable, cordial y profesional
9. Firmar como "MakaBot - Equipo de Tesorería MAKA QCUTE SAS"
10. Cerrar SIEMPRE con una bendición (ej: "¡Que Dios les bendiga!", "¡Bendiciones!")
11. Máximo 400 palabras

Responde SOLO con el mensaje de WhatsApp, sin explicaciones adicionales.`;

  const response = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 1200,
    messages: [{ role: "user", content: prompt }],
  });

  return response.content[0].text;
}

/**
 * Responde a un mensaje del proveedor comparando valores.
 * Si el valor del proveedor es menor, se acepta el del proveedor.
 */
async function responderProveedor({
  nombreProveedor,
  respuestaProveedor,
  totalCalculado,
  facturas,
}) {
  const detalleFacturas = facturas
    .map((f) => `- Factura ${f.numero_factura}: valor final calculado $${Number(f.valor_final).toLocaleString("es-CO")}`)
    .join("\n");

  const prompt = `Eres el asistente de pagos de MAKA QCUTE SAS (NIT 901.883.025). Tu nombre es MakaBot.

Eres muy amable, cordial y cercano. Siempre tratas a los proveedores con respeto y calidez.
SIEMPRE debes cerrar cada mensaje con una despedida de bendiciones, por ejemplo:
"¡Que Dios les bendiga!", "¡Bendiciones para usted y su familia!", "¡Que tengan un día lleno de bendiciones!" o similar.

El proveedor "${nombreProveedor}" respondió el siguiente mensaje:
"${respuestaProveedor}"

Nuestro cálculo tiene:
${detalleFacturas}
Total calculado por nosotros: $${Number(totalCalculado).toLocaleString("es-CO")} COP

Tu tarea:
1. Analiza si el proveedor menciona un valor diferente al nuestro.
2. Si el proveedor indica un valor MENOR, acepta su valor con gratitud (es a favor nuestro).
3. Si el proveedor indica un valor MAYOR, explícale con mucha amabilidad que nuestro cálculo está correcto y muéstrale el detalle.
4. Si el proveedor confirma los valores, agradécele calurosamente y confirma la fecha de pago.
5. Si el mensaje no tiene relación con valores (ej: "Hola", saludos), responde de manera muy amable y cordial presentándote como el asistente de pagos de MAKA QCUTE SAS.
6. SIEMPRE termina el mensaje con una bendición.

Responde con un JSON con esta estructura exacta:
{
  "mensaje_respuesta": "texto del mensaje de WhatsApp para enviar al proveedor",
  "valor_aceptado": número (el valor final a pagar, puede ser el del proveedor si es menor o el nuestro),
  "origen_valor": "proveedor" o "calculado",
  "accion": "confirmado" | "ajustado" | "pendiente" | "discrepancia"
}`;

  const response = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 600,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content[0].text.trim();
  // Extraer JSON de la respuesta
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Claude no devolvió JSON válido");
  return JSON.parse(jsonMatch[0]);
}

/**
 * Analiza una imagen enviada por el proveedor (descuento, flete, valor)
 * @param {string} imageBase64
 * @param {string} mimeType
 */
async function analizarImagenProveedor(imageBase64, mimeType = "image/jpeg") {
  const prompt = `Eres un asistente de cuentas por pagar de MAKA QCUTE SAS.

El proveedor envió esta imagen que puede contener una liquidación con cálculo de descuento y flete.

Extrae la siguiente información de la imagen:
1. Número(s) de factura visibles
2. Valor bruto / valor factura
3. Descuento por pronto pago (si aparece)
4. Flete (si aparece)
5. Valor neto / total a pagar

Responde con un JSON con esta estructura exacta:
{
  "facturas_encontradas": [
    {
      "numero_factura": "texto o null",
      "valor_factura": número o null,
      "descuento": número o null,
      "flete": número o null,
      "valor_neto": número o null
    }
  ],
  "total_imagen": número o null,
  "notas": "cualquier observación relevante"
}

Si no puedes identificar algún campo, usa null. Los valores deben ser números sin puntos ni símbolos de moneda.`;

  const response = await client.messages.create({
    model: "claude-opus-4-6",
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
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Claude no pudo analizar la imagen");
  return JSON.parse(jsonMatch[0]);
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
    model: "claude-opus-4-6",
    max_tokens: 400,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content[0].text.trim();
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return { contiene_cuenta: false };
  return JSON.parse(jsonMatch[0]);
}

/**
 * Extrae datos de cuenta bancaria de una imagen enviada por el proveedor
 */
async function extraerDatosCuentaImagen(imageBase64, mimeType = "image/jpeg") {
  const prompt = `Eres un asistente de tesorería de MAKA QCUTE SAS (Colombia).

El proveedor envió esta imagen que puede contener datos bancarios para pagos.

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

  const response = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 400,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mimeType, data: imageBase64 } },
          { type: "text", text: prompt },
        ],
      },
    ],
  });

  const text = response.content[0].text.trim();
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return { contiene_cuenta: false };
  return JSON.parse(jsonMatch[0]);
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

  const content = imageBase64
    ? [
        { type: "image", source: { type: "base64", media_type: mimeType, data: imageBase64 } },
        { type: "text", text: prompt },
      ]
    : prompt;

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 500,
    messages: [{ role: "user", content }],
  });

  const text = response.content[0].text.trim();
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  return JSON.parse(jsonMatch[0]);
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
