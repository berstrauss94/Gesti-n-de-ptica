// =====================================================================
// Rutas de Comisiones (reporte por vendedor). Protegidas por JWT.
// Solo admin: es información sensible de liquidación.
// =====================================================================

const express = require('express');
const { authRequired, requireRole } = require('../middlewares/auth');
const comisiones = require('../controllers/comisionesController');

const router = express.Router();
router.use(authRequired);

router.get('/comisiones', requireRole('admin'), comisiones.listar);

module.exports = router;
