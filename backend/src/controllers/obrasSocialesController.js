// =====================================================================
// Controller de Obras Sociales / Convenios.
// Administra los convenios y su % de cobertura por defecto. En el TPV, al
// elegir una obra social, se aplica la cobertura sobre la venta.
// Alta/baja: solo admin (definido en la ruta).
// =====================================================================

const { query } = require('../config/db');

// GET /api/obras-sociales?solo_activas=1
async function listar(req, res) {
  const soloActivas = req.query.solo_activas === '1' || req.query.solo_activas === 'true';
  try {
    const r = await query(
      `SELECT * FROM obras_sociales ${soloActivas ? 'WHERE activa = TRUE' : ''}
       ORDER BY activa DESC, nombre ASC`
    );
    return res.json({ obras_sociales: r.rows });
  } catch (err) {
    console.error('Error al listar obras sociales:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// POST /api/obras-sociales  { nombre, cobertura_pct, cuit?, notas? }
async function crear(req, res) {
  const { nombre, cobertura_pct, cuit, notas } = req.body || {};
  if (!nombre || String(nombre).trim() === '') {
    return res.status(400).json({ error: 'El nombre es obligatorio' });
  }
  const cob = Number(cobertura_pct);
  if (!Number.isFinite(cob) || cob < 0 || cob > 100) {
    return res.status(400).json({ error: 'La cobertura debe estar entre 0 y 100' });
  }
  try {
    const r = await query(
      `INSERT INTO obras_sociales (nombre, cobertura_pct, cuit, notas)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [String(nombre).trim(), cob, cuit ? String(cuit).replace(/\D/g, '').slice(0, 11) || null : null, notas || null]
    );
    return res.status(201).json({ obra_social: r.rows[0] });
  } catch (err) {
    console.error('Error al crear obra social:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// PUT /api/obras-sociales/:id  (actualización parcial)
async function actualizar(req, res) {
  const b = req.body || {};
  const campos = [];
  const valores = [];
  const set = (col, val) => { valores.push(val); campos.push(`${col} = $${valores.length}`); };
  if (b.nombre !== undefined) set('nombre', String(b.nombre).trim());
  if (b.cobertura_pct !== undefined) {
    const cob = Number(b.cobertura_pct);
    if (!Number.isFinite(cob) || cob < 0 || cob > 100) {
      return res.status(400).json({ error: 'La cobertura debe estar entre 0 y 100' });
    }
    set('cobertura_pct', cob);
  }
  if (b.cuit !== undefined) set('cuit', b.cuit ? String(b.cuit).replace(/\D/g, '').slice(0, 11) || null : null);
  if (b.notas !== undefined) set('notas', b.notas || null);
  if (b.activa !== undefined) set('activa', Boolean(b.activa));
  if (valores.length === 0) return res.status(400).json({ error: 'No hay cambios para guardar' });
  valores.push(req.params.id);
  try {
    const r = await query(
      `UPDATE obras_sociales SET ${campos.join(', ')} WHERE id = $${valores.length} RETURNING *`,
      valores
    );
    if (r.rowCount === 0) return res.status(404).json({ error: 'Obra social no encontrada' });
    return res.json({ obra_social: r.rows[0] });
  } catch (err) {
    console.error('Error al actualizar obra social:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// DELETE /api/obras-sociales/:id
async function eliminar(req, res) {
  try {
    const r = await query('DELETE FROM obras_sociales WHERE id = $1 RETURNING id', [req.params.id]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'Obra social no encontrada' });
    return res.json({ ok: true });
  } catch (err) {
    // Si está referenciada por ventas, no se puede borrar: sugerir desactivar
    if (err.code === '23503') {
      return res.status(409).json({ error: 'La obra social tiene ventas asociadas. Desactivala en vez de eliminarla.' });
    }
    console.error('Error al eliminar obra social:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

module.exports = { listar, crear, actualizar, eliminar };
