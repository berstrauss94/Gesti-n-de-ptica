// Pruebas de la hoja A4 del Sobre (frontend/src/utils/impresionSobreA4.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { htmlSobreA4, esc, fechaAR } from '../../frontend/src/utils/impresionSobreA4.js';

const datos = (extra = {}) => ({
  numero: 42, borrador: false, sucursal: 'Casa Central', estado: 'Pendiente',
  paciente: { nombre: 'Ana <b>Pérez</b>', dni: '30111222' },
  medico: { nombre: 'GUITART VIRGINIA', matricula: '8311' },
  obraSocial: 'OSDE *', laboratorio: 'LENAIN VISIÓN',
  armazonLejos: '12615 · Fulanito', armazonCerca: 'Propio del paciente',
  form: {
    fecha_receta: '2026-11-25', fecha_entrega: '2026-11-28',
    lejos_od_esf: '-1.25', lejos_od_cil: '-0.50', lejos_od_eje: '90', lejos_oi_esf: '-1.00',
    lente_lejos_descripcion: '1494 Monofocal', notas: '<script>alert(1)</script>',
    descuento_tipo: 'porcentaje', descuento_valor: '10',
  },
  items: [{ descripcion: 'Estuche', precio: '500' }],
  pagos: [{ fecha: '2026-11-25', medio_pago: 'Efectivo', detalle: 'seña', importe: '1000' }],
  totales: { subtotal_lejos: 5000, subtotal_cerca: 0, total_otros: 500, subtotal: 5500, descuento: 550, recargo: 0, total: 4950, pagado: 1000, saldo: 3950 },
  colsLejos: [['esf', 'ESF'], ['cil', 'CIL'], ['eje', 'EJE']],
  colsCerca: [['esf', 'ESF'], ['deg', 'DEG']],
  cotas: [['arm_puente', 'Puente']],
  ...extra,
});

test('hoja A4 con número, fechas, receta, médico e importes', () => {
  const h = htmlSobreA4(datos());
  assert.match(h, /@page \{ size: A4/);
  assert.match(h, /Sobre N° 42/);
  assert.match(h, /25\/11\/2026/);
  assert.match(h, /28\/11\/2026/);
  assert.match(h, /<td>-1\.25<\/td><td>-0\.50<\/td><td>90<\/td>/);
  assert.match(h, /M\.P\. 8311 GUITART VIRGINIA/);
  assert.match(h, /Descuento \(10%\)/);
  assert.ok(h.includes('3.950,00'), 'saldo con formato argentino');
  assert.ok(!h.includes('BORRADOR'));
});

test('escapa todo lo cargado por el usuario (no inyecta HTML ni scripts)', () => {
  const h = htmlSobreA4(datos());
  assert.ok(!h.includes('<script>alert(1)</script>'));
  assert.ok(h.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(h.includes('Ana &lt;b&gt;Pérez&lt;/b&gt;'));
});

test('sobre nuevo o con cambios: lleva la marca de borrador', () => {
  const h = htmlSobreA4(datos({ numero: null, borrador: true }));
  assert.match(h, /Sobre nuevo/);
  assert.match(h, /BORRADOR — SIN GUARDAR/);
});

test('sin obra social dice Particular; sin pagos lo aclara', () => {
  const h = htmlSobreA4(datos({ obraSocial: '', pagos: [] }));
  assert.match(h, /Particular/);
  assert.match(h, /Sin pagos ni entregas a cuenta/);
});

test('helpers', () => {
  assert.equal(esc(`a"b'<>&`), 'a&quot;b&#39;&lt;&gt;&amp;');
  assert.equal(fechaAR('2026-01-05T00:00:00Z'), '05/01/2026');
  assert.equal(fechaAR(''), '—');
});
