// =====================================================================
// Instala la compuerta de calidad como hook de git (pre-commit).
//   npm run hooks:instalar
// Escribe .git/hooks/pre-commit (local, no se versiona) que llama a
// scripts/git-hooks/pre-commit.js. No toca la configuración de git.
// Para desinstalar: borrar .git/hooks/pre-commit.
// =====================================================================

const fs = require('node:fs');
const path = require('node:path');

const raiz = path.join(__dirname, '..');
const dirHooks = path.join(raiz, '.git', 'hooks');
if (!fs.existsSync(dirHooks)) {
  console.error('No se encontró .git/hooks: corré este script desde el repositorio clonado.');
  process.exit(1);
}

const destino = path.join(dirHooks, 'pre-commit');
if (fs.existsSync(destino) && !fs.readFileSync(destino, 'utf8').includes('scripts/git-hooks/pre-commit.js')) {
  console.error(`Ya existe un pre-commit propio en ${destino}; no lo piso. Revisalo a mano.`);
  process.exit(1);
}

// Git para Windows ejecuta los hooks con sh, así que alcanza con este script.
const contenido = '#!/bin/sh\n# Instalado por scripts/instalar-git-hooks.js\nexec node scripts/git-hooks/pre-commit.js\n';
fs.writeFileSync(destino, contenido, { mode: 0o755 });
console.log(`✓ Compuerta instalada en ${destino}`);
