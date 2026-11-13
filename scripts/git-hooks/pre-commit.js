// =====================================================================
// Compuerta de calidad antes de cada commit (git pre-commit).
// Se instala con:  npm run hooks:instalar
//
// Bloquea el commit si:
//   1. Hay cambios de código (backend/src o frontend/src) sin actualizar
//      ARQUITECTURA.md en el mismo commit.
//   2. Falla `npm run test:ci`: chequeo de migraciones (destructivas o no
//      repetibles), pruebas (contrato de API sin 500, Gemini, calculadoras)
//      y build del frontend.
//
// NO hace push ni despliega: subir a producción es un paso aparte y
// explícito (npm run deploy). Para saltear la compuerta en una emergencia:
// git commit --no-verify (no recomendado).
// =====================================================================

const { execSync, spawnSync } = require('node:child_process');

function staged() {
  return execSync('git diff --cached --name-only', { encoding: 'utf8' })
    .split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
}

const archivos = staged();
if (archivos.length === 0) process.exit(0);

// 1) Documentación sincronizada
const tocaCodigo = archivos.some((f) => /^(backend\/src|frontend\/src)\//.test(f));
const tocaDoc = archivos.includes('ARQUITECTURA.md');
if (tocaCodigo && !tocaDoc) {
  console.error('\n✗ Commit bloqueado: hay cambios de código pero ARQUITECTURA.md no está en el commit.');
  console.error('  Actualizalo (sección pertinente + "Registro de cambios") y agregalo con git add.');
  console.error('  Si el cambio es trivial (typo, formato): git commit --no-verify.\n');
  process.exit(1);
}

// 2) Migraciones + pruebas + build
console.log('▶ Compuerta de calidad: npm run test:ci …');
const r = spawnSync('npm', ['run', 'test:ci', '--silent'], { stdio: 'inherit', shell: true });
if (r.status !== 0) {
  console.error('\n✗ Commit bloqueado: falló npm run test:ci (ver detalle arriba).\n');
  process.exit(1);
}
console.log('✓ Compuerta superada: migraciones, pruebas y build OK.');
