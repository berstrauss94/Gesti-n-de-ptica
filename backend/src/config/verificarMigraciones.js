// =====================================================================
// Chequeo previo de migraciones (sin base de datos).
// Revisa la lista MIGRACIONES de migrate.js y devuelve los problemas que
// podrían romper producción o impedir correr las migraciones dos veces:
//
//  1. Sentencias destructivas: DROP TABLE/COLUMN/INDEX/EXTENSION/FUNCTION,
//     TRUNCATE, DELETE, RENAME, cambio de tipo de columna (ALTER ... TYPE),
//     ALTER ... DROP. (DROP TRIGGER IF EXISTS sí se permite: es el patrón
//     para recrear triggers sin duplicarlos.)
//  2. Sentencias no idempotentes: CREATE TABLE/INDEX/EXTENSION sin IF NOT
//     EXISTS, ADD COLUMN sin IF NOT EXISTS, INSERT sin ON CONFLICT, UPDATE
//     sin WHERE, CREATE TRIGGER sin su DROP TRIGGER IF EXISTS previo,
//     CREATE FUNCTION sin OR REPLACE.
//
// Devuelve un array de { indice, problema, sql } (vacío = todo bien).
// =====================================================================

function normalizar(sql) {
  return String(sql)
    .replace(/--[^\n]*/g, ' ') // comentarios de línea
    .replace(/\s+/g, ' ')
    .trim();
}

const DESTRUCTIVAS = [
  [/\bDROP\s+(TABLE|COLUMN|INDEX|EXTENSION|FUNCTION|SCHEMA|TYPE|VIEW|DATABASE)\b/i, 'Borra un objeto de la base (DROP)'],
  [/\bTRUNCATE\b/i, 'Vacía una tabla (TRUNCATE)'],
  [/^DELETE\b/i, 'Borra filas (DELETE)'],
  [/\bRENAME\b/i, 'Renombra un objeto (RENAME): rompe el código que usa el nombre viejo'],
  [/\bALTER\s+COLUMN\b.*\bTYPE\b/i, 'Cambia el tipo de una columna: puede fallar o perder datos'],
  [/\bALTER\s+TABLE\b.*\bDROP\b(?!\s+DEFAULT)/i, 'Quita algo de una tabla (ALTER ... DROP)'],
];

function verificarMigraciones(migraciones) {
  const problemas = [];
  const triggersBorrados = new Set();

  migraciones.forEach((original, indice) => {
    const sql = normalizar(original);
    const corto = sql.slice(0, 120);
    const agregar = (problema) => problemas.push({ indice, problema, sql: corto });

    // DROP TRIGGER IF EXISTS <nombre> ON ...: se permite y se recuerda.
    const dropTrigger = sql.match(/^DROP\s+TRIGGER\s+IF\s+EXISTS\s+(\w+)/i);
    if (dropTrigger) { triggersBorrados.add(dropTrigger[1].toLowerCase()); return; }

    DESTRUCTIVAS.forEach(([re, problema]) => { if (re.test(sql)) agregar(problema); });

    if (/^CREATE\s+TABLE\b/i.test(sql) && !/^CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\b/i.test(sql)) {
      agregar('CREATE TABLE sin IF NOT EXISTS');
    }
    if (/^CREATE\s+(UNIQUE\s+)?INDEX\b/i.test(sql) && !/\bINDEX\s+IF\s+NOT\s+EXISTS\b/i.test(sql)) {
      agregar('CREATE INDEX sin IF NOT EXISTS');
    }
    if (/^CREATE\s+EXTENSION\b/i.test(sql) && !/^CREATE\s+EXTENSION\s+IF\s+NOT\s+EXISTS\b/i.test(sql)) {
      agregar('CREATE EXTENSION sin IF NOT EXISTS');
    }
    if (/\bADD\s+COLUMN\b/i.test(sql) && !/\bADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\b/i.test(sql)) {
      agregar('ADD COLUMN sin IF NOT EXISTS');
    }
    if (/^INSERT\b/i.test(sql) && !/\bON\s+CONFLICT\b/i.test(sql) && !/\bWHERE\s+NOT\s+EXISTS\b/i.test(sql)) {
      agregar('INSERT sin ON CONFLICT (duplica filas en cada arranque)');
    }
    if (/^UPDATE\b/i.test(sql) && !/\bWHERE\b/i.test(sql)) {
      agregar('UPDATE sin WHERE (pisa todas las filas en cada arranque)');
    }
    if (/^CREATE\s+FUNCTION\b/i.test(sql)) {
      agregar('CREATE FUNCTION sin OR REPLACE');
    }
    const trigger = sql.match(/^CREATE\s+TRIGGER\s+(\w+)/i);
    if (trigger && !triggersBorrados.has(trigger[1].toLowerCase())) {
      agregar(`CREATE TRIGGER ${trigger[1]} sin DROP TRIGGER IF EXISTS previo`);
    }
  });

  return problemas;
}

module.exports = { verificarMigraciones };
