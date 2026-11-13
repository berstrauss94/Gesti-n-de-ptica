// =====================================================================
// Despliegue verificado a Railway.
//   npm run deploy
// 1. Exige estar en main y sin cambios sin commitear.
// 2. Corre la compuerta completa (npm run test:ci).
// 3. Solo si todo pasa, hace git push origin main (Railway despliega solo).
// Se ejecuta a mano: nada sube a producción sin que alguien lo pida.
// =====================================================================

const { execSync, spawnSync } = require('node:child_process');

function git(cmd) {
  return execSync(`git ${cmd}`, { encoding: 'utf8' }).trim();
}
function salir(msg) {
  console.error(`\n✗ Deploy cancelado: ${msg}\n`);
  process.exit(1);
}

const rama = git('rev-parse --abbrev-ref HEAD');
if (rama !== 'main') salir(`estás en la rama "${rama}"; el deploy sale de main.`);

// Archivos versionados con cambios sin commitear (los no versionados no bloquean).
const pendientes = git('status --porcelain --untracked-files=no');
if (pendientes) salir(`hay cambios sin commitear:\n${pendientes}`);

const sinSubir = git('log origin/main..HEAD --oneline');
if (!sinSubir) {
  console.log('Nada para desplegar: main ya está igual que origin/main.');
  process.exit(0);
}
console.log(`Commits a desplegar:\n${sinSubir}\n`);

console.log('▶ Compuerta de calidad: npm run test:ci …');
const r = spawnSync('npm', ['run', 'test:ci', '--silent'], { stdio: 'inherit', shell: true });
if (r.status !== 0) salir('falló npm run test:ci (ver detalle arriba).');

console.log('▶ git push origin main …');
const p = spawnSync('git', ['push', 'origin', 'main'], { stdio: 'inherit' });
if (p.status !== 0) salir('falló el git push.');
console.log('\n✓ Subido a main. Railway despliega automáticamente; verificá /health en unos minutos.');
