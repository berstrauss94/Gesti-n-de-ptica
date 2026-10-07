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

  // --- AFIP / ARCA (facturación electrónica) ---
  // Si faltan, el módulo fiscal opera en modo SIMULACIÓN (no bloquea el TPV).
  AFIP_CUIT: process.env.AFIP_CUIT || '',
  AFIP_CERT: process.env.AFIP_CERT || '',   // contenido o ruta del .crt
  AFIP_KEY: process.env.AFIP_KEY || '',     // contenido o ruta del .key
  AFIP_PUNTO_VENTA: parseInt(process.env.AFIP_PUNTO_VENTA, 10) || 1,
  AFIP_PRODUCCION: process.env.AFIP_PRODUCCION === 'true', // false = homologación
};
