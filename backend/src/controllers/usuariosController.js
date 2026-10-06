// =====================================================================
// Controller de Usuarios / Clientes.
// Entidad base del sistema: su UUID enlaza fotos y graduaciones.
// =====================================================================

const { query } = require('../config/db');

// GET /api/usuarios  (lista con búsqueda y paginación)
async function listar(req, res) {
  const { q, limit = 50, offset = 0 } = req.query;
  const lim = Math.min(parseInt(limit, 10) || 50, 200);
  const off = parseInt(offset, 10) || 0;

  try {
    let sql = `
      SELECT id, nombre_completo, dni, obra_social, edad, metadatos_ia, created_at
      FROM usuarios
    `;
    const params = [];

    if (q) {
      params.push(`%${q}%`);
      sql += ` WHERE nombre_completo ILIKE $1 OR dni ILIKE $1`;
    }

    params.push(lim, off);
    sql += ` ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const result = await query(sql, params);
    return res.json({ usuarios: result.rows, limit: lim, offset: off });
  } catch (err) {
    console.error('Error al listar usuarios:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// GET /api/usuarios/:id
async function obtener(req, res) {
  try {
    const result = await query(
      `SELECT id, nombre_completo, dni, obra_social, edad, metadatos_ia, created_at
       FROM usuarios WHERE id = $1`,
      [req.params.id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }
    return res.json({ usuario: result.rows[0] });
  } catch (err) {
    console.error('Error al obtener usuario:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// POST /api/usuarios
async function crear(req, res) {
  const { nombre_completo, dni, obra_social, edad, metadatos_ia } = req.body || {};

  if (!nombre_completo || !dni) {
    return res
      .status(400)
      .json({ error: 'nombre_completo y dni son obligatorios' });
  }
  if (edad !== undefined && edad !== null && (edad < 0 || edad > 120)) {
    return res.status(400).json({ error: 'La edad debe estar entre 0 y 120' });
  }

  try {
    const result = await query(
      `INSERT INTO usuarios (nombre_completo, dni, obra_social, edad, metadatos_ia)
       VALUES ($1, $2, $3, $4, COALESCE($5, '{}'::jsonb))
       RETURNING id, nombre_completo, dni, obra_social, edad, metadatos_ia, created_at`,
      [nombre_completo, dni, obra_social || null, edad ?? null, metadatos_ia || null]
    );
    return res.status(201).json({ usuario: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      // unique_violation (dni duplicado)
      return res.status(409).json({ error: 'Ya existe un cliente con ese DNI' });
    }
    console.error('Error al crear usuario:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// PUT /api/usuarios/:id  (actualización parcial de campos permitidos)
async function actualizar(req, res) {
  const permitidos = ['nombre_completo', 'dni', 'obra_social', 'edad', 'metadatos_ia'];
  const campos = [];
  const valores = [];

  permitidos.forEach((campo) => {
    if (req.body && req.body[campo] !== undefined) {
      valores.push(req.body[campo]);
      campos.push(`${campo} = $${valores.length}`);
    }
  });

  if (campos.length === 0) {
    return res.status(400).json({ error: 'No hay campos para actualizar' });
  }

  valores.push(req.params.id);

  try {
    const result = await query(
      `UPDATE usuarios SET ${campos.join(', ')}
       WHERE id = $${valores.length}
       RETURNING id, nombre_completo, dni, obra_social, edad, metadatos_ia, created_at`,
      valores
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }
    return res.json({ usuario: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Ya existe un cliente con ese DNI' });
    }
    console.error('Error al actualizar usuario:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// DELETE /api/usuarios/:id  (borra en cascada fotos y graduaciones)
async function eliminar(req, res) {
  try {
    const result = await query(
      'DELETE FROM usuarios WHERE id = $1 RETURNING id',
      [req.params.id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }
    return res.status(204).send();
  } catch (err) {
    console.error('Error al eliminar usuario:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

module.exports = { listar, obtener, crear, actualizar, eliminar };
