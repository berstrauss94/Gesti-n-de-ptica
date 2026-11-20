// Pruebas de las funciones puras de los recordatorios de turnos:
// fechas de envío, teléfonos de Argentina y armado del mensaje.
const test = require('node:test');
const assert = require('node:assert/strict');
const u = require('../src/services/recordatoriosUtil');

const iso = (d) => (d ? d.toISOString() : null);

test('cada anticipación sale a las 10:00 de Argentina (13:00 UTC)', () => {
  assert.equal(iso(u.fechaProgramada('2027-01-20', '1_mes')), '2026-12-20T13:00:00.000Z');
  assert.equal(iso(u.fechaProgramada('2027-01-20', '2_semanas')), '2027-01-06T13:00:00.000Z');
  assert.equal(iso(u.fechaProgramada('2027-01-20', '1_semana')), '2027-01-13T13:00:00.000Z');
  assert.equal(iso(u.fechaProgramada('2027-01-20', '4_dias')), '2027-01-16T13:00:00.000Z');
});

test('"1 mes antes" respeta fin de mes y cambio de año', () => {
  assert.equal(iso(u.fechaProgramada('2027-03-31', '1_mes')), '2027-02-28T13:00:00.000Z'); // 31/03 -> 28/02
  assert.equal(iso(u.fechaProgramada('2028-03-31', '1_mes')), '2028-02-29T13:00:00.000Z'); // año bisiesto
  assert.equal(iso(u.fechaProgramada('2027-01-15', '1_mes')), '2026-12-15T13:00:00.000Z'); // cruza de año
});

test('días personalizados: entre 1 y 365', () => {
  assert.equal(iso(u.fechaProgramada('2027-01-20', 'personalizado', 10)), '2027-01-10T13:00:00.000Z');
  assert.equal(iso(u.fechaProgramada('2027-01-20', 'personalizado', 1)), '2027-01-19T13:00:00.000Z');
  assert.equal(u.fechaProgramada('2027-01-20', 'personalizado', 0), null);
  assert.equal(u.fechaProgramada('2027-01-20', 'personalizado', 366), null);
  assert.equal(u.fechaProgramada('2027-01-20', 'personalizado', 2.5), null);
  assert.equal(u.fechaProgramada('2027-01-20', 'personalizado'), null);
});

test('datos inválidos no producen fecha', () => {
  assert.equal(u.fechaProgramada('2027-02-31', '1_mes'), null);
  assert.equal(u.fechaProgramada('20/01/2027', '1_mes'), null);
  assert.equal(u.fechaProgramada('2027-01-20', 'inexistente'), null);
  assert.equal(u.fechaProgramada('', '1_mes'), null);
});

test('el día se calcula en hora de Argentina, no en UTC', () => {
  assert.equal(u.fechaISOArgentina('2027-01-20T02:59:00Z'), '2027-01-19'); // 23:59 del 19 en Argentina
  assert.equal(u.fechaISOArgentina('2027-01-20T03:00:00Z'), '2027-01-20');
  assert.equal(u.fechaISOArgentina(new Date('2027-01-20T15:00:00Z')), '2027-01-20');
});

test('fecha en palabras', () => {
  assert.equal(u.fechaLarga('2027-01-20'), '20 de enero de 2027');
  assert.equal(u.fechaLarga('2026-12-01'), '1 de diciembre de 2026');
});

test('teléfonos de Argentina al formato de WhatsApp (549 + área + número)', () => {
  const ok = '5491155551234';
  assert.equal(u.normalizarTelefono('011 15 5555-1234'), ok);
  assert.equal(u.normalizarTelefono('+54 9 11 5555 1234'), ok);
  assert.equal(u.normalizarTelefono('+54 11 5555 1234'), ok);
  assert.equal(u.normalizarTelefono('5491155551234'), ok);
  assert.equal(u.normalizarTelefono('11 5555 1234'), ok);
  assert.equal(u.normalizarTelefono('(011) 5555-1234'), ok);
  assert.equal(u.normalizarTelefono('0221 15 456 7890'), '5492214567890'); // área de 3 dígitos
  assert.equal(u.normalizarTelefono('0351 15 612 3456'), '5493516123456');
});

test('teléfonos de otros países solo con "+" o "00"', () => {
  assert.equal(u.normalizarTelefono('+1 305 555 1234'), '13055551234');
  assert.equal(u.normalizarTelefono('00 598 99 123 456'), '59899123456');
  assert.equal(u.normalizarTelefono('+55 11 91234 5678'), '5511912345678');
});

test('teléfonos incompletos o inventados se rechazan', () => {
  assert.equal(u.normalizarTelefono(''), null);
  assert.equal(u.normalizarTelefono(null), null);
  assert.equal(u.normalizarTelefono('abc'), null);
  assert.equal(u.normalizarTelefono('123'), null);
  assert.equal(u.normalizarTelefono('5555 1234'), null);          // sin código de área
  assert.equal(u.normalizarTelefono('15 5555 1234'), null);       // empieza con 15 y no trae el área
  assert.equal(u.normalizarTelefono('+54 9 11 5555 123'), null);  // le falta un dígito
  assert.equal(u.normalizarTelefono('+54 9 11 5555 12345'), null); // le sobra un dígito
  assert.equal(u.normalizarTelefono('+1 23'), null);
});

test('el mensaje reemplaza {nombre}, {fecha} y {local}', () => {
  const m = u.armarMensaje('Hola {nombre}, el {FECHA} en {Local}.', { nombre: 'Ana', fecha: '20 de enero de 2027', local: 'Casa Central' });
  assert.equal(m, 'Hola Ana, el 20 de enero de 2027 en Casa Central.');
});

test('mensaje base y valores faltantes', () => {
  const m = u.armarMensaje(null, { nombre: 'Luis', fecha: '5 de marzo de 2027' });
  assert.match(m, /Hola Luis/);
  assert.match(m, /5 de marzo de 2027/);
  assert.match(m, /nuestra óptica/);
  assert.doesNotMatch(m, /\{/);
});
