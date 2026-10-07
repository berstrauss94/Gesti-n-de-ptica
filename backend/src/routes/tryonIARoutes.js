// =====================================================================
// Rutas del Try-On con IA. Protegidas por JWT.
// =====================================================================

const express = require('express');
const { authRequired } = require('../middlewares/auth');
const ctrl = require('../controllers/tryonIAController');

const router = express.Router();
router.use(authRequired);

router.get('/tryon-ia/estado', ctrl.estado);
router.post('/tryon-ia/generar', ctrl.generar);

module.exports = router;
