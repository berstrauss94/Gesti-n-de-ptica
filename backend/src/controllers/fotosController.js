// =====================================================================
// Controller de fotos de seguimiento.
// Recibe hasta 3 fotos del cliente y las registra en fotos_usuario.
// =====================================================================

const path = require('path');
const fs = require('fs');
const { query } = require('../config/db');
const { uploadsPath } = require('../config/paths');

// POST /api/usuarios/:usuarioId/fotos  (multipart/form-data, campo "fotos")
async function subirFotos(req, res) {
  const { usuarioId } = req.params;
  const archivos = req.files || [];

  if (archivos.length === 0) {
    return res.status(400).json({ error: 'No se recibió ninguna foto' });
  }

  try {
    // Verifica que el cliente exista
    const existe = await query('SELECT 1 FROM usuarios WHERE id = $1', [usuarioId]);
    if (existe.rowCount === 0) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }

    const insertadas = [];
    for (let i = 0; i < archivos.length; i += 1) {
      const archivo = archivos[i];
      // Guardamos ruta relativa servible (/uploads/<archivo>)
      const rutaLocal = path.posix.join('/uploads', archivo.filename);
      const orden = i + 1; // 1..3

      const sql = `
        INSERT INTO fotos_usuario (usuario_id, ruta_local, orden_foto)
        VALUES ($1, $2, $3)
        ON CONFLICT (usuario_id, orden_foto)
        DO UPDATE SET ruta_local = EXCLUDED.ruta_local
        RETURNING id, usuario_id, ruta_local, orden_foto, created_at
      `;
      const result = await query(sql, [usuarioId, rutaLocal, orden]);
      insertadas.push(result.rows[0]);
    }

    return res.status(201).json({ fotos: insertadas });
  } catch (err) {
    console.error('Error al subir fotos:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// GET /api/usuarios/:usuarioId/fotos
async function listarFotos(req, res) {
  try {
    const result = await query(
      `SELECT id, usuario_id, ruta_local, orden_foto, metadatos_foto, created_at
       FROM fotos_usuario
       WHERE usuario_id = $1
       ORDER BY orden_foto ASC`,
      [req.params.usuarioId]
    );
    return res.json({ fotos: result.rows });
  } catch (err) {
    console.error('Error al listar fotos:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// DELETE /api/usuarios/:usuarioId/fotos/:fotoId
async function eliminarFoto(req, res) {
  const { usuarioId, fotoId } = req.params;
  try {
    // Recuperar ruta para borrar el archivo físico
    const sel = await query(
      'SELECT ruta_local FROM fotos_usuario WHERE id = $1 AND usuario_id = $2',
      [fotoId, usuarioId]
    );
    if (sel.rowCount === 0) {
      return res.status(404).json({ error: 'Foto no encontrada' });
    }

    await query('DELETE FROM fotos_usuario WHERE id = $1', [fotoId]);

    // Borrado best-effort del archivo en disco
    const nombre = path.basename(sel.rows[0].ruta_local);
    const rutaFisica = path.join(uploadsPath, nombre);
    fs.promises.unlink(rutaFisica).catch(() => {
      /* el archivo pudo haberse movido a S3/Volume; ignoramos */
    });

    return res.status(204).send();
  } catch (err) {
    console.error('Error al eliminar foto:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

module.exports = { subirFotos, listarFotos, eliminarFoto };
