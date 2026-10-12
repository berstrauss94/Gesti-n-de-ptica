// =====================================================================
// Controller de Sobres / Órdenes de trabajo óptica.
// El Sobre une paciente + receta (lejos/cerca por ojo) + armazón + cristal
// + médico + obra social + fecha de entrega. Es la orden central del taller.
// =====================================================================

const { query } = require('../config/db');

// Campos de receta y datos editables del sobre (todos opcionales salvo sucursal).
const CAMPOS = [
  'cliente_id', 'venta_id', 'obra_social_id', 'medico', 'fecha_receta', 'fecha_entrega', 'estado',
  'lejos_od_esf', 'lejos_od_cil', 'lejos_od_eje', 'lejos_od_add', 'lejos_od_prisma', 'lejos_od_base', 'lejos_od_diam',
  'lejos_oi_esf', 'lejos_oi_cil', 'lejos_oi_eje', 'lejos_oi_add', 'lejos_oi_prisma', 'lejos_oi_base', 'lejos_oi_diam',
  'cerca_od_esf', 'cerca_od_cil', 'cerca_od_eje', 'cerca_od_prisma', 'cerca_od_base', 'cerca_od_diam',
  'cerca_oi_esf', 'cerca_oi_cil', 'cerca_oi_eje', 'cerca_oi_prisma', 'cerca_oi_base', 'cerca_oi_diam',
  'dip', 'armazon_producto_id', 'armazon_descripcion', 'cristal_descripcion', 'notas', 'total',
];

const ESTADOS = ['pendiente', 'reserva', 'en_taller', 'entregado', 'anulado'];

// GET /api/sobres?estado=&cliente_id=&sucursal_id=&desde=&hasta=
async function listar(req, res) {
  const { estado, cliente_id, sucursal_id, desde, hasta, limit = 200 } = req.query;
  const lim = Math.min(parseInt(limit, 10) || 200, 1000);
  const cond = [];
  const params = [];
  if (estado) { params.push(estado); cond.push(`s.estado = $${params.length}`); }
  if (cliente_id) { params.push(cliente_id); cond.push(`s.cliente_id = $${params.length}`); }
  if (sucursal_id) { params.push(sucursal_id); cond.push(`s.sucursal_id = $${params.length}`); }
  if (desde) { params.push(desde); cond.push(`s.created_at::date >= $${params.length}`); }
  if (hasta) { params.push(hasta); cond.push(`s.created_at::date <= $${params.length}`); }
  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
  params.push(lim);
  try {
    const r = await query(
      `SELECT s.*, u.nombre_completo AS cliente_nombre, os.nombre AS obra_social_nombre,
              suc.nombre AS sucursal_nombre
       FROM sobres s
       LEFT JOIN usuarios u ON u.id = s.cliente_id
       LEFT JOIN obras_sociales os ON os.id = s.obra_social_id
       LEFT JOIN sucursales suc ON suc.id = s.sucursal_id
       ${where}
       ORDER BY s.created_at DESC LIMIT $${params.length}`,
      params
    );
    return res.json({ sobres: r.rows });
  } catch (err) {
    console.error('Error al listar sobres:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// GET /api/sobres/:id
async function obtener(req, res) {
  try {
    const r = await query(
      `SELECT s.*, u.nombre_completo AS cliente_nombre, u.dni AS cliente_dni,
              os.nombre AS obra_social_nombre
       FROM sobres s
       LEFT JOIN usuarios u ON u.id = s.cliente_id
       LEFT JOIN obras_sociales os ON os.id = s.obra_social_id
       WHERE s.id = $1`,
      [req.params.id]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: 'Sobre no encontrado' });
    return res.json({ sobre: r.rows[0] });
  } catch (err) {
    console.error('Error al obtener sobre:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// POST /api/sobres
async function crear(req, res) {
  const b = req.body || {};
  if (!b.sucursal_id) return res.status(400).json({ error: 'sucursal_id es obligatorio' });
  if (b.estado && !ESTADOS.includes(b.estado)) {
    return res.status(400).json({ error: `estado inválido. Debe ser uno de: ${ESTADOS.join(', ')}` });
  }

  const columnas = ['sucursal_id'];
  const valores = [b.sucursal_id];
  CAMPOS.forEach((c) => {
    if (b[c] !== undefined && b[c] !== '') { columnas.push(c); valores.push(b[c]); }
  });
  const placeholders = valores.map((_, i) => `$${i + 1}`);
  try {
    const r = await query(
      `INSERT INTO sobres (${columnas.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`,
      valores
    );
    return res.status(201).json({ sobre: r.rows[0] });
  } catch (err) {
    if (err.code === '23514') return res.status(400).json({ error: 'Algún valor viola las validaciones (ejes 0-180, etc.)' });
    console.error('Error al crear sobre:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// PUT /api/sobres/:id  (actualización parcial)
async function actualizar(req, res) {
  const b = req.body || {};
  const campos = [];
  const valores = [];
  CAMPOS.forEach((c) => {
    if (b[c] !== undefined) { valores.push(b[c] === '' ? null : b[c]); campos.push(`${c} = $${valores.length}`); }
  });
  if (campos.length === 0) return res.status(400).json({ error: 'No hay campos para actualizar' });
  if (b.estado !== undefined && !ESTADOS.includes(b.estado)) {
    return res.status(400).json({ error: `estado inválido. Debe ser uno de: ${ESTADOS.join(', ')}` });
  }
  valores.push(req.params.id);
  try {
    const r = await query(
      `UPDATE sobres SET ${campos.join(', ')} WHERE id = $${valores.length} RETURNING *`,
      valores
    );
    if (r.rowCount === 0) return res.status(404).json({ error: 'Sobre no encontrado' });
    return res.json({ sobre: r.rows[0] });
  } catch (err) {
    if (err.code === '23514') return res.status(400).json({ error: 'Algún valor viola las validaciones (ejes 0-180, etc.)' });
    console.error('Error al actualizar sobre:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// PATCH /api/sobres/:id/estado  { estado }
async function cambiarEstado(req, res) {
  const { estado } = req.body || {};
  if (!ESTADOS.includes(estado)) {
    return res.status(400).json({ error: `estado inválido. Debe ser uno de: ${ESTADOS.join(', ')}` });
  }
  try {
    const r = await query('UPDATE sobres SET estado = $1 WHERE id = $2 RETURNING *', [estado, req.params.id]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'Sobre no encontrado' });
    return res.json({ sobre: r.rows[0] });
  } catch (err) {
    console.error('Error al cambiar estado del sobre:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// DELETE /api/sobres/:id
async function eliminar(req, res) {
  try {
    const r = await query('DELETE FROM sobres WHERE id = $1 RETURNING id', [req.params.id]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'Sobre no encontrado' });
    return res.json({ ok: true });
  } catch (err) {
    console.error('Error al eliminar sobre:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

module.exports = { listar, obtener, crear, actualizar, cambiarEstado, eliminar };
