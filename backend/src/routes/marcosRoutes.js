// =====================================================================
// Rutas de Marcos (catálogo Virtual Try-On). Protegidas por JWT.
// La imagen del marco se envía en el campo "imagen" (PNG transparente).
// =====================================================================

const express = require('express');
const {
  listar,
  obtener,
  crear,
  actualizar,
  eliminar,
} = require('../controllers/marcosController');
const { authRequired } = require('../middlewares/auth');
const { upload } = require('../middlewares/upload');

const router = express.Router();

router.use(authRequired);

// 3 vistas del marco por ángulo (+ 'imagen' legacy = frontal)
const camposImagen = upload.fields([
  { name: 'imagen_frontal', maxCount: 1 },
  { name: 'imagen_45', maxCount: 1 },
  { name: 'imagen_perfil', maxCount: 1 },
  { name: 'imagen', maxCount: 1 },
]);

router.get('/', listar);
router.post('/', camposImagen, crear);
router.get('/:id', obtener);
router.put('/:id', camposImagen, actualizar);
router.delete('/:id', eliminar);

module.exports = router;
