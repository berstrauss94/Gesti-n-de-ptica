// Pruebas de la cadena de modelos de Gemini del agente Mercado.
// Base de datos y Google simulados: no se gasta cuota ni se usa la red.
process.env.DATABASE_URL = 'postgres://test';
process.env.JWT_SECRET = 'test';
process.env.GEMINI_API_KEY = 'clave-de-prueba';
process.env.GEMINI_TEXT_MODEL = 'modelo-a';
process.env.GEMINI_TEXT_FALLBACKS = 'modelo-b, modelo-c';

const test = require('node:test');
const assert = require('node:assert/strict');

// --- Base simulada: sin coincidencias locales; el INSERT devuelve lo guardado ---
const dbPath = require.resolve('../src/config/db');
let inserts = 0;
require.cache[dbPath] = {
  id: dbPath, filename: dbPath, loaded: true,
  exports: {
    query: async (sql, p = []) => {
      if (/INSERT INTO mercado_catalogo/.test(sql)) { inserts += 1; return { rows: [{ id: 'X', marca: p[0], modelo: p[1] }] }; }
      return { rows: [], rowCount: 0 };
    },
  },
};

// --- Google simulado: cada modelo responde lo que diga `respuestas` ---
let respuestas = {};
let llamados = [];
const JSON_OK = JSON.stringify({ marca: 'Persol', modelo: 'PO3019S', estilo: 'rectangular' });
global.fetch = async (url) => {
  const modelo = url.match(/models\/([^:]+):/)[1];
  llamados.push(modelo);
  const status = respuestas[modelo] ?? 404;
  return {
    ok: status === 200,
    status,
    text: async () => `{"error":{"code":${status}}}`,
    json: async () => ({ candidates: [{ content: { parts: [{ text: JSON_OK }] } }] }),
  };
};

const { rastrearYEnriquecerModelo } = require('../src/services/mercadoGeminiService');

function reset(r) { respuestas = r; llamados = []; inserts = 0; }

test('si el primer modelo da 404, escala al siguiente y guarda', async () => {
  reset({ 'modelo-a': 404, 'modelo-b': 200 });
  const r = await rastrearYEnriquecerModelo({ marca: 'Persol', modelo: 'PO3019S' });
  assert.equal(r.ok, true);
  assert.deepEqual(llamados, ['modelo-a', 'modelo-b']);
  assert.equal(inserts, 1);
});

test('recuerda el modelo que funcionó y lo prueba primero', async () => {
  reset({ 'modelo-a': 404, 'modelo-b': 200 });
  await rastrearYEnriquecerModelo({ marca: 'Ray-Ban', modelo: 'RB3025' });
  assert.deepEqual(llamados, ['modelo-b'], 'no debería volver a gastar una llamada en modelo-a');
});

test('ante 429 (sin cuota) también escala', async () => {
  reset({ 'modelo-b': 429, 'modelo-a': 429, 'modelo-c': 200 });
  const r = await rastrearYEnriquecerModelo({ marca: 'Oakley', modelo: 'Holbrook' });
  assert.equal(r.ok, true);
  assert.equal(llamados.at(-1), 'modelo-c');
});

test('un error que no es de modelo (403, clave inválida) corta sin escalar ni escribir', async () => {
  reset({ 'modelo-c': 403, 'modelo-a': 200, 'modelo-b': 200 });
  const r = await rastrearYEnriquecerModelo({ marca: 'Gucci', modelo: 'GG0061S' });
  assert.equal(r.ok, false);
  assert.equal(llamados.length, 1);
  assert.match(r.detalle, /403/);
  assert.equal(inserts, 0);
});

test('si todos dan 429, avisa de cuota y no escribe en la base', async () => {
  reset({ 'modelo-a': 429, 'modelo-b': 429, 'modelo-c': 429 });
  const r = await rastrearYEnriquecerModelo({ marca: 'Prada', modelo: 'PR17WS' });
  assert.equal(r.ok, false);
  assert.match(r.detalle, /Sin cuota/);
  assert.equal(llamados.length, 3);
  assert.equal(inserts, 0);
});

test('si todos dan 404, pide actualizar los modelos configurados', async () => {
  reset({});
  const r = await rastrearYEnriquecerModelo({ marca: 'Vogue', modelo: 'VO5051S' });
  assert.equal(r.ok, false);
  assert.match(r.detalle, /GEMINI_TEXT_MODEL/);
  assert.equal(inserts, 0);
});
