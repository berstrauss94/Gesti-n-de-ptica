// Eliminar producto: sin historial se borra; con historial (FK 23503: ventas,
// compras, traslados o sobres) se da de baja en vez de responder 500.
process.env.DATABASE_URL = 'postgres://test';
process.env.JWT_SECRET = 'secreto-de-prueba';
const test = require('node:test');
const assert = require('node:assert/strict');

const consultas = [];
let conHistorial = false;
const dbPath = require.resolve('../src/config/db');
require.cache[dbPath] = {
  id: dbPath, filename: dbPath, loaded: true,
  exports: {
    query: async (sql, params) => {
      consultas.push({ sql, params });
      if (sql.startsWith('DELETE FROM productos')) {
        if (conHistorial) { const e = new Error('fk'); e.code = '23503'; throw e; }
        return { rows: [{ id: params[0] }], rowCount: 1 };
      }
      if (sql.startsWith('UPDATE productos SET activo = FALSE')) return { rows: [{ id: params[0] }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    },
    pool: { query: async () => ({ rows: [], rowCount: 0 }), connect: async () => ({ query: async () => ({ rows: [] }), release() {} }) },
  },
};
const { eliminar } = require('../src/controllers/productosController');

const ID = '11111111-2222-3333-4444-555555555555';
function respuesta() {
  const r = { status: 200, body: undefined };
  r.res = {
    status(c) { r.status = c; return this; },
    json(b) { r.body = b; return this; },
    send() { return this; },
  };
  return r;
}

test('sin historial: se borra (204)', async () => {
  conHistorial = false; consultas.length = 0;
  const r = respuesta();
  await eliminar({ params: { id: ID } }, r.res);
  assert.equal(r.status, 204);
  assert.ok(!consultas.some((c) => c.sql.startsWith('UPDATE')));
});

test('con historial: se da de baja (200, archivado) y no responde 500', async () => {
  conHistorial = true; consultas.length = 0;
  const r = respuesta();
  await eliminar({ params: { id: ID } }, r.res);
  assert.equal(r.status, 200);
  assert.equal(r.body.archivado, true);
  const baja = consultas.find((c) => c.sql.startsWith('UPDATE productos SET activo = FALSE'));
  assert.deepEqual(baja.params, [ID]);
});

test('id inválido: 404 sin tocar la base', async () => {
  consultas.length = 0;
  const r = respuesta();
  await eliminar({ params: { id: 'abc' } }, r.res);
  assert.equal(r.status, 404);
  assert.equal(consultas.length, 0);
});
