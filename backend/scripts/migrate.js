// =====================================================================
// CLI de migraciones.
//
//   npm run migrate -- --check-only   Chequeo previo SIN base de datos:
//                                     sentencias destructivas o que no se
//                                     pueden repetir. Sale con código 1 si
//                                     encuentra algún problema.
//   npm run migrate                   Corre las migraciones reales contra
//                                     DATABASE_URL (lo mismo que hace el
//                                     servidor al arrancar).
// =====================================================================

const soloChequeo = process.argv.includes('--check-only');

if (soloChequeo) {
  // migrate.js carga env.js, que exige estas variables aunque no se conecte.
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://chequeo-sin-base';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'chequeo-sin-base';
}

const { MIGRACIONES, ejecutarMigraciones } = require('../src/config/migrate');
const { verificarMigraciones } = require('../src/config/verificarMigraciones');

async function main() {
  const problemas = verificarMigraciones(MIGRACIONES);
  if (problemas.length) {
    console.error(`✗ ${problemas.length} problema(s) en las migraciones:`);
    problemas.forEach((p) => console.error(`  #${p.indice}: ${p.problema}\n     ${p.sql}`));
    process.exit(1);
  }
  console.log(`✓ ${MIGRACIONES.length} migraciones revisadas: ninguna destructiva, todas repetibles.`);

  if (soloChequeo) return;

  const { pool } = require('../src/config/db');
  try {
    await ejecutarMigraciones();
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Error al correr las migraciones:', err.message);
  process.exit(1);
});
