// =====================================================================
// Controller de Turnos / Agenda.
// Permite listar turnos por rango de fecha y sucursal, crear turnos y
// cambiar su estado (asistió / ausente / cancelado).
// =====================================================================

const { query } = require('../config/db');

const ESTADOS = ['pendiente', 'asistio', 'ausente', 'cancelado'];

// GET /api/turnos?sucursal_id=&desde=&hasta=&estado=
async function listar(req, res) {
  const { sucursal_id, desde, hasta, estado, limit = 300 } = req.query;
  const lim = Math.min(parseInt(limit, 10) || 300, 1000);
  const cond = [];
  const params = [];
  if (sucursal_id) { params.push(sucursal_id); cond.push(`t.sucursal_id = $${params.length}`); }
  if (desde) { params.push(desde); cond.push(`t.fecha_hora >= $${params.length}`); }
  if (hasta) { params.push(hasta); cond.push(`t.fecha_hora <= $${params.length}`); }
  if (estado) { params.push(estado); cond.push(`t.estado = $${params.length}`); }
  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
  params.push(lim);
  try {
    const r = await query(
      `SELECT t.*, u.nombre_completo AS cliente_nombre,
              us.usuario AS profesional_nombre, s.nombre AS sucursal_nombre
       FROM turnos t
       LEFT JOIN usuarios u ON u.id = t.cliente_id
       LEFT JOIN usuarios_sistema us ON us.id = t.profesional_id
       LEFT JOIN sucursales s ON s.id = t.sucursal_id
       ${where}
       ORDER BY t.fecha_hora ASC
       LIMIT $${params.length}`,
      params
    );
    return res.json({ turnos: r.rows });
  } catch (err) {
    console.error('Error al listar turnos:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// POST /api/turnos
// Body: { sucursal_id, fecha_hora, cliente_id?, profesional_id?, motivo?,
//         nombre_contacto?, telefono_contacto?, notas? }
async function crear(req, res) {
  const b = req.body || {};
  if (!b.sucursal_id) return res.status(400).json({ error: 'sucursal_id es obligatorio' });
  if (!b.fecha_hora) return res.status(400).json({ error: 'fecha_hora es obligatoria' });
  if (Number.isNaN(Date.parse(b.fecha_hora))) {
    return res.status(400).json({ error: 'fecha_hora no es una fecha válida' });
  }
  // Debe identificar al paciente de alguna forma (cliente existente o nombre suelto)
  if (!b.cliente_id && !b.nombre_contacto) {
    return res.status(400).json({ error: 'Indicá un cliente o un nombre de contacto' });
  }
  try {
    const r = await query(
      `INSERT INTO turnos
         (sucursal_id, cliente_id, profesional_id, fecha_hora, motivo,
          nombre_contacto, telefono_contacto, notas)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [b.sucursal_id, b.cliente_id || null, b.profesional_id || null, b.fecha_hora,
       b.motivo || null, b.nombre_contacto || null, b.telefono_contacto || null, b.notas || null]
    );
    return res.status(201).json({ turno: r.rows[0] });
  } catch (err) {
    console.error('Error al crear turno:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// PATCH /api/turnos/:id/estado  { estado }
async function cambiarEstado(req, res) {
  const { estado } = req.body || {};
  if (!ESTADOS.includes(estado)) {
    return res.status(400).json({ error: `Estado inválido. Debe ser uno de: ${ESTADOS.join(', ')}` });
  }
  try {
    const r = await query(
      `UPDATE turnos SET estado = $1 WHERE id = $2 RETURNING *`,
      [estado, req.params.id]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: 'Turno no encontrado' });
    return res.json({ turno: r.rows[0] });
  } catch (err) {
    console.error('Error al cambiar estado de turno:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// DELETE /api/turnos/:id
async function eliminar(req, res) {
  try {
    const r = await query('DELETE FROM turnos WHERE id = $1 RETURNING id', [req.params.id]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'Turno no encontrado' });
    return res.json({ ok: true });
  } catch (err) {
    console.error('Error al eliminar turno:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

module.exports = { listar, crear, cambiarEstado, eliminar };
