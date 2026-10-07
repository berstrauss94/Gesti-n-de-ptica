// =====================================================================
// Carga un marco con sus 3 vistas (frontal/45/perfil) desde marco-3vistas/.
//
// Uso (PowerShell):
//   $env:API_URL="https://web-production-98afa.up.railway.app"
//   $env:ADMIN_USER="Optica_2026"; $env:ADMIN_PASSWORD="Optica_2026.1234"
//   node scripts/cargar-marco-3vistas.js
// =====================================================================

const fs = require('fs');
const path = require('path');

const API_URL = (process.env.API_URL || '').replace(/\/$/, '');
const ADMIN_USER = process.env.ADMIN_USER || 'Optica_2026';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Optica_2026.1234';
if (!API_URL) { console.error('Falta API_URL'); process.exit(1); }

const DIR = path.join(__dirname, '..', 'marco-3vistas');

// Datos del marco de prueba (negro rectangular). Medidas típicas.
const MARCO = {
  codigo: 'NEG-001',
  nombre_modelo: 'Rectangular negro',
  marca: 'Genérico',
  estilo_forma: 'RECTANGULAR',
  ancho_mm: '140',
  alto_mm: '43',
  patilla_mm: '143',
};

async function login() {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario: ADMIN_USER, password: ADMIN_PASSWORD }),
  });
  if (!res.ok) throw new Error(`Login falló (${res.status})`);
  return (await res.json()).token;
}

function parte(nombre, campo) {
  const buffer = fs.readFileSync(path.join(DIR, nombre));
  return { campo, blob: new Blob([buffer], { type: 'image/png' }), nombre };
}

async function main() {
  const token = await login();
  console.log('Login OK. Cargando marco con 3 vistas...');

  const form = new FormData();
  Object.entries(MARCO).forEach(([k, v]) => form.append(k, v));

  [
    parte('frontal.png', 'imagen_frontal'),
    parte('45.png', 'imagen_45'),
    parte('perfil.png', 'imagen_perfil'),
  ].forEach((p) => form.append(p.campo, p.blob, p.nombre));

  const res = await fetch(`${API_URL}/api/marcos`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });

  if (res.status === 409) { console.log('Ya existía NEG-001 (omitido).'); return; }
  if (!res.ok) throw new Error(`Error (${res.status}): ${await res.text()}`);
  const { marco } = await res.json();
  console.log('Cargado:', marco.codigo, '-> frontal:', marco.ruta_frontal, '| 45:', marco.ruta_45, '| perfil:', marco.ruta_perfil);
}

main().catch((e) => { console.error('Error:', e.message); process.exit(1); });
