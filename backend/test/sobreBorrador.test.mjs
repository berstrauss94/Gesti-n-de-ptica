// Pruebas del borrador local del Sobre (frontend/src/utils/sobreBorrador.js)
// con un localStorage simulado en memoria.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  claveBorrador, guardarBorrador, leerBorrador, leerRespaldo, iniciarBorrador,
  listarBorradores, borrarTodo, mismosDatos, combinar, armarBorrador, guardarRespaldo,
} from '../../frontend/src/utils/sobreBorrador.js';

function memoria() {
  const m = new Map();
  return {
    get length() { return m.size; },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}
const lleno = () => { throw new Error('QuotaExceededError'); };
const base = { form: { cliente_id: '', notas: '' }, items: [], pagos: [] };
const cargado = { form: { cliente_id: 'c1', notas: 'urgente' }, items: [{ descripcion: 'Estuche', precio: '500' }], pagos: [] };

test('un borrador por sobre: el del alta no se mezcla con el de un sobre guardado', () => {
  const st = memoria();
  guardarBorrador(st, null, cargado, { sucursalId: 's1' });
  assert.equal(leerBorrador(st, 'id-12'), null);
  assert.deepEqual(leerBorrador(st, null).datos, cargado);
  assert.equal(claveBorrador(null), 'optica_sobre_borrador_v1:nuevo');
});

test('al abrir el alta se aplica solo el borrador de la misma sucursal', () => {
  const st = memoria();
  guardarBorrador(st, null, cargado, { sucursalId: 's1' });
  const r = iniciarBorrador(st, { sobreId: null, base, sucursalId: 's1' });
  assert.deepEqual(r.datos, cargado);
  assert.ok(r.restaurado);
});

test('alta de otra sucursal: no se aplica solo, pasa a respaldo y no se pierde', () => {
  const st = memoria();
  guardarBorrador(st, null, cargado, { sucursalId: 's1' });
  const r = iniciarBorrador(st, { sobreId: null, base, sucursalId: 's2' });
  assert.deepEqual(r.datos, base);
  assert.equal(r.motivo, 'sucursal');
  assert.equal(leerBorrador(st, null), null);
  assert.deepEqual(leerRespaldo(st, null).datos, cargado);
});

test('sobre guardado: el borrador se aplica solo si el sobre no cambió en el servidor', () => {
  const st = memoria();
  guardarBorrador(st, 'id-12', cargado, { version: '2026-11-25T10:00:00Z' });
  const igual = iniciarBorrador(st, { sobreId: 'id-12', base, version: '2026-11-25T10:00:00Z' });
  assert.deepEqual(igual.datos, cargado);

  const cambio = iniciarBorrador(st, { sobreId: 'id-12', base, version: '2026-11-25T11:30:00Z' });
  assert.deepEqual(cambio.datos, base);
  assert.equal(cambio.motivo, 'version');
  assert.deepEqual(leerRespaldo(st, 'id-12').datos, cargado);
});

test('combinar completa campos nuevos del formulario que el borrador no tenía', () => {
  const r = combinar({ ...base, form: { ...base.form, campo_nuevo: '' } }, { form: { notas: 'x' }, items: [], pagos: [] });
  assert.deepEqual(r.form, { cliente_id: '', notas: 'x', campo_nuevo: '' });
});

test('borrarTodo (al guardar en el sistema) quita borrador y respaldo', () => {
  const st = memoria();
  guardarBorrador(st, 'id-1', cargado);
  guardarRespaldo(st, 'id-1', armarBorrador(cargado));
  borrarTodo(st, 'id-1');
  assert.equal(leerBorrador(st, 'id-1'), null);
  assert.equal(leerRespaldo(st, 'id-1'), null);
});

test('listarBorradores ignora respaldos y datos corruptos', () => {
  const st = memoria();
  guardarBorrador(st, null, cargado);
  guardarBorrador(st, 'id-7', cargado, { numero: 7 });
  guardarRespaldo(st, 'id-7', armarBorrador(cargado));
  st.setItem('optica_sobre_borrador_v1:roto', '{no es json');
  st.setItem('otra_cosa', '1');
  const l = listarBorradores(st);
  assert.deepEqual(l.map((b) => String(b.sobreId)).sort(), ['id-7', 'null']);
  assert.equal(l.find((b) => b.sobreId === 'id-7').numero, 7);
});

test('almacenamiento lleno o bloqueado: no rompe, avisa con false', () => {
  const st = { ...memoria(), setItem: lleno };
  assert.equal(guardarBorrador(st, null, cargado), false);
  assert.equal(leerBorrador(null, null), null);
  assert.deepEqual(listarBorradores(null), []);
});

test('mismosDatos detecta cambios', () => {
  assert.equal(mismosDatos(base, JSON.parse(JSON.stringify(base))), true);
  assert.equal(mismosDatos(base, cargado), false);
});
