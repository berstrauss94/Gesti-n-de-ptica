// =====================================================================
// Rutas de subida a Cloudinary. Protegidas por JWT.
// =====================================================================
const express = require('express');
const multer = require('multer');
const { authRequired } = require('../middlewares/auth');
const ctrl = require('../controllers/uploadController');

// En memoria: el archivo no toca el disco, va directo a Cloudinary.
const subida = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => (
    ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)
      ? cb(null, true)
      : cb(new Error('Formato no permitido. Usa JPEG, PNG o WEBP.'))
  ),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
});

const router = express.Router();
router.use(authRequired);
router.post('/uploads/tryon', subida.single('imagen'), ctrl.subirTryOn);

module.exports = router;
