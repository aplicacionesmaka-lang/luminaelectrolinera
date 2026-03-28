/**
 * Normaliza un número de teléfono colombiano al formato 573XXXXXXXXX
 * @param {string|number} phone - Número de teléfono en cualquier formato
 * @returns {string} Número normalizado o null si es inválido
 */
function normalizePhone(phone) {
  if (!phone) return null;

  // Convertir a string y limpiar: quitar espacios, guiones, paréntesis, +
  let cleaned = String(phone).replace(/[\s\-\(\)\+\.]/g, "");

  // Quitar ceros al inicio si son más de uno (ej: 003) pero no el indicativo de Colombia
  // Quitar prefijo internacional si viene con 00
  if (cleaned.startsWith("00")) {
    cleaned = cleaned.substring(2);
  }

  // Si viene con indicativo de Colombia (57)
  if (cleaned.startsWith("57") && cleaned.length === 12) {
    return cleaned;
  }

  // Si viene con indicativo de Colombia (57) y tiene 13 dígitos (error de duplicado)
  if (cleaned.startsWith("57") && cleaned.length > 12) {
    return cleaned.substring(0, 12);
  }

  // Si es un número celular colombiano (empieza en 3 y tiene 10 dígitos)
  if (cleaned.startsWith("3") && cleaned.length === 10) {
    return "57" + cleaned;
  }

  // Si es un número fijo colombiano (empieza en 60X o número de ciudad)
  if (cleaned.length === 10 && /^[1-9]/.test(cleaned)) {
    return "57" + cleaned;
  }

  // Si tiene 7 u 8 dígitos (número local sin indicativo de ciudad)
  // No podemos normalizar sin ciudad, retornar null
  if (cleaned.length < 10) {
    return null;
  }

  return null;
}

module.exports = { normalizePhone };
