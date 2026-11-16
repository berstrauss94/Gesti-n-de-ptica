// Pruebas del intérprete local de búsquedas (frontend/src/utils/busquedaNatural.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { interpretarBusqueda } from '../../frontend/src/utils/busquedaNatural.js';

const MATERIALES = ['Acetato', 'Metal', 'Titanio', 'Inyección'];
const i = (t, materiales = MATERIALES) => interpretarBusqueda(t, { materiales });

test('"marcos de mujer en metal" -> Mujer + Metal, sin texto', () => {
  assert.deepEqual(i('marcos de mujer en metal'), {
    q: '', genero: 'Mujer', material: 'Metal', detectado: ['Género Mujer', 'Material Metal'],
  });
});

test('deja la marca o el modelo como texto de búsqueda', () => {
  const r = i('Ray-Ban de mujer');
  assert.equal(r.q, 'Ray-Ban');
  assert.equal(r.genero, 'Mujer');
  assert.equal(r.material, null);
});

test('sin acentos, en mayúsculas y en plural', () => {
  assert.equal(i('ARMAZONES DE NIÑO').genero, 'Niño');
  assert.equal(i('armazones de nino').genero, 'Niño');
  assert.equal(i('marcos de inyeccion').material, 'Inyección');
  assert.equal(i('acetatos para hombres').material, 'Acetato');
  assert.equal(i('acetatos para hombres').genero, 'Hombre');
});

test('sinónimos de género', () => {
  assert.equal(i('anteojos de dama').genero, 'Mujer');
  assert.equal(i('caballero titanio').genero, 'Hombre');
  assert.equal(i('caballero titanio').material, 'Titanio');
  assert.equal(i('infantil').genero, 'Niño');
});

test('usa la forma del material tal como está en la base', () => {
  assert.equal(i('marcos de metal', ['metal', 'Metal']).material, 'metal');
});

test('reconoce materiales de varias palabras cargados en la base', () => {
  const r = i('acero inoxidable de mujer', ['Acero', 'Acero inoxidable']);
  assert.equal(r.material, 'Acero inoxidable');
  assert.equal(r.q, '');
});

test('si no reconoce nada, deja el texto intacto (incluidas las palabras de relleno)', () => {
  assert.deepEqual(i('Ray-Ban de sol'), { q: 'Ray-Ban de sol', genero: null, material: null, detectado: [] });
  assert.deepEqual(i(''), { q: '', genero: null, material: null, detectado: [] });
});

test('una palabra que contiene un material no se confunde ("metalizado")', () => {
  assert.equal(i('metalizado').material, null);
});
