// =====================================================================
// Controller de Marcos (catálogo Virtual Try-On) — Camino B.
// Cada marco tiene hasta 3 vistas PNG transparentes:
//   ruta_frontal, ruta_45, ruta_perfil  (servibles desde /uploads).
// ruta_imagen_png se mantiene = frontal (compatibilidad / miniatura).
// =====================================================================

const path = require('path');
const fs = require('fs');
const { query } = require('../config/db');
const { uploadsPath } = require('../config/paths');

const COLS = `id, codigo, nombre_modelo, marca, material, color,
  ruta_imagen_png, ruta_frontal, ruta_45, ruta_perfil,
  estilo_forma, ancho_mm, alto_mm, patilla_mm, activo, created_at`;

function numOrNull(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Devuelve ruta servible /uploads/<file> para un campo de req.files
function rutaDe(files, campo) {
  const f = files?.[campo]?.[0];
  return f ? path.posix.join('/uploads', f.filename) : null;
}

// Borra best-effort los archivos subidos (si algo falla a mitad de camino)
function limpiarArchivos(files) {
  Object.values(files || {}).forEach((arr) => {
    arr.forEach((f) => {
      fs.promises.unlink(path.join(uploadsPath, f.filename)).catch(() => {});
    });
  });
}

// GET /api/marcos
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
      `SELECT ${COLS} FROM marcos ${where}
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
    const result = await query(`SELECT ${COLS} FROM marcos WHERE id = $1`, [req.params.id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Marco no encontrado' });
    return res.json({ marco: result.rows[0] });
  } catch (err) {
    console.error('Error al obtener marco:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// POST /api/marcos  (multipart: imagen_frontal [, imagen_45, imagen_perfil])
async function crear(req, res) {
  const { codigo, nombre_modelo, marca, material, color, estilo_forma } = req.body || {};
  const ancho_mm = numOrNull(req.body?.ancho_mm);
  const alto_mm = numOrNull(req.body?.alto_mm);
  const patilla_mm = numOrNull(req.body?.patilla_mm);

  // frontal: acepta 'imagen_frontal' o el legacy 'imagen'
  const frontal = rutaDe(req.files, 'imagen_frontal') || rutaDe(req.files, 'imagen');
  const v45 = rutaDe(req.files, 'imagen_45');
  const perfil = rutaDe(req.files, 'imagen_perfil');

  if (!codigo || !nombre_modelo) {
    limpiarArchivos(req.files);
    return res.status(400).json({ error: 'codigo y nombre_modelo son obligatorios' });
  }
  if (!frontal) {
    limpiarArchivos(req.files);
    return res.status(400).json({ error: 'La imagen frontal del marco es obligatoria' });
  }

  try {
    const result = await query(
      `INSERT INTO marcos
        (codigo, nombre_modelo, marca, material, color,
         ruta_imagen_png, ruta_frontal, ruta_45, ruta_perfil,
         estilo_forma, ancho_mm, alto_mm, patilla_mm)
       VALUES ($1,$2,$3,$4,$5, $6,$7,$8,$9, $10,$11,$12,$13)
       RETURNING ${COLS}`,
      [
        codigo, nombre_modelo, marca || null, material || null, color || null,
        frontal, frontal, v45, perfil,
        estilo_forma || null, ancho_mm, alto_mm, patilla_mm,
      ]
    );
    return res.status(201).json({ marco: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      limpiarArchivos(req.files);
      return res.status(409).json({ error: 'Ya existe un marco con ese código' });
    }
    console.error('Error al crear marco:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// PUT /api/marcos/:id  (actualización parcial; vistas opcionales)
async function actualizar(req, res) {
  const permitidos = ['codigo', 'nombre_modelo', 'marca', 'material', 'color', 'estilo_forma', 'activo'];
  const numericos = ['ancho_mm', 'alto_mm', 'patilla_mm'];
  const campos = [];
  const valores = [];

  permitidos.forEach((campo) => {
    if (req.body && req.body[campo] !== undefined) {
      valores.push(campo === 'activo' ? req.body[campo] === 'true' || req.body[campo] === true : req.body[campo]);
      campos.push(`${campo} = $${valores.length}`);
    }
  });
  numericos.forEach((campo) => {
    if (req.body && req.body[campo] !== undefined) {
      valores.push(numOrNull(req.body[campo]));
      campos.push(`${campo} = $${valores.length}`);
    }
  });

  // Vistas: si llega cada archivo, se actualiza su ruta
  const frontal = rutaDe(req.files, 'imagen_frontal') || rutaDe(req.files, 'imagen');
  if (frontal) {
    valores.push(frontal); campos.push(`ruta_frontal = $${valores.length}`);
    valores.push(frontal); campos.push(`ruta_imagen_png = $${valores.length}`);
  }
  const v45 = rutaDe(req.files, 'imagen_45');
  if (v45) { valores.push(v45); campos.push(`ruta_45 = $${valores.length}`); }
  const perfil = rutaDe(req.files, 'imagen_perfil');
  if (perfil) { valores.push(perfil); campos.push(`ruta_perfil = $${valores.length}`); }

  if (campos.length === 0) {
    return res.status(400).json({ error: 'No hay campos para actualizar' });
  }

  valores.push(req.params.id);

  try {
    const result = await query(
      `UPDATE marcos SET ${campos.join(', ')} WHERE id = $${valores.length} RETURNING ${COLS}`,
      valores
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Marco no encontrado' });
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
    const sel = await query(
      'SELECT ruta_imagen_png, ruta_frontal, ruta_45, ruta_perfil FROM marcos WHERE id = $1',
      [req.params.id]
    );
    if (sel.rowCount === 0) return res.status(404).json({ error: 'Marco no encontrado' });

    await query('DELETE FROM marcos WHERE id = $1', [req.params.id]);

    // Borrar los archivos físicos de todas las vistas (best-effort, sin duplicar)
    const rutas = new Set(
      [sel.rows[0].ruta_imagen_png, sel.rows[0].ruta_frontal, sel.rows[0].ruta_45, sel.rows[0].ruta_perfil]
        .filter(Boolean)
        .map((r) => path.basename(r))
    );
    rutas.forEach((nombre) => {
      fs.promises.unlink(path.join(uploadsPath, nombre)).catch(() => {});
    });

    return res.status(204).send();
  } catch (err) {
    console.error('Error al eliminar marco:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

module.exports = { listar, obtener, crear, actualizar, eliminar };
