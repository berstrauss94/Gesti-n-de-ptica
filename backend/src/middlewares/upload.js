// =====================================================================
// Middleware de subida de archivos con multer.
// Guarda las fotos en uploadsPath (montar sobre Railway Volume o S3 en
// prod, ya que el filesystem de Railway es efímero entre despliegues).
// =====================================================================

const path = require('path');
const multer = require('multer');
const { uploadsPath } = require('../config/paths');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsPath),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${file.fieldname}-${unique}${ext}`);
  },
});

// Solo imágenes
const fileFilter = (req, file, cb) => {
  const permitidos = ['image/jpeg', 'image/png', 'image/webp'];
  if (permitidos.includes(file.mimetype)) {
    return cb(null, true);
  }
  return cb(new Error('Formato no permitido. Usa JPEG, PNG o WEBP.'));
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB por archivo
    files: 3, // máximo 3 fotos por cliente
  },
});

module.exports = { upload, uploadsPath };
