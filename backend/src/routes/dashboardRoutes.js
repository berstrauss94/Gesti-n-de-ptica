// =====================================================================
// Rutas del Dashboard (KPIs de inicio). Protegidas por JWT.
// =====================================================================

const express = require('express');
const { authRequired } = require('../middlewares/auth');
const dashboard = require('../controllers/dashboardController');

const router = express.Router();
router.use(authRequired);

router.get('/dashboard/resumen', dashboard.resumen);

module.exports = router;
