// =====================================================================
// Rutas de Obras Sociales / Convenios. Protegidas por JWT.
// Listar: cualquier usuario (lo usa el TPV). Alta/baja/eliminar: admin.
// =====================================================================

const express = require('express');
const { authRequired, requireRole } = require('../middlewares/auth');
const os = require('../controllers/obrasSocialesController');

const router = express.Router();
router.use(authRequired);

router.get('/obras-sociales', os.listar);
router.post('/obras-sociales', requireRole('admin'), os.crear);
router.put('/obras-sociales/:id', requireRole('admin'), os.actualizar);
router.delete('/obras-sociales/:id', requireRole('admin'), os.eliminar);

module.exports = router;
