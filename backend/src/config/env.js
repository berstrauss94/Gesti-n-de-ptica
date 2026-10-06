// =====================================================================
// Carga y valida las variables de entorno una sola vez.
// =====================================================================

require('dotenv').config();

const required = ['DATABASE_URL', 'JWT_SECRET'];
const missing = required.filter((key) => !process.env[key]);

if (missing.length > 0) {
  console.error(
    `Faltan variables de entorno obligatorias: ${missing.join(', ')}`
  );
  process.exit(1);
}

module.exports = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT, 10) || 3000,
  DATABASE_URL: process.env.DATABASE_URL,
  DB_SSL: process.env.DB_SSL === 'true',
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '8h',
  CORS_ORIGIN: process.env.CORS_ORIGIN || '*',
  // Carpeta de subidas. En Railway se apunta al mount del Volume
  // (ej: /data/uploads). Por defecto, backend/uploads.
  UPLOAD_DIR: process.env.UPLOAD_DIR || '',
  // Sirve el build del frontend desde Express (modo monolito en Railway)
  SERVE_FRONTEND: process.env.SERVE_FRONTEND === 'true',
};
