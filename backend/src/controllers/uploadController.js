// =====================================================================
// Subida de imágenes nuevas del Try-On a Cloudinary.
// POST /api/uploads/tryon  (multipart, campo "imagen")
// =====================================================================
const storage = require('../services/storageService');

async function subirTryOn(req, res) {
  if (!req.file) return res.status(400).json({ error: 'Falta el archivo en el campo "imagen"' });
  if (!storage.habilitado()) {
    return res.status(409).json({
      error: 'Almacenamiento en Cloudinary deshabilitado: faltan las credenciales.',
      motivo: 'sin_credenciales',
    });
  }
  try {
    const r = await storage.uploadTryOnImage(req.file.buffer);
    return res.status(201).json(r);
  } catch (err) {
    console.error('[upload] Cloudinary:', err.message);
    return res.status(502).json({ error: 'No se pudo guardar la imagen en Cloudinary' });
  }
}

module.exports = { subirTryOn };
