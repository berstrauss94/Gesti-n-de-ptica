// =====================================================================
// Punto de entrada del servidor.
// =====================================================================

const app = require('./app');
const { PORT, NODE_ENV, CORS_ORIGIN } = require('./config/env');
const { pool } = require('./config/db');
const { ejecutarMigraciones } = require('./config/migrate');

const server = app.listen(PORT, () => {
  console.log(`Servidor Óptica escuchando en el puerto ${PORT}`);
  // Aviso de seguridad: CORS abierto en producción es un riesgo.
  if (NODE_ENV === 'production' && CORS_ORIGIN === '*') {
    console.warn(
      'ADVERTENCIA: CORS_ORIGIN está en "*" en producción. ' +
      'Configurá el dominio del frontend en la variable CORS_ORIGIN.'
    );
  }
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
