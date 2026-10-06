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

router.get('/', listar);
router.post('/', upload.single('imagen'), crear);
router.get('/:id', obtener);
router.put('/:id', upload.single('imagen'), actualizar);
router.delete('/:id', eliminar);

module.exports = router;
