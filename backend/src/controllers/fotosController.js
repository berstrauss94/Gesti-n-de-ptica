// =====================================================================
// Controller de fotos de seguimiento.
// Recibe hasta 3 fotos del cliente y las registra en fotos_usuario.
// =====================================================================

const path = require('path');
const fs = require('fs');
const { query } = require('../config/db');
const { uploadsPath } = require('../config/paths');

const MAX_FOTOS = 3;

// Mapa de ángulo -> orden_foto (secuencia visual: Frontal -> 45° -> Perfil)
const ANGULO_A_ORDEN = { frontal: 1, '45deg': 2, perfil: 3 };
const ANGULOS_VALIDOS = Object.keys(ANGULO_A_ORDEN);

// POST /api/usuarios/:usuarioId/fotos  (multipart/form-data, campo "fotos")
// Dos modos:
//  A) Con ángulos explícitos: el frontend manda un campo "angulos" paralelo
//     a los archivos (frontal | 45deg | perfil). Cada foto va a su orden fijo
//     (1/2/3) y se guarda metadatos_foto.angulo_detectado. Usado en el alta.
//  B) Sin ángulos (fallback): ocupa los órdenes libres (1..3). Usado para
//     completar fotos faltantes desde el detalle del cliente.
async function subirFotos(req, res) {
  const { usuarioId } = req.params;
  const archivos = req.files || [];

  if (archivos.length === 0) {
    return res.status(400).json({ error: 'No se recibió ninguna foto' });
  }

  // "angulos" puede llegar como string (1 valor) o array (varios).
  let angulos = req.body?.angulos;
  if (angulos !== undefined && !Array.isArray(angulos)) angulos = [angulos];
  const conAngulos = Array.isArray(angulos) && angulos.length > 0;

  try {
    // Verifica que el cliente exista
    const existe = await query('SELECT 1 FROM usuarios WHERE id = $1', [usuarioId]);
    if (existe.rowCount === 0) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }

    // --- Determinar el orden y el ángulo de cada archivo ---
    let asignaciones; // [{ orden, angulo|null }]

    if (conAngulos) {
      // Modo A: ángulo explícito por archivo
      if (angulos.length !== archivos.length) {
        return res
          .status(400)
          .json({ error: 'La cantidad de ángulos no coincide con la de fotos' });
      }
      const invalido = angulos.find((a) => !ANGULOS_VALIDOS.includes(a));
      if (invalido) {
        return res.status(400).json({
          error: `Ángulo inválido: "${invalido}". Debe ser uno de: ${ANGULOS_VALIDOS.join(', ')}`,
        });
      }
      // No permitir ángulos repetidos en el mismo envío
      if (new Set(angulos).size !== angulos.length) {
        return res.status(400).json({ error: 'No se pueden repetir ángulos en el mismo envío' });
      }
      asignaciones = angulos.map((a) => ({ orden: ANGULO_A_ORDEN[a], angulo: a }));
    } else {
      // Modo B: fallback por órdenes libres
      const actuales = await query(
        'SELECT orden_foto FROM fotos_usuario WHERE usuario_id = $1',
        [usuarioId]
      );
      const ocupados = new Set(actuales.rows.map((r) => r.orden_foto));
      const libres = [1, 2, 3].filter((n) => !ocupados.has(n));

      if (archivos.length > libres.length) {
        return res.status(400).json({
          error:
            `El cliente admite ${MAX_FOTOS} fotos como máximo. ` +
            `Ya tiene ${ocupados.size} y estás intentando sumar ${archivos.length}.`,
        });
      }
      asignaciones = archivos.map((_, i) => ({ orden: libres[i], angulo: null }));
    }

    // --- Insertar / actualizar cada foto en su orden ---
    const insertadas = [];
    for (let i = 0; i < archivos.length; i += 1) {
      const archivo = archivos[i];
      const { orden, angulo } = asignaciones[i];
      const rutaLocal = path.posix.join('/uploads', archivo.filename);

      // metadatos_foto deja preparado el campo para el futuro agente de visión:
      // angulo_detectado = lo informado por el operador (o null si no vino).
      const metadatos = JSON.stringify({ angulo_detectado: angulo });

      const sql = `
        INSERT INTO fotos_usuario (usuario_id, ruta_local, orden_foto, metadatos_foto)
        VALUES ($1, $2, $3, $4::jsonb)
        ON CONFLICT (usuario_id, orden_foto)
        DO UPDATE SET ruta_local = EXCLUDED.ruta_local,
                      metadatos_foto = EXCLUDED.metadatos_foto
        RETURNING id, usuario_id, ruta_local, orden_foto, metadatos_foto, created_at
      `;
      const result = await query(sql, [usuarioId, rutaLocal, orden, metadatos]);
      insertadas.push(result.rows[0]);
    }

    // Devolver siempre ordenado por orden_foto
    insertadas.sort((a, b) => a.orden_foto - b.orden_foto);
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
