// =====================================================================
// Controller de Médicos (los que firman las recetas de los sobres).
// Listar: cualquier usuario (el vendedor lo elige al armar el sobre).
// Alta / edición / baja: solo admin (definido en la ruta).
// =====================================================================

const { query } = require('../config/db');

const MAX_NOMBRE = 150;
const MAX_MATRICULA = 50;

// Valida y normaliza el cuerpo. Devuelve { datos } o { error }.
function validar(b, parcial = false) {
  const datos = {};
  if (b.nombre !== undefined || !parcial) {
    const nombre = typeof b.nombre === 'string' ? b.nombre.trim() : '';
    if (!nombre) return { error: 'El nombre es obligatorio' };
    if (nombre.length > MAX_NOMBRE) return { error: `El nombre admite hasta ${MAX_NOMBRE} caracteres` };
    datos.nombre = nombre;
  }
  if (b.matricula !== undefined) {
    if (b.matricula !== null && typeof b.matricula !== 'string') return { error: 'Matrícula inválida' };
    const m = (b.matricula || '').trim();
    if (m.length > MAX_MATRICULA) return { error: `La matrícula admite hasta ${MAX_MATRICULA} caracteres` };
    datos.matricula = m || null;
  }
  if (b.activo !== undefined) {
    if (typeof b.activo !== 'boolean') return { error: 'activo debe ser true o false' };
    datos.activo = b.activo;
  }
  return { datos };
}

// GET /api/medicos?activos=true&q=
async function listar(req, res) {
  const cond = [];
  const params = [];
  if (req.query.activos === 'true') cond.push('activo = TRUE');
  if (req.query.q) {
    params.push(`%${String(req.query.q).replace(/[\\%_]/g, '\\$&')}%`);
    cond.push(`(nombre ILIKE $${params.length} OR matricula ILIKE $${params.length})`);
  }
  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
  try {
    const r = await query(`SELECT * FROM medicos ${where} ORDER BY nombre ASC LIMIT 500`, params);
    return res.json({ medicos: r.rows });
  } catch (err) {
    console.error('Error al listar médicos:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// POST /api/medicos  { nombre, matricula? }
async function crear(req, res) {
  const { datos, error } = validar(req.body || {});
  if (error) return res.status(400).json({ error });
  try {
    const r = await query(
      'INSERT INTO medicos (nombre, matricula) VALUES ($1, $2) RETURNING *',
      [datos.nombre, datos.matricula ?? null]
    );
    return res.status(201).json({ medico: r.rows[0] });
  } catch (err) {
    console.error('Error al crear médico:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// PUT /api/medicos/:id  (actualización parcial)
async function actualizar(req, res) {
  const { datos, error } = validar(req.body || {}, true);
  if (error) return res.status(400).json({ error });
  const claves = Object.keys(datos);
  if (claves.length === 0) return res.status(400).json({ error: 'No hay campos para actualizar' });
  const sets = claves.map((c, i) => `${c} = $${i + 1}`);
  const valores = claves.map((c) => datos[c]);
  valores.push(req.params.id);
  try {
    const r = await query(
      `UPDATE medicos SET ${sets.join(', ')} WHERE id = $${valores.length} RETURNING *`,
      valores
    );
    if (r.rowCount === 0) return res.status(404).json({ error: 'Médico no encontrado' });
    return res.json({ medico: r.rows[0] });
  } catch (err) {
    if (err.code === '22P02') return res.status(400).json({ error: 'Identificador inválido' });
    console.error('Error al actualizar médico:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// DELETE /api/medicos/:id
// Si ya figura en sobres no se borra (perdería la trazabilidad): se desactiva.
async function eliminar(req, res) {
  try {
    const usado = await query('SELECT 1 FROM sobres WHERE medico_id = $1 LIMIT 1', [req.params.id]);
    if (usado.rowCount > 0) {
      const r = await query('UPDATE medicos SET activo = FALSE WHERE id = $1 RETURNING *', [req.params.id]);
      return res.json({ ok: true, desactivado: true, medico: r.rows[0] });
    }
    const r = await query('DELETE FROM medicos WHERE id = $1 RETURNING id', [req.params.id]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'Médico no encontrado' });
    return res.json({ ok: true, desactivado: false });
  } catch (err) {
    if (err.code === '22P02') return res.status(400).json({ error: 'Identificador inválido' });
    console.error('Error al eliminar médico:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

module.exports = { listar, crear, actualizar, eliminar };
