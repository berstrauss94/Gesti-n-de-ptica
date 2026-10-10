// =====================================================================
// Rutas de Promociones / Descuentos del comercio. Protegidas por JWT.
// Listar: cualquier usuario (lo usa el TPV). Alta/baja/eliminar: admin.
// =====================================================================

const express = require('express');
const { authRequired, requireRole } = require('../middlewares/auth');
const promo = require('../controllers/promocionesController');

const router = express.Router();
router.use(authRequired);

router.get('/promociones', promo.listar);
router.post('/promociones', requireRole('admin'), promo.crear);
router.patch('/promociones/:id', requireRole('admin'), promo.cambiarEstado);
router.delete('/promociones/:id', requireRole('admin'), promo.eliminar);

module.exports = router;
