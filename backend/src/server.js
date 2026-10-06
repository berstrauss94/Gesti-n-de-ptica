// =====================================================================
// Punto de entrada del servidor.
// =====================================================================

const app = require('./app');
const { PORT } = require('./config/env');
const { pool } = require('./config/db');
const { ejecutarMigraciones } = require('./config/migrate');

const server = app.listen(PORT, () => {
  console.log(`Servidor Óptica escuchando en el puerto ${PORT}`);
  // Migraciones idempotentes al arrancar (agrega columnas si faltan)
  ejecutarMigraciones().catch((e) => console.error('Error en migraciones:', e.message));
});

// Cierre ordenado
function shutdown(signal) {
  console.log(`\n${signal} recibido. Cerrando servidor...`);
  server.close(async () => {
    await pool.end();
    console.log('Conexiones cerradas. Adiós.');
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

module.exports = server;
