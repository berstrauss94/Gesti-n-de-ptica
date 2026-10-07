// =====================================================================
// Controller de Sucursales.
// =====================================================================

const { query } = require('../config/db');

async function listar(req, res) {
  try {
    const r = await query(
      `SELECT id, nombre, codigo, direccion, telefono, activa, created_at
       FROM sucursales ORDER BY nombre ASC`
    );
    return res.json({ sucursales: r.rows });
  } catch (err) {
    console.error('Error al listar sucursales:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

async function crear(req, res) {
  const { nombre, codigo, direccion, telefono } = req.body || {};
  if (!nombre || !codigo) {
    return res.status(400).json({ error: 'nombre y codigo son obligatorios' });
  }
  try {
    const r = await query(
      `INSERT INTO sucursales (nombre, codigo, direccion, telefono)
       VALUES ($1, $2, $3, $4)
       RETURNING id, nombre, codigo, direccion, telefono, activa, created_at`,
      [nombre, codigo, direccion || null, telefono || null]
    );
    return res.status(201).json({ sucursal: r.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Ya existe una sucursal con ese código' });
    }
    console.error('Error al crear sucursal:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

async function actualizar(req, res) {
  const permitidos = ['nombre', 'codigo', 'direccion', 'telefono', 'activa'];
  const campos = [];
  const valores = [];
  permitidos.forEach((c) => {
    if (req.body && req.body[c] !== undefined) {
      valores.push(c === 'activa' ? Boolean(req.body[c]) : req.body[c]);
      campos.push(`${c} = $${valores.length}`);
    }
  });
  if (campos.length === 0) return res.status(400).json({ error: 'Nada para actualizar' });
  valores.push(req.params.id);
  try {
    const r = await query(
      `UPDATE sucursales SET ${campos.join(', ')} WHERE id = $${valores.length}
       RETURNING id, nombre, codigo, direccion, telefono, activa, created_at`,
      valores
    );
    if (r.rowCount === 0) return res.status(404).json({ error: 'Sucursal no encontrada' });
    return res.json({ sucursal: r.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Ya existe una sucursal con ese código' });
    }
    console.error('Error al actualizar sucursal:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

module.exports = { listar, crear, actualizar };
