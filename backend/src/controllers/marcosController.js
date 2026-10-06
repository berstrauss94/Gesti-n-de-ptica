// =====================================================================
// Controller de Marcos (catálogo para el Virtual Try-On).
// Cada marco tiene un PNG transparente servible desde /uploads.
// =====================================================================

const path = require('path');
const fs = require('fs');
const { query } = require('../config/db');
const { uploadsPath } = require('../config/paths');

// GET /api/marcos  (lista con filtros y paginación)
async function listar(req, res) {
  const { q, estilo_forma, activo, limit = 50, offset = 0 } = req.query;
  const lim = Math.min(parseInt(limit, 10) || 50, 200);
  const off = parseInt(offset, 10) || 0;

  const condiciones = [];
  const params = [];

  if (q) {
    params.push(`%${q}%`);
    condiciones.push(`(nombre_modelo ILIKE $${params.length} OR marca ILIKE $${params.length} OR codigo ILIKE $${params.length})`);
  }
  if (estilo_forma) {
    params.push(estilo_forma);
    condiciones.push(`estilo_forma = $${params.length}`);
  }
  if (activo !== undefined) {
    params.push(activo === 'true');
    condiciones.push(`activo = $${params.length}`);
  }

  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  params.push(lim, off);

  try {
    const result = await query(
      `SELECT id, codigo, nombre_modelo, marca, material, color,
              ruta_imagen_png, estilo_forma, activo, created_at
       FROM marcos ${where}
       ORDER BY created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return res.json({ marcos: result.rows, limit: lim, offset: off });
  } catch (err) {
    console.error('Error al listar marcos:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// GET /api/marcos/:id
async function obtener(req, res) {
  try {
    const result = await query(
      `SELECT id, codigo, nombre_modelo, marca, material, color,
              ruta_imagen_png, estilo_forma, activo, created_at
       FROM marcos WHERE id = $1`,
      [req.params.id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Marco no encontrado' });
    }
    return res.json({ marco: result.rows[0] });
  } catch (err) {
    console.error('Error al obtener marco:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// POST /api/marcos  (multipart: campo "imagen" con el PNG transparente)
async function crear(req, res) {
  const { codigo, nombre_modelo, marca, material, color, estilo_forma } = req.body || {};

  if (!codigo || !nombre_modelo) {
    return res.status(400).json({ error: 'codigo y nombre_modelo son obligatorios' });
  }
  if (!req.file) {
    return res.status(400).json({ error: 'La imagen PNG del marco es obligatoria' });
  }

  const rutaImagen = path.posix.join('/uploads', req.file.filename);

  try {
    const result = await query(
      `INSERT INTO marcos (codigo, nombre_modelo, marca, material, color, ruta_imagen_png, estilo_forma)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, codigo, nombre_modelo, marca, material, color, ruta_imagen_png, estilo_forma, activo, created_at`,
      [codigo, nombre_modelo, marca || null, material || null, color || null, rutaImagen, estilo_forma || null]
    );
    return res.status(201).json({ marco: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      // codigo duplicado: limpiar el archivo recién subido
      fs.promises
        .unlink(path.join(uploadsPath, req.file.filename))
        .catch(() => {});
      return res.status(409).json({ error: 'Ya existe un marco con ese código' });
    }
    console.error('Error al crear marco:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// PUT /api/marcos/:id  (actualización parcial; imagen opcional)
async function actualizar(req, res) {
  const permitidos = ['codigo', 'nombre_modelo', 'marca', 'material', 'color', 'estilo_forma', 'activo'];
  const campos = [];
  const valores = [];

  permitidos.forEach((campo) => {
    if (req.body && req.body[campo] !== undefined) {
      valores.push(campo === 'activo' ? req.body[campo] === 'true' || req.body[campo] === true : req.body[campo]);
      campos.push(`${campo} = $${valores.length}`);
    }
  });

  // Si llega nueva imagen, actualizar la ruta
  if (req.file) {
    valores.push(path.posix.join('/uploads', req.file.filename));
    campos.push(`ruta_imagen_png = $${valores.length}`);
  }

  if (campos.length === 0) {
    return res.status(400).json({ error: 'No hay campos para actualizar' });
  }

  valores.push(req.params.id);

  try {
    const result = await query(
      `UPDATE marcos SET ${campos.join(', ')}
       WHERE id = $${valores.length}
       RETURNING id, codigo, nombre_modelo, marca, material, color, ruta_imagen_png, estilo_forma, activo, created_at`,
      valores
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Marco no encontrado' });
    }
    return res.json({ marco: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Ya existe un marco con ese código' });
    }
    console.error('Error al actualizar marco:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// DELETE /api/marcos/:id
async function eliminar(req, res) {
  try {
    const sel = await query('SELECT ruta_imagen_png FROM marcos WHERE id = $1', [req.params.id]);
    if (sel.rowCount === 0) {
      return res.status(404).json({ error: 'Marco no encontrado' });
    }

    await query('DELETE FROM marcos WHERE id = $1', [req.params.id]);

    const nombre = path.basename(sel.rows[0].ruta_imagen_png);
    fs.promises
      .unlink(path.join(uploadsPath, nombre))
      .catch(() => {});

    return res.status(204).send();
  } catch (err) {
    console.error('Error al eliminar marco:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

module.exports = { listar, obtener, crear, actualizar, eliminar };
