// Pruebas de las calculadoras ópticas del Sobre (frontend/src/utils/receta.js).
// Son funciones puras: se prueban desde acá sin levantar React.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  transponer, calcularCerca, rotarEje, formatearDioptria, aNumero,
} from '../../frontend/src/utils/receta.js';

test('transpone cilindro negativo a positivo', () => {
  assert.deepEqual(transponer({ esf: '-1.00', cil: '-0.50', eje: '90' }), { esf: '-1.50', cil: '+0.50', eje: '180' });
});

test('acepta coma decimal', () => {
  assert.deepEqual(transponer({ esf: '+2,00', cil: '+1,25', eje: '45' }), { esf: '+3.25', cil: '-1.25', eje: '135' });
});

test('el eje queda en 1..180: nunca 0', () => {
  assert.equal(rotarEje('90'), 180);
  assert.equal(rotarEje('180'), 90);
  assert.equal(rotarEje('0'), 90); // 0 se toma como 180
  assert.equal(rotarEje('135'), 45);
  for (let e = 0; e <= 180; e += 1) {
    const r = rotarEje(String(e));
    assert.ok(r >= 1 && r <= 180, `eje ${e} -> ${r}`);
  }
});

test('transponer dos veces vuelve al original', () => {
  const ida = transponer({ esf: '-1.00', cil: '-0.50', eje: '30' });
  assert.deepEqual(transponer(ida), { esf: '-1.00', cil: '-0.50', eje: '30' });
});

test('sin cilindro (o cilindro 0) no transpone', () => {
  assert.equal(transponer({ esf: '-1', cil: '', eje: '90' }), null);
  assert.equal(transponer({ esf: '-1', cil: '0', eje: '90' }), null);
});

test('cerca = esfera de lejos + adición; cilindro y eje se copian', () => {
  assert.deepEqual(calcularCerca({ esf: '-1.00', cil: '-0.50', eje: '90', add: '+2.00' }), { esf: '+1.00', cil: '-0.50', eje: '90' });
  assert.deepEqual(calcularCerca({ esf: '-2.00', cil: '', eje: '', add: '2' }), { esf: '0.00', cil: '', eje: '' });
});

test('sin adición no calcula cerca', () => {
  assert.equal(calcularCerca({ esf: '-1', cil: '', eje: '', add: '' }), null);
  assert.equal(calcularCerca({ esf: '-1', cil: '', eje: '', add: '0' }), null);
});

test('redondeo a 2 decimales y texto inválido', () => {
  assert.equal(formatearDioptria(0.1 + 0.2), '+0.30');
  assert.equal(formatearDioptria(-0.5), '-0.50');
  assert.equal(aNumero('abc'), null);
  assert.equal(aNumero(''), null);
});
