// =====================================================================
// Controller de Promociones / Descuentos definidos por el comercio.
// El usuario crea sus propios descuentos (porcentaje o monto) y los
// reutiliza en el TPV al cargar una venta. Alta/baja: solo admin (ruta).
// =====================================================================

const { query } = require('../config/db');

// GET /api/promociones?solo_activas=1
async function listar(req, res) {
  const soloActivas = req.query.solo_activas === '1' || req.query.solo_activas === 'true';
  try {
    const r = await query(
      `SELECT * FROM promociones ${soloActivas ? 'WHERE activa = TRUE' : ''}
       ORDER BY activa DESC, nombre ASC`
    );
    return res.json({ promociones: r.rows });
  } catch (err) {
    console.error('Error al listar promociones:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// POST /api/promociones  { nombre, tipo:'porcentaje'|'monto', valor }
async function crear(req, res) {
  const { nombre, tipo, valor } = req.body || {};
  if (!nombre || String(nombre).trim() === '') {
    return res.status(400).json({ error: 'El nombre es obligatorio' });
  }
  if (!['porcentaje', 'monto'].includes(tipo)) {
    return res.status(400).json({ error: "tipo debe ser 'porcentaje' o 'monto'" });
  }
  const val = Number(valor);
  if (!Number.isFinite(val) || val <= 0) {
    return res.status(400).json({ error: 'El valor debe ser mayor a 0' });
  }
  if (tipo === 'porcentaje' && val > 100) {
    return res.status(400).json({ error: 'Un porcentaje no puede superar 100' });
  }
  try {
    const r = await query(
      `INSERT INTO promociones (nombre, tipo, valor) VALUES ($1,$2,$3) RETURNING *`,
      [String(nombre).trim(), tipo, val]
    );
    return res.status(201).json({ promocion: r.rows[0] });
  } catch (err) {
    console.error('Error al crear promoción:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// PATCH /api/promociones/:id  { activa }  (activar/desactivar)
async function cambiarEstado(req, res) {
  const { activa } = req.body || {};
  if (typeof activa !== 'boolean') {
    return res.status(400).json({ error: 'activa debe ser true o false' });
  }
  try {
    const r = await query(
      `UPDATE promociones SET activa = $1 WHERE id = $2 RETURNING *`,
      [activa, req.params.id]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: 'Promoción no encontrada' });
    return res.json({ promocion: r.rows[0] });
  } catch (err) {
    console.error('Error al cambiar estado de promoción:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// DELETE /api/promociones/:id
async function eliminar(req, res) {
  try {
    const r = await query('DELETE FROM promociones WHERE id = $1 RETURNING id', [req.params.id]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'Promoción no encontrada' });
    return res.json({ ok: true });
  } catch (err) {
    console.error('Error al eliminar promoción:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

module.exports = { listar, crear, cambiarEstado, eliminar };
