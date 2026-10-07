// =====================================================================
// Rutas del Módulo Fiscal (AFIP/ARCA). Protegidas por JWT.
// =====================================================================

const express = require('express');
const { authRequired } = require('../middlewares/auth');
const fiscal = require('../controllers/fiscalController');

const router = express.Router();
router.use(authRequired);

router.get('/fiscal/estado', fiscal.estado);
router.post('/fiscal/emitir', fiscal.emitir);
router.get('/fiscal/comprobantes', fiscal.listar);

module.exports = router;
