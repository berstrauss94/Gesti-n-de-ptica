// =====================================================================
// Migraciones idempotentes que corren al arrancar el servidor.
// Usan la conexión interna (DATABASE_URL) de Railway: no exponen nada.
// Solo agregan columnas si faltan (seguro de re-ejecutar).
// =====================================================================

const { query } = require('./db');

const MIGRACIONES = [
  `ALTER TABLE marcos ADD COLUMN IF NOT EXISTS ancho_mm NUMERIC(5,1)`,
  `ALTER TABLE marcos ADD COLUMN IF NOT EXISTS alto_mm NUMERIC(5,1)`,
  `ALTER TABLE marcos ADD COLUMN IF NOT EXISTS patilla_mm NUMERIC(5,1)`,
];

async function ejecutarMigraciones() {
  for (const sql of MIGRACIONES) {
    try {
      await query(sql);
    } catch (err) {
      // No bloquear el arranque por una migración; registrar y seguir.
      console.error('Migración falló (continuo):', sql, '-', err.message);
    }
  }
  console.log('Migraciones de columnas verificadas.');
}

module.exports = { ejecutarMigraciones };
