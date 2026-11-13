// Pruebas del chequeo previo de migraciones (sin base de datos).
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const { MIGRACIONES } = require('../src/config/migrate');
const { verificarMigraciones } = require('../src/config/verificarMigraciones');

test('las migraciones actuales no son destructivas y se pueden repetir', () => {
  const problemas = verificarMigraciones(MIGRACIONES);
  assert.deepEqual(problemas, [], JSON.stringify(problemas, null, 2));
});

test('incluye las tablas de la Etapa 1 de Sobres', () => {
  for (const t of ['medicos', 'sobre_items_adicionales', 'sobre_pagos']) {
    assert.ok(MIGRACIONES.some((s) => s.includes(`CREATE TABLE IF NOT EXISTS ${t}`)), `falta ${t}`);
  }
});

test('las tablas se crean antes de las columnas que las referencian', () => {
  const idx = (s) => MIGRACIONES.findIndex((m) => m.includes(s));
  assert.ok(idx('CREATE TABLE IF NOT EXISTS medicos') < idx('ADD COLUMN IF NOT EXISTS medico_id'));
  assert.ok(idx('CREATE TABLE IF NOT EXISTS sobres') < idx('ADD COLUMN IF NOT EXISTS medico_id'));
  assert.ok(idx('CREATE TABLE IF NOT EXISTS ordenes_laboratorio') < idx('orden_laboratorio_id'));
});

test('detecta sentencias destructivas', () => {
  const malas = [
    'DROP TABLE sobres',
    'ALTER TABLE sobres DROP COLUMN notas',
    'TRUNCATE ventas',
    'DELETE FROM pagos',
    'ALTER TABLE sobres RENAME COLUMN notas TO obs',
    'ALTER TABLE sobres ALTER COLUMN total TYPE INT',
  ];
  malas.forEach((sql) => assert.ok(verificarMigraciones([sql]).length > 0, `no detectó: ${sql}`));
});

test('detecta sentencias que no se pueden repetir', () => {
  const malas = [
    'CREATE TABLE x (id INT)',
    'CREATE INDEX idx_x ON x(id)',
    'ALTER TABLE x ADD COLUMN y INT',
    "INSERT INTO x (id) VALUES (1)",
    'UPDATE x SET y = 1',
    'CREATE FUNCTION f() RETURNS INT AS $$ SELECT 1 $$ LANGUAGE sql',
    'CREATE TRIGGER t BEFORE UPDATE ON x FOR EACH ROW EXECUTE FUNCTION f()',
  ];
  malas.forEach((sql) => assert.ok(verificarMigraciones([sql]).length > 0, `no detectó: ${sql}`));
});

test('acepta los patrones seguros', () => {
  const buenas = [
    'CREATE TABLE IF NOT EXISTS x (id INT)',
    'CREATE INDEX IF NOT EXISTS idx_x ON x(id)',
    'ALTER TABLE x ADD COLUMN IF NOT EXISTS y INT',
    'ALTER TABLE x ALTER COLUMN y DROP DEFAULT',
    'INSERT INTO x (id) VALUES (1) ON CONFLICT (id) DO NOTHING',
    'UPDATE x SET y = 1 WHERE y IS NULL',
    'DROP TRIGGER IF EXISTS t ON x',
    'CREATE TRIGGER t BEFORE UPDATE ON x FOR EACH ROW EXECUTE FUNCTION f()',
  ];
  assert.deepEqual(verificarMigraciones(buenas), []);
});
