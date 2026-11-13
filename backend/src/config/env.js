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

  // --- IA generativa de imágenes (Try-On realista) ---
  // Si falta, el Try-On con IA queda deshabilitado (sigue la superposición 2D).
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  GEMINI_IMAGE_MODEL: process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image',
  // Modelo de TEXTO (agente Mercado, con búsqueda web). Debe ser un modelo de
  // texto vigente; si Google lo retira la API responde 404 y se cambia acá o
  // con la variable de entorno GEMINI_TEXT_MODEL, sin tocar código.
  // gemini-2.5-flash ya no está disponible para claves nuevas (Google responde
  // 404 y recomienda gemini-3.8-flash, verificado con búsqueda web activa).
  GEMINI_TEXT_MODEL: process.env.GEMINI_TEXT_MODEL || 'gemini-3.8-flash',
  // Modelos de respaldo, en orden, si el principal responde 404 (retirado) o
  // 429 (sin cuota). Lista separada por comas; se edita en Railway sin tocar
  // código. Solo modelos verificados como vigentes para la API key.
  GEMINI_TEXT_FALLBACKS: (process.env.GEMINI_TEXT_FALLBACKS || 'gemini-flash-latest,gemini-2.5-flash')
    .split(',').map((m) => m.trim()).filter(Boolean),
};
