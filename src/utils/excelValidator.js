/**
 * Valida que un archivo sea Excel válido
 * @param {Object} file - Objeto de archivo de multer
 * @returns {{ valid: boolean, error?: string }}
 */
function validateExcelFile(file) {
  if (!file) {
    return { valid: false, error: "No se proporcionó ningún archivo" };
  }

  const allowedMimes = [
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/octet-stream",
  ];

  const allowedExtensions = [".xls", ".xlsx"];
  const ext = file.originalname
    ? "." + file.originalname.split(".").pop().toLowerCase()
    : "";

  if (!allowedExtensions.includes(ext)) {
    return {
      valid: false,
      error: `Extensión no permitida: ${ext}. Use .xls o .xlsx`,
    };
  }

  if (file.size > 10 * 1024 * 1024) {
    return {
      valid: false,
      error: "El archivo supera el tamaño máximo de 10MB",
    };
  }

  return { valid: true };
}

module.exports = { validateExcelFile };
