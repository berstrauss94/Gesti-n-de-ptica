// =====================================================================
// Rutas del Módulo Fiscal (AFIP/ARCA). Protegidas por JWT.
// =====================================================================

const express = require('express');
const { authRequired, requireRole } = require('../middlewares/auth');
const fiscal = require('../controllers/fiscalController');

const router = express.Router();
router.use(authRequired);

router.get('/fiscal/estado', fiscal.estado);
// Config fiscal (CUIT, punto de venta, certificado): ver y guardar solo admin
router.get('/fiscal/config', requireRole('admin'), fiscal.obtenerConfig);
router.put('/fiscal/config', requireRole('admin'), fiscal.guardarConfig);
router.post('/fiscal/emitir', fiscal.emitir);
router.get('/fiscal/comprobantes', fiscal.listar);

module.exports = router;
