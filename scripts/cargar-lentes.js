// =====================================================================
// Carga los 6 lentes recortados al catálogo de marcos en la nube (Railway).
// Hace login con el admin, obtiene el JWT y sube cada PNG como un marco.
//
// Uso (PowerShell):
//   $env:API_URL="https://web-production-98afa.up.railway.app"
//   $env:ADMIN_USER="Optica_2026"
//   $env:ADMIN_PASSWORD="Optica_2026.1234"
//   node scripts/cargar-lentes.js
//
// Requiere Node 18+ (usa fetch y FormData nativos).
// Los PNG deben estar en la carpeta lentes-recortados/ (lente-1..6.png).
// =====================================================================

const fs = require('fs');
const path = require('path');

const API_URL = (process.env.API_URL || '').replace(/\/$/, '');
const ADMIN_USER = process.env.ADMIN_USER || 'Optica_2026';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Optica_2026.1234';

if (!API_URL) {
  console.error('Falta API_URL (ej: https://web-production-98afa.up.railway.app)');
  process.exit(1);
}

const DIR = path.join(__dirname, '..', 'lentes-recortados');

// Metadatos de cada lente (orden izq->der, arriba->abajo de la lámina)
const LENTES = [
  { file: 'lente-1.png', codigo: 'LEN-001', nombre: 'Clásico redondo marrón', estilo: 'OVALADO' },
  { file: 'lente-2.png', codigo: 'LEN-002', nombre: 'Sol redondo marrón', estilo: 'OVALADO' },
  { file: 'lente-3.png', codigo: 'LEN-003', nombre: 'Clásico dorado', estilo: 'OVALADO' },
  { file: 'lente-4.png', codigo: 'LEN-004', nombre: 'Sol espejado azul', estilo: 'OVALADO' },
  { file: 'lente-5.png', codigo: 'LEN-005', nombre: 'Clásico rojo', estilo: 'OVALADO' },
  { file: 'lente-6.png', codigo: 'LEN-006', nombre: 'Sol espejado verde', estilo: 'OVALADO' },
];

async function login() {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario: ADMIN_USER, password: ADMIN_PASSWORD }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Login falló (${res.status}): ${t}`);
  }
  const data = await res.json();
  return data.token;
}

async function subirMarco(token, lente) {
  const ruta = path.join(DIR, lente.file);
  if (!fs.existsSync(ruta)) {
    console.warn(`  (saltado) no existe ${lente.file}`);
    return;
  }
  const buffer = fs.readFileSync(ruta);
  const blob = new Blob([buffer], { type: 'image/png' });

  const form = new FormData();
  form.append('codigo', lente.codigo);
  form.append('nombre_modelo', lente.nombre);
  form.append('estilo_forma', lente.estilo);
  form.append('imagen', blob, lente.file);

  const res = await fetch(`${API_URL}/api/marcos`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });

  if (res.status === 409) {
    console.log(`  ${lente.codigo}: ya existía (omitido)`);
    return;
  }
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Error subiendo ${lente.codigo} (${res.status}): ${t}`);
  }
  console.log(`  ${lente.codigo}: cargado "${lente.nombre}"`);
}

async function main() {
  console.log(`Login en ${API_URL} ...`);
  const token = await login();
  console.log('Login OK. Subiendo lentes...');

  for (const lente of LENTES) {
    await subirMarco(token, lente);
  }

  console.log('\nListo. Lentes cargados al catálogo en la nube.');
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
