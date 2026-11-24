// El build de Vite no detecta componentes usados sin importar: la pantalla queda en
// blanco recién al abrirla. Esta prueba lo atrapa antes del commit.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..', '..', 'frontend', 'src');

function archivosJsx(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return archivosJsx(p);
    return p.endsWith('.jsx') ? [p] : [];
  });
}

test('todo componente compartido que se usa en JSX está importado', () => {
  const COMPONENTES = ['InfoBtn', 'Modal'];
  const problemas = [];
  for (const archivo of archivosJsx(RAIZ)) {
    const src = fs.readFileSync(archivo, 'utf8');
    for (const c of COMPONENTES) {
      const usa = new RegExp(`<${c}[\\s/>]`).test(src);
      const definido = new RegExp(`import\\s+${c}\\b|function\\s+${c}\\b|const\\s+${c}\\b`).test(src);
      if (usa && !definido) problemas.push(`${path.relative(RAIZ, archivo)} usa <${c}> sin importarlo`);
    }
  }
  assert.deepStrictEqual(problemas, []);
});
