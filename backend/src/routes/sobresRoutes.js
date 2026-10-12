// =====================================================================
// Rutas de Sobres / Órdenes de trabajo óptica. Protegidas por JWT.
// =====================================================================

const express = require('express');
const { authRequired } = require('../middlewares/auth');
const sobres = require('../controllers/sobresController');

const router = express.Router();
router.use(authRequired);

router.get('/sobres', sobres.listar);
router.post('/sobres', sobres.crear);
router.get('/sobres/:id', sobres.obtener);
router.put('/sobres/:id', sobres.actualizar);
router.patch('/sobres/:id/estado', sobres.cambiarEstado);
router.delete('/sobres/:id', sobres.eliminar);

module.exports = router;
