// =====================================================================
// Rutas de Médicos. Protegidas por JWT.
// Listar: cualquier usuario (se elige al armar el sobre). ABM: admin.
// =====================================================================

const express = require('express');
const { authRequired, requireRole } = require('../middlewares/auth');
const medicos = require('../controllers/medicosController');

const router = express.Router();
router.use(authRequired);

router.get('/medicos', medicos.listar);
router.post('/medicos', requireRole('admin'), medicos.crear);
router.put('/medicos/:id', requireRole('admin'), medicos.actualizar);
router.delete('/medicos/:id', requireRole('admin'), medicos.eliminar);

module.exports = router;
