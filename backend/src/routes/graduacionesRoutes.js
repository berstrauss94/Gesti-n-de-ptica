// =====================================================================
// Rutas planas de Graduaciones por id (protegidas por JWT).
// Las rutas anidadas (por cliente) viven en usuariosRoutes.js.
// =====================================================================

const express = require('express');
const {
  obtener,
  actualizar,
  eliminar,
} = require('../controllers/graduacionesController');
const { authRequired } = require('../middlewares/auth');

const router = express.Router();

router.use(authRequired);

router.get('/:id', obtener);
router.put('/:id', actualizar);
router.delete('/:id', eliminar);

module.exports = router;
