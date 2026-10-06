// =====================================================================
// Rutas de almacenamiento centralizadas.
// UPLOAD_DIR puede sobreescribirse por entorno para apuntar al mount del
// Railway Volume (p.ej. /data/uploads) y así persistir entre despliegues.
// =====================================================================

const path = require('path');
const fs = require('fs');
const { UPLOAD_DIR } = require('./env');

// Si viene por entorno, se usa tal cual (puede ser absoluta en Railway).
// Si no, por defecto backend/uploads.
const uploadsPath = UPLOAD_DIR
  ? path.resolve(UPLOAD_DIR)
  : path.join(__dirname, '..', '..', 'uploads');

// Asegura que exista la carpeta
if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath, { recursive: true });
}

module.exports = { uploadsPath };
