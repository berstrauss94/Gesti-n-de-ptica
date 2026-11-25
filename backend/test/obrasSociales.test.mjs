// Pruebas del enlace ficha del cliente (nombre) -> sobre (id) de la obra social
// (frontend/src/utils/obrasSociales.js). Funciones puras, sin React.
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizarObraSocial, buscarObraSocialPorNombre } from '../../frontend/src/utils/obrasSociales.js';

const LISTA = [
  { id: 'a', nombre: 'OSDE *' },
  { id: 'b', nombre: 'JERÁRQUICO *' },
  { id: 'c', nombre: 'PAMI 300007' },
  { id: 'd', nombre: 'PAMI 300042' },
];

test('normaliza mayúsculas, acentos, espacios y el "*" final', () => {
  assert.equal(normalizarObraSocial('  JERÁRQUICO  * '), 'jerarquico');
  assert.equal(normalizarObraSocial('OSDE *'), 'osde');
  assert.equal(normalizarObraSocial(null), '');
});

test('encuentra la obra social aunque la ficha la tenga escrita distinto', () => {
  assert.equal(buscarObraSocialPorNombre(LISTA, 'osde')?.id, 'a');
  assert.equal(buscarObraSocialPorNombre(LISTA, 'Jerarquico')?.id, 'b');
  assert.equal(buscarObraSocialPorNombre(LISTA, 'PAMI 300042')?.id, 'd');
});

test('sin coincidencia exacta no precarga nada', () => {
  assert.equal(buscarObraSocialPorNombre(LISTA, 'PAMI'), null);
  assert.equal(buscarObraSocialPorNombre(LISTA, ''), null);
  assert.equal(buscarObraSocialPorNombre(undefined, 'OSDE'), null);
});
