// =====================================================================
// Reemplaza los marcos del catálogo en la nube por los PNG transparentes.
// 1) Login admin  2) Borra TODOS los marcos existentes  3) Sube los
//    lentes de lentes-transparentes/ con sus códigos.
//
// Uso (PowerShell):
//   $env:API_URL="https://web-production-98afa.up.railway.app"
//   $env:ADMIN_USER="Optica_2026"
//   $env:ADMIN_PASSWORD="Optica_2026.1234"
//   node scripts/reemplazar-lentes.js
// =====================================================================

const fs = require('fs');
const path = require('path');

const API_URL = (process.env.API_URL || '').replace(/\/$/, '');
const ADMIN_USER = process.env.ADMIN_USER || 'Optica_2026';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Optica_2026.1234';

if (!API_URL) {
  console.error('Falta API_URL');
  process.exit(1);
}

const DIR = path.join(__dirname, '..', 'lentes-transparentes');

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
  if (!res.ok) throw new Error(`Login falló (${res.status})`);
  return (await res.json()).token;
}

async function borrarTodos(token) {
  const res = await fetch(`${API_URL}/api/marcos?limit=200`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const { marcos } = await res.json();
  console.log(`Borrando ${marcos.length} marcos existentes...`);
  for (const m of marcos) {
    const r = await fetch(`${API_URL}/api/marcos/${m.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    console.log(`  - ${m.codigo}: ${r.status === 204 ? 'borrado' : 'error ' + r.status}`);
  }
}

async function subir(token, lente) {
  const buffer = fs.readFileSync(path.join(DIR, lente.file));
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
  if (!res.ok) throw new Error(`Error subiendo ${lente.codigo} (${res.status}): ${await res.text()}`);
  console.log(`  ${lente.codigo}: subido "${lente.nombre}"`);
}

async function main() {
  console.log(`Login en ${API_URL} ...`);
  const token = await login();
  await borrarTodos(token);
  console.log('Subiendo lentes transparentes...');
  for (const lente of LENTES) await subir(token, lente);
  console.log('\nListo. Catálogo reemplazado con lentes transparentes.');
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
