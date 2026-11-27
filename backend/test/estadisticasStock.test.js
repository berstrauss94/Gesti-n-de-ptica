// Pruebas de los cálculos puros de Estadísticas de stock
// (services/rotabilidadService.armarRotabilidad, flujoCajaService.armarFlujo)
// y de la validación de filtros del controller.
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'secreto-de-prueba';
const test = require('node:test');
const assert = require('node:assert/strict');
const { armarRotabilidad, armarProveedores } = require('../src/services/rotabilidadService');
const { armarFlujo } = require('../src/services/flujoCajaService');
const { leerFiltros } = require('../src/controllers/estadisticasController');

const AHORA = Date.parse('2026-11-25T12:00:00Z');
const fila = (o) => ({
  producto_id: o.id, codigo: o.id, nombre: o.nombre || o.id, marca: null, categoria: 'armazon',
  costo_base: o.costo ?? '100', precio_venta: '250', alta: '2026-01-01T00:00:00Z',
  stock: o.stock ?? 0, unidades: o.unidades ?? 0, ingresos: o.ingresos ?? '0',
  dias_promedio: o.dias ?? null, ultima_venta: o.ultima ?? null,
  ultima_venta_historica: o.hist ?? null, ultimo_ingreso: o.ingreso ?? null,
});

test('rankings: más vendidos ordenados, menos vendidos sin repetir el top', () => {
  const filas = Array.from({ length: 13 }, (_, i) => fila({ id: 'p' + i, unidades: i + 1, ingresos: String((i + 1) * 250) }));
  const r = armarRotabilidad(filas, { diasPeriodo: 180, ahora: AHORA });
  assert.equal(r.mas_vendidos.length, 10);
  assert.equal(r.mas_vendidos[0].producto_id, 'p12');
  assert.deepEqual(r.menos_vendidos.map((p) => p.producto_id), ['p0', 'p1', 'p2']);
  assert.equal(r.resumen.producto_estrella.producto_id, 'p12');
});

test('días en stock: promedio ponderado por unidades, ignora los que no tienen dato', () => {
  const r = armarRotabilidad([
    fila({ id: 'a', unidades: 3, dias: 10 }),
    fila({ id: 'b', unidades: 1, dias: 50 }),
    fila({ id: 'c', unidades: 2, dias: null }),
  ], { diasPeriodo: 180, ahora: AHORA });
  assert.equal(r.resumen.dias_promedio_stock, 20); // (3*10 + 1*50) / 4
});

test('ganancia estimada y cobertura del stock al ritmo del período', () => {
  const r = armarRotabilidad([fila({ id: 'a', unidades: 6, ingresos: '1500', costo: '100', stock: 4 })], { diasPeriodo: 180, ahora: AHORA });
  const a = r.mas_vendidos[0];
  assert.equal(a.costo_vendido, 600);
  assert.equal(a.ganancia, 900);
  assert.equal(a.dias_cobertura, 120); // 4 unidades / (6 por 180 días)
  assert.equal(r.resumen.ganancia_estimada, 900);
});

test('stock inmóvil: con stock y sin ventas, ordenado por capital y con días sin vender', () => {
  const r = armarRotabilidad([
    fila({ id: 'chico', stock: 1, costo: '100', ingreso: '2026-11-15T12:00:00Z' }),
    fila({ id: 'grande', stock: 5, costo: '300', hist: '2026-05-29T12:00:00Z' }),
    fila({ id: 'vendido', unidades: 2, stock: 3 }),
    fila({ id: 'sin-stock', stock: 0 }),
  ], { diasPeriodo: 180, ahora: AHORA });
  assert.deepEqual(r.sin_movimiento.map((p) => p.producto_id), ['grande', 'chico']);
  assert.equal(r.sin_movimiento[0].capital_inmovilizado, 1500);
  assert.equal(r.sin_movimiento[0].dias_sin_venta, 180);
  assert.equal(r.sin_movimiento[1].dias_sin_venta, 10);
  assert.equal(r.resumen.productos_sin_movimiento, 2);
  assert.equal(r.resumen.capital_inmovilizado, 1600);
});

test('sin datos: todo en cero y sin romper', () => {
  const r = armarRotabilidad([], { diasPeriodo: 180, ahora: AHORA });
  assert.equal(r.resumen.unidades_vendidas, 0);
  assert.equal(r.resumen.dias_promedio_stock, null);
  assert.equal(r.resumen.producto_estrella, null);
  assert.deepEqual(armarFlujo([]).totales.flujo_neto, 0);
});

test('flujo: cobrado = ventas + sobres, neto contra compras y variación mensual', () => {
  const f = armarFlujo([
    { mes: '2026-10', ventas: '1000', cobrado_ventas: '800', cobrado_sobres: '200', compras: '1500', unidades: 4 },
    { mes: '2026-11', ventas: '1500', cobrado_ventas: '1200', cobrado_sobres: '0', compras: '0', unidades: 6 },
  ]);
  assert.equal(f.meses[0].cobrado, 1000);
  assert.equal(f.meses[0].flujo_neto, -500);
  assert.equal(f.meses[0].variacion_ventas_pct, null);
  assert.equal(f.meses[1].variacion_ventas_pct, 50);
  assert.equal(f.totales.flujo_neto, 700);
  assert.equal(f.totales.unidades, 10);
});

test('proveedores: redondea días y respeta nulos', () => {
  const p = armarProveedores([{ proveedor: 'LENAIN', compras: '2', total: '1000', dias_promedio: '3.456', dias_maximo: null }]);
  assert.deepEqual([p[0].compras, p[0].dias_promedio, p[0].dias_maximo], [2, 3.5, null]);
});

test('filtros: meses 1 a 24 y sucursal UUID', () => {
  assert.deepEqual(leerFiltros({}), { sucursalId: null, meses: 6 });
  assert.equal(leerFiltros({ meses: '12' }).meses, 12);
  assert.ok(leerFiltros({ meses: '25' }).error);
  assert.ok(leerFiltros({ meses: '1.5' }).error);
  assert.ok(leerFiltros({ sucursal_id: "x' OR 1=1" }).error);
});
