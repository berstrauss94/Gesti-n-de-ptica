// =====================================================================
// Controller de Graduaciones (prescripciones optométricas por cliente).
// =====================================================================

const { query } = require('../config/db');

const TIPOS_LENTE = ['Monofocal', 'Bifocal', 'Multifocal', 'Ocupacional'];

// Columnas editables de una graduación
const CAMPOS = [
  'tipo_lente',
  'tratamiento_vidrio',
  'od_esfera',
  'od_cilindro',
  'od_eje',
  'od_adicion',
  'oi_esfera',
  'oi_cilindro',
  'oi_eje',
  'oi_adicion',
  'distancia_interpupilar',
  'medico_oftalmologo',
  'fecha_emision',
  'datos_ocr',
];

// GET /api/usuarios/:usuarioId/graduaciones
async function listar(req, res) {
  try {
    const result = await query(
      `SELECT * FROM graduaciones
       WHERE usuario_id = $1
       ORDER BY fecha_emision DESC, created_at DESC`,
      [req.params.usuarioId]
    );
    return res.json({ graduaciones: result.rows });
  } catch (err) {
    console.error('Error al listar graduaciones:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// GET /api/graduaciones/:id
async function obtener(req, res) {
  try {
    const result = await query('SELECT * FROM graduaciones WHERE id = $1', [req.params.id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Graduación no encontrada' });
    }
    return res.json({ graduacion: result.rows[0] });
  } catch (err) {
    console.error('Error al obtener graduación:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// POST /api/usuarios/:usuarioId/graduaciones
async function crear(req, res) {
  const { usuarioId } = req.params;
  const body = req.body || {};

  if (!body.tipo_lente || !body.fecha_emision) {
    return res
      .status(400)
      .json({ error: 'tipo_lente y fecha_emision son obligatorios' });
  }
  if (!TIPOS_LENTE.includes(body.tipo_lente)) {
    return res.status(400).json({ error: `tipo_lente debe ser uno de: ${TIPOS_LENTE.join(', ')}` });
  }

  try {
    const existe = await query('SELECT 1 FROM usuarios WHERE id = $1', [usuarioId]);
    if (existe.rowCount === 0) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }

    const columnas = ['usuario_id'];
    const valores = [usuarioId];
    CAMPOS.forEach((campo) => {
      if (body[campo] !== undefined) {
        columnas.push(campo);
        valores.push(body[campo]);
      }
    });

    const placeholders = valores.map((_, i) => `$${i + 1}`);
    const result = await query(
      `INSERT INTO graduaciones (${columnas.join(', ')})
       VALUES (${placeholders.join(', ')})
       RETURNING *`,
      valores
    );
    return res.status(201).json({ graduacion: result.rows[0] });
  } catch (err) {
    if (err.code === '23514') {
      // check_violation (ejes, DIP, tipo_lente fuera de rango)
      return res.status(400).json({ error: 'Algún valor viola las validaciones (ejes 0-180, DIP 40-80, etc.)' });
    }
    console.error('Error al crear graduación:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// PUT /api/graduaciones/:id
async function actualizar(req, res) {
  const body = req.body || {};
  const campos = [];
  const valores = [];

  CAMPOS.forEach((campo) => {
    if (body[campo] !== undefined) {
      valores.push(body[campo]);
      campos.push(`${campo} = $${valores.length}`);
    }
  });

  if (campos.length === 0) {
    return res.status(400).json({ error: 'No hay campos para actualizar' });
  }
  if (body.tipo_lente !== undefined && !TIPOS_LENTE.includes(body.tipo_lente)) {
    return res.status(400).json({ error: `tipo_lente debe ser uno de: ${TIPOS_LENTE.join(', ')}` });
  }

  valores.push(req.params.id);

  try {
    const result = await query(
      `UPDATE graduaciones SET ${campos.join(', ')}
       WHERE id = $${valores.length}
       RETURNING *`,
      valores
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Graduación no encontrada' });
    }
    return res.json({ graduacion: result.rows[0] });
  } catch (err) {
    if (err.code === '23514') {
      return res.status(400).json({ error: 'Algún valor viola las validaciones (ejes 0-180, DIP 40-80, etc.)' });
    }
    console.error('Error al actualizar graduación:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// DELETE /api/graduaciones/:id
async function eliminar(req, res) {
  try {
    const result = await query('DELETE FROM graduaciones WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Graduación no encontrada' });
    }
    return res.status(204).send();
  } catch (err) {
    console.error('Error al eliminar graduación:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

module.exports = { listar, obtener, crear, actualizar, eliminar };
