// =====================================================================
// Controller de Proveedores y Laboratorios (ABM).
// =====================================================================

const { query } = require('../config/db');

const COLS = `id, nombre, tipo, cuit, telefono, email, direccion, activo, created_at`;

async function listar(req, res) {
  const { tipo } = req.query;
  const params = [];
  let where = '';
  if (tipo) { params.push(tipo); where = 'WHERE tipo = $1'; }
  try {
    const r = await query(`SELECT ${COLS} FROM proveedores ${where} ORDER BY nombre ASC`, params);
    return res.json({ proveedores: r.rows });
  } catch (err) {
    console.error('Error al listar proveedores:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

async function crear(req, res) {
  const b = req.body || {};
  if (!b.nombre) return res.status(400).json({ error: 'nombre es obligatorio' });
  const tipo = ['proveedor', 'laboratorio'].includes(b.tipo) ? b.tipo : 'proveedor';
  try {
    const r = await query(
      `INSERT INTO proveedores (nombre, tipo, cuit, telefono, email, direccion)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING ${COLS}`,
      [b.nombre, tipo, b.cuit || null, b.telefono || null, b.email || null, b.direccion || null]
    );
    return res.status(201).json({ proveedor: r.rows[0] });
  } catch (err) {
    console.error('Error al crear proveedor:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

async function actualizar(req, res) {
  const permitidos = ['nombre', 'tipo', 'cuit', 'telefono', 'email', 'direccion', 'activo'];
  const campos = [];
  const valores = [];
  permitidos.forEach((c) => {
    if (req.body && req.body[c] !== undefined) {
      valores.push(c === 'activo' ? Boolean(req.body[c]) : req.body[c]);
      campos.push(`${c} = $${valores.length}`);
    }
  });
  if (campos.length === 0) return res.status(400).json({ error: 'Nada para actualizar' });
  valores.push(req.params.id);
  try {
    const r = await query(
      `UPDATE proveedores SET ${campos.join(', ')} WHERE id = $${valores.length} RETURNING ${COLS}`,
      valores
    );
    if (r.rowCount === 0) return res.status(404).json({ error: 'Proveedor no encontrado' });
    return res.json({ proveedor: r.rows[0] });
  } catch (err) {
    console.error('Error al actualizar proveedor:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

module.exports = { listar, crear, actualizar };
