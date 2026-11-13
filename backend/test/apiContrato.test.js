// Prueba de contrato de la API: levanta la app Express real (rutas,
// middlewares y controllers) con la base SIMULADA y verifica que los
// endpoints principales respondan JSON con el código esperado y nunca 500.
// Atrapa: errores de importación, rutas mal cableadas, crashes de los
// controllers y cambios de contrato (códigos/estructura de la respuesta).
process.env.DATABASE_URL = 'postgres://test';
process.env.JWT_SECRET = 'secreto-de-prueba';
process.env.GEMINI_API_KEY = '';
process.env.SERVE_FRONTEND = 'false';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const jwt = require('jsonwebtoken');

// --- Base simulada: toda consulta devuelve "sin filas" ---
const dbPath = require.resolve('../src/config/db');
const consultaVacia = async () => ({ rows: [], rowCount: 0 });
require.cache[dbPath] = {
  id: dbPath, filename: dbPath, loaded: true,
  exports: {
    query: consultaVacia,
    pool: {
      query: consultaVacia,
      connect: async () => ({ query: consultaVacia, release() {} }),
      end: async () => {},
    },
  },
};

// Ningún servicio externo (Gemini, Telegram, AFIP) se llama en las pruebas.
global.fetch = async () => { throw new Error('fetch deshabilitado en pruebas'); };

const app = require('../src/app');

const tokenAdmin = jwt.sign({ sub: 'u-admin', usuario: 'admin', rol: 'admin' }, process.env.JWT_SECRET);
const tokenVendedor = jwt.sign({ sub: 'u-vend', usuario: 'vende', rol: 'vendedor' }, process.env.JWT_SECRET);

let servidor;
let puerto;
test.before(async () => {
  await new Promise((ok) => { servidor = app.listen(0, '127.0.0.1', ok); });
  puerto = servidor.address().port;
});
test.after(() => new Promise((ok) => servidor.close(ok)));

// Cliente HTTP mínimo con node:http (el fetch global quedó bloqueado arriba).
function pedir(metodo, ruta, { token = tokenAdmin, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const datos = body ? JSON.stringify(body) : null;
  if (datos) headers['Content-Length'] = Buffer.byteLength(datos);
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: puerto, path: ruta, method: metodo, headers }, (res) => {
      let texto = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { texto += c; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(texto); } catch { /* respuesta no JSON */ }
        resolve({ status: res.statusCode, json, texto });
      });
    });
    req.on('error', reject);
    if (datos) req.write(datos);
    req.end();
  });
}

// --- Casos: [método, ruta, opciones, códigos aceptados, clave JSON esperada] ---
const CASOS = [
  ['GET', '/health', { token: null }, [200], 'status'],
  ['GET', '/api/sobres', {}, [200], 'sobres'],
  ['GET', '/api/sobres?estado=pendiente', {}, [200], 'sobres'],
  ['GET', '/api/sobres/00000000-0000-0000-0000-000000000000', {}, [404], 'error'],
  ['POST', '/api/sobres', { body: {} }, [400], 'error'],
  ['POST', '/api/sobres', { body: { sucursal_id: 's', estado: 'taller_listo' } }, [400], 'error'],
  ['PUT', '/api/sobres/x', { body: {} }, [400], 'error'],
  ['PATCH', '/api/sobres/x/estado', { body: { estado: 'cualquiera' } }, [400], 'error'],
  ['GET', '/api/comisiones', {}, [200], null],
  ['GET', '/api/comisiones', { token: tokenVendedor }, [403], 'error'],
  ['GET', '/api/mercado', {}, [200], 'catalogo'],
  ['GET', '/api/mercado?q=Ray', {}, [200], 'catalogo'],
  ['POST', '/api/mercado/enriquecer', { body: {} }, [400], 'error'],
  ['POST', '/api/mercado/enriquecer', { body: { marca: 'Ray-Ban', modelo: 'RB3025' } }, [409], 'error'],
  ['POST', '/api/mercado/enriquecer', { token: tokenVendedor, body: { marca: 'Ray-Ban' } }, [403], 'error'],
  ['GET', '/api/medicos', { token: tokenVendedor }, [200], 'medicos'],
  ['POST', '/api/medicos', { token: tokenVendedor, body: { nombre: 'Dr. X' } }, [403], 'error'],
  ['POST', '/api/medicos', { body: { nombre: '' } }, [400], 'error'],
  ['GET', '/api/sobres', { token: null }, [401], 'error'],
  ['GET', '/api/no-existe', {}, [404], 'error'],
];

for (const [metodo, ruta, opciones, esperados, clave] of CASOS) {
  const quien = opciones.token === tokenVendedor ? ' (vendedor)' : opciones.token === null ? ' (sin token)' : '';
  test(`${metodo} ${ruta}${quien} -> ${esperados.join('/')}`, async () => {
    const r = await pedir(metodo, ruta, opciones);
    assert.notEqual(r.status, 500, `respondió 500: ${r.texto.slice(0, 200)}`);
    assert.ok(esperados.includes(r.status), `esperaba ${esperados.join('/')} y llegó ${r.status}: ${r.texto.slice(0, 200)}`);
    assert.ok(r.json !== null, 'la respuesta no es JSON');
    if (clave) assert.ok(clave in r.json, `falta la clave "${clave}" en ${r.texto.slice(0, 200)}`);
  });
}
