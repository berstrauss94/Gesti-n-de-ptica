// =====================================================================
// Configuración de conexión a PostgreSQL mediante pool de conexiones.
// Usa DATABASE_URL (provista por Railway en producción).
// =====================================================================

const { Pool } = require('pg');
const { DATABASE_URL, DB_SSL } = require('./env');

const pool = new Pool({
  connectionString: DATABASE_URL,
  // Railway/producción requieren SSL; en local normalmente no.
  ssl: DB_SSL ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
  console.error('Error inesperado en el pool de PostgreSQL:', err);
});

// Helper de consulta reutilizable
function query(text, params) {
  return pool.query(text, params);
}

module.exports = { pool, query };
