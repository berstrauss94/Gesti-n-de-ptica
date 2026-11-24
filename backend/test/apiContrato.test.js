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
  ['POST', '/api/mercado/no-es-uuid/producto', { body: {} }, [400], 'error'],
  ['POST', '/api/mercado/00000000-0000-0000-0000-000000000000/producto', { token: tokenVendedor, body: {} }, [403], 'error'],
  ['POST', '/api/mercado/00000000-0000-0000-0000-000000000000/producto', { body: { cantidad: 2 } }, [400], 'error'],
  ['POST', '/api/mercado/00000000-0000-0000-0000-000000000000/producto', { body: { cantidad: -1 } }, [400], 'error'],
  ['POST', '/api/mercado/enriquecer', { body: { marca: 'Ray-Ban', modelo: 'RB3025' } }, [409], 'error'],
  ['POST', '/api/mercado/enriquecer', { token: tokenVendedor, body: { marca: 'Ray-Ban' } }, [403], 'error'],
  ['GET', '/api/medicos', { token: tokenVendedor }, [200], 'medicos'],
  ['POST', '/api/medicos', { token: tokenVendedor, body: { nombre: 'Dr. X' } }, [403], 'error'],
  ['POST', '/api/medicos', { body: { nombre: '' } }, [400], 'error'],
  ['GET', '/api/stock/filtros', { token: tokenVendedor }, [200], 'proveedores'],
  ['GET', '/api/stock?sucursal_id=s&genero=Mujer&material=Metal&proveedor_id=p&limit=20&offset=0', {}, [200], 'total'],
  ['GET', '/api/stock?q=Rayban', {}, [200], 'parecidos'],
  ['GET', '/api/stock?sucursal_id=s&categoria=armazon&modelo=RB%2050%25_', {}, [200], 'total'],
  ['GET', '/api/stock?sucursal_id=s&modelo=Rayban', {}, [200], 'parecidos'],
  ['GET', '/api/stock?q=ray&modelo=aviatr&categoria=armazon', {}, [200], 'parecidos'],
  ['POST', '/api/productos', { body: { codigo: 'X1', nombre: 'Marco', categoria: 'armazon', genero: 'Otro' } }, [400], 'error'],
  ['POST', '/api/productos', { body: { codigo: 'X1', nombre: 'Marco', categoria: 'armazon', material: 'x'.repeat(41) } }, [400], 'error'],
  ['GET', '/api/stock?q=ray%20ban%20aviator', {}, [200], 'stock'],
  ['POST', '/api/productos/importar', { body: { filas: [
    { codigo: 'A1', nombre: 'Marco', genero: 'mujer', material: 'Metal', ubicacion: 'Expositor A' },
    { codigo: 'A2', nombre: 'Marco', genero: 'Otro' },
    { codigo: 'A3', nombre: 'Marco', proveedor: 'No existe SA' },
  ] } }, [200], 'errores'],
  ['POST', '/api/productos/importar', { body: { filas: [{ codigo_barras: '7790001', genero: 'mujer' }] } }, [200], 'errores'],
  ['GET', '/api/mercado/predict-attributes?marca=Ray-Ban', {}, [200], 'predictions'],
  ['GET', '/api/mercado/predict-attributes?marca=', {}, [200], 'predictions'],
  ['GET', `/api/mercado/predict-attributes?marca=${'x'.repeat(121)}`, {}, [400], 'error'],
  ['POST', '/api/productos/importar', { token: tokenVendedor, body: { filas: [{ codigo: 'A1' }] } }, [403], 'error'],
  ['PATCH', '/api/sobres/x/estado', { body: { estado: 'taller_listo' } }, [400], 'error'],
  ['PATCH', '/api/sobres/00000000-0000-0000-0000-000000000000/estado', { body: { estado: 'lentes' } }, [404], 'error'],
  ['POST', '/api/uploads/tryon', { body: {} }, [400], 'error'],
  ['POST', '/api/uploads/tryon', { token: null, body: {} }, [401], 'error'],
  ['GET', '/api/sobres', { token: null }, [401], 'error'],
  ['GET', '/api/laboratorio/catalogo?categoria=1%20MONOFOCALES&q=blue%20tech', {}, [200], 'data'],
  ['GET', '/api/laboratorio/categorias', { token: tokenVendedor }, [200], 'categorias'],
  ['GET', '/api/laboratorio/catalogo', { token: null }, [401], 'error'],
  ['POST', '/api/laboratorio/validar-receta', { body: {} }, [400], 'error'],
  ['POST', '/api/laboratorio/validar-receta', { body: { cristal_id: 1, esfera: 'abc' } }, [400], 'error'],
  ['POST', '/api/laboratorio/validar-receta', { body: { cristal_id: 999999, esfera: -2 } }, [404], 'error'],
  ['PUT', '/api/laboratorio/actualizacion-masiva', { token: tokenVendedor, body: { porcentaje: 10, categoria: 'x' } }, [403], 'error'],
  ['PUT', '/api/laboratorio/actualizacion-masiva', { body: { porcentaje: 10 } }, [400], 'error'],
  ['PUT', '/api/laboratorio/actualizacion-masiva', { body: { porcentaje: 0, categoria: 'x' } }, [400], 'error'],
  ['PUT', '/api/laboratorio/actualizacion-masiva', { body: { porcentaje: 900, categoria: 'x' } }, [400], 'error'],
  ['POST', '/api/laboratorio/importar', { token: tokenVendedor, body: { filas: [{}] } }, [403], 'error'],
  ['POST', '/api/laboratorio/importar', { body: { filas: [] } }, [400], 'error'],
  ['GET', '/api/notificaciones/recordatorios', { token: tokenVendedor }, [200], 'recordatorios'],
  ['GET', '/api/notificaciones/recordatorios?estado=zzz', {}, [400], 'error'],
  ['GET', '/api/notificaciones/recordatorios', { token: null }, [401], 'error'],
  ['POST', '/api/notificaciones/recordatorios', { body: {} }, [400], 'error'],
  ['POST', '/api/notificaciones/recordatorios', { body: { nombre: 'Ana', telefono: '123', fecha_evento: '2030-01-01', anticipaciones: ['1_mes'] } }, [400], 'error'],
  ['POST', '/api/notificaciones/recordatorios', { body: { nombre: 'Ana', telefono: '11 5555 1234', fecha_evento: '2020-01-01', anticipaciones: ['1_mes'] } }, [400], 'error'],
  ['POST', '/api/notificaciones/recordatorios', { body: { nombre: 'Ana', telefono: '11 5555 1234', fecha_evento: '2099-01-01', anticipaciones: ['1_mes'] } }, [400], 'error'],
  ['POST', '/api/notificaciones/recordatorios', { body: { nombre: 'Ana', telefono: '11 5555 1234', fecha_evento: '2999-02-31', anticipaciones: ['1_mes'] } }, [400], 'error'],
  ['PATCH', '/api/notificaciones/recordatorios/no-es-uuid/cancelar', {}, [400], 'error'],
  ['POST', '/api/notificaciones/recordatorios/procesar', { token: tokenVendedor, body: {} }, [403], 'error'],
  ['PUT', '/api/notificaciones/config', { body: { whatsapp_plantilla: 'Con Espacios' } }, [400], 'error'],
  ['PUT', '/api/notificaciones/config', { body: { whatsapp_idioma: 'espanol' } }, [400], 'error'],
  ['GET', '/api/asistente/opciones', { token: tokenVendedor }, [200], 'data'],
  ['GET', '/api/asistente/opciones', { token: null }, [401], 'error'],
  ['POST', '/api/asistente/consultar', { body: {} }, [400], 'error'],
  ['POST', '/api/asistente/consultar', { body: { preguntaId: 'no-es-uuid' } }, [400], 'error'],
  ['POST', '/api/asistente/consultar', { body: { preguntaId: '00000000-0000-0000-0000-000000000000' } }, [404], 'error'],
  ['POST', '/api/asistente/consultar', { body: { consultaManual: 'x'.repeat(501) } }, [400], 'error'],
  ['POST', '/api/asistente/consultar', { body: { consultaManual: 'como cargo un turno' } }, [200], 'respuesta'],
  ['POST', '/api/asistente/valorar', { body: {} }, [400], 'error'],
  ['POST', '/api/asistente/valorar', { body: { consulta_id: '00000000-0000-0000-0000-000000000000', valoracion: 5 } }, [400], 'error'],
  ['POST', '/api/asistente/valorar', { body: { consulta_id: '00000000-0000-0000-0000-000000000000', valoracion: 1 } }, [404], 'error'],
  ['GET', '/api/asistente/consultas', { token: tokenVendedor }, [403], 'error'],
  ['GET', '/api/asistente/consultas?fuente=zzz', {}, [400], 'error'],
  ['GET', '/api/asistente/consultas?valoracion=3', {}, [400], 'error'],
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
