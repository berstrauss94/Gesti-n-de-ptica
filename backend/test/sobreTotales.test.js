// Fórmulas del Sobre: subtotales, descuento (porcentaje / monto), recargo, total y saldo.
const test = require('node:test');
const assert = require('node:assert/strict');
const { calcularTotales } = require('../src/services/sobreTotales');

test('sobre vacío: todo en cero', () => {
  const t = calcularTotales({}, [], []);
  assert.deepEqual(t, { subtotal_lejos: 0, subtotal_cerca: 0, total_otros: 0, subtotal: 0, descuento: 0, recargo: 0, total: 0, pagado: 0, saldo: 0 });
});

test('ejemplo de la consigna: lente 1494 en lejos ($416.708)', () => {
  const t = calcularTotales({ lente_lejos_precio: '416708.00' }, [], []);
  assert.equal(t.subtotal_lejos, 416708);
  assert.equal(t.subtotal, 416708);
  assert.equal(t.total, 416708);
  assert.equal(t.saldo, 416708);
});

test('suma lejos + cerca + otros, descuento %, recargo y pagos', () => {
  const t = calcularTotales(
    { lente_lejos_precio: 100000, armazon_lejos_precio: 50000, lente_cerca_precio: 80000, armazon_cerca_precio: 0,
      descuento_tipo: 'porcentaje', descuento_valor: 10, recargo: 5000 },
    [{ precio: 6600 }, { precio: '3400.00' }],
    [{ importe: 100000 }, { importe: '20000' }]
  );
  assert.equal(t.subtotal_lejos, 150000);
  assert.equal(t.subtotal_cerca, 80000);
  assert.equal(t.total_otros, 10000);
  assert.equal(t.subtotal, 240000);
  assert.equal(t.descuento, 24000);
  assert.equal(t.total, 221000);
  assert.equal(t.pagado, 120000);
  assert.equal(t.saldo, 101000);
});

test('descuento en monto no supera el subtotal y el total nunca es negativo', () => {
  const t = calcularTotales({ lente_lejos_precio: 1000, descuento_tipo: 'monto', descuento_valor: 5000 }, [], []);
  assert.equal(t.descuento, 1000);
  assert.equal(t.total, 0);
});

test('porcentaje mayor a 100 se toma como 100; tipo desconocido no descuenta', () => {
  assert.equal(calcularTotales({ lente_lejos_precio: 1000, descuento_tipo: 'porcentaje', descuento_valor: 150 }).total, 0);
  assert.equal(calcularTotales({ lente_lejos_precio: 1000, descuento_tipo: 'otro', descuento_valor: 50 }).total, 1000);
});

test('saldo negativo cuando se pagó de más (saldo a favor del cliente)', () => {
  const t = calcularTotales({ lente_lejos_precio: 1000 }, [], [{ importe: 1500 }]);
  assert.equal(t.saldo, -500);
});

test('redondeo a centavos', () => {
  const t = calcularTotales({ lente_lejos_precio: 0.1, armazon_lejos_precio: 0.2, descuento_tipo: 'porcentaje', descuento_valor: 33.333 }, [], []);
  assert.equal(t.subtotal_lejos, 0.3);
  assert.equal(t.descuento, 0.1);
  assert.equal(t.total, 0.2);
});
