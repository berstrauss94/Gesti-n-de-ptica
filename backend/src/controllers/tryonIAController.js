// =====================================================================
// Controller del Try-On con IA. Lee la foto del cliente y la imagen del
// marco desde /uploads, y pide la composición al servicio de IA.
// =====================================================================

const path = require('path');
const fs = require('fs');
const { uploadsPath } = require('../config/paths');
const ia = require('../services/tryonIAService');

// GET /api/tryon-ia/estado
async function estado(req, res) {
  return res.json(await ia.estado());
}

// Lee un archivo de /uploads a base64 a partir de su ruta servible (/uploads/x)
function leerB64(rutaServible) {
  if (!rutaServible) return null;
  const nombre = path.basename(rutaServible);
  const abs = path.join(uploadsPath, nombre);
  if (!fs.existsSync(abs)) return null;
  return fs.readFileSync(abs).toString('base64');
}

function mimePorNombre(ruta) {
  const ext = (ruta || '').toLowerCase();
  if (ext.endsWith('.png')) return 'image/png';
  if (ext.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

// POST /api/tryon-ia/generar  { foto_ruta, marco_ruta }
async function generar(req, res) {
  const { foto_ruta, marco_ruta } = req.body || {};
  if (!foto_ruta || !marco_ruta) {
    return res.status(400).json({ error: 'foto_ruta y marco_ruta son obligatorias' });
  }

  const est = await ia.estado();
  if (!est.habilitado) {
    return res.status(409).json({
      error: 'Try-On con IA deshabilitado: falta configurar la API key de Google.',
      motivo: 'sin_credenciales',
    });
  }

  const fotoB64 = leerB64(foto_ruta);
  const marcoB64 = leerB64(marco_ruta);
  if (!fotoB64 || !marcoB64) {
    return res.status(404).json({ error: 'No se encontró la foto o la imagen del marco en el servidor' });
  }

  const r = await ia.generar({
    fotoB64, marcoB64,
    fotoMime: mimePorNombre(foto_ruta),
    marcoMime: mimePorNombre(marco_ruta),
  });

  if (!r.ok) {
    return res.status(502).json({ error: 'No se pudo generar la imagen con IA', detalle: r.detalle || r.motivo });
  }
  // Devolvemos la imagen como data URL lista para mostrar en el front
  return res.json({ imagen: `data:${r.mime};base64,${r.imagen_b64}` });
}

module.exports = { estado, generar };
