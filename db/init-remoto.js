// =====================================================================
// Carga el esquema (schema.sql) y siembra el usuario admin en una base
// PostgreSQL remota (p. ej. Railway), usando el cliente pg del backend.
//
// Uso (PowerShell), pasando la URL pública de Railway:
//   $env:DATABASE_PUBLIC_URL="postgresql://postgres:...@...proxy.rlwy.net:PORT/railway"
//   node db/init-remoto.js
//
// Opcional: contraseña del admin (por defecto Optica_2026.1234)
//   $env:ADMIN_USER="Optica_2026"
//   $env:ADMIN_PASSWORD="Optica_2026.1234"
//
// Es idempotente: se puede correr varias veces sin romper nada.
// =====================================================================

const fs = require('fs');
const path = require('path');
const { Client } = require(path.join(__dirname, '..', 'backend', 'node_modules', 'pg'));

const url = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
if (!url) {
  console.error('Falta DATABASE_PUBLIC_URL (o DATABASE_URL) en el entorno.');
  process.exit(1);
}

const ADMIN_USER = process.env.ADMIN_USER || 'Optica_2026';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Optica_2026.1234';

async function main() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');

  const client = new Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false }, // Railway exige SSL
  });

  await client.connect();
  console.log('Conectado a la base. Aplicando esquema...');

  // El schema.sql es un bloque con varias sentencias; pg las ejecuta juntas.
  await client.query(schema);
  console.log('Esquema aplicado.');

  // Sembrar admin de forma parametrizada (sin exponer la contraseña en el SQL)
  await client.query(
    `INSERT INTO usuarios_sistema (usuario, password_hash, rol)
     VALUES ($1, crypt($2, gen_salt('bf', 12)), 'admin')
     ON CONFLICT (usuario) DO NOTHING`,
    [ADMIN_USER, ADMIN_PASSWORD]
  );
  console.log(`Usuario admin asegurado: ${ADMIN_USER}`);

  const r = await client.query('SELECT usuario, rol FROM usuarios_sistema');
  console.log('Usuarios del sistema:', r.rows);

  await client.end();
  console.log('Listo. Base inicializada correctamente.');
}

main().catch((err) => {
  console.error('Error al inicializar la base:', err.message);
  process.exit(1);
});
