// =====================================================================
// Rutas de Médicos. Protegidas por JWT.
// Listar y dar de alta: cualquier usuario (alta rápida desde el sobre o el cliente).
// Editar y borrar: admin.
// =====================================================================

const express = require('express');
const { authRequired, requireRole } = require('../middlewares/auth');
const medicos = require('../controllers/medicosController');

const router = express.Router();
router.use(authRequired);

router.get('/medicos', medicos.listar);
router.post('/medicos', medicos.crear);
router.put('/medicos/:id', requireRole('admin'), medicos.actualizar);
router.delete('/medicos/:id', requireRole('admin'), medicos.eliminar);

module.exports = router;
