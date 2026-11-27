// =====================================================================
// Rutas de Estadísticas. Solo admin: exponen costos, ganancias y flujo de caja.
// =====================================================================
const express = require('express');
const { authRequired, requireRole } = require('../middlewares/auth');
const estadisticas = require('../controllers/estadisticasController');

const router = express.Router();
router.use(authRequired);
router.get('/estadisticas/stock', requireRole('admin'), estadisticas.stock);

module.exports = router;
