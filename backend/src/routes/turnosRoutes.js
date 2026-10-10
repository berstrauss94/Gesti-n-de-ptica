// =====================================================================
// Rutas del Módulo Turnos / Agenda. Protegidas por JWT.
// =====================================================================

const express = require('express');
const { authRequired } = require('../middlewares/auth');
const turnos = require('../controllers/turnosController');

const router = express.Router();
router.use(authRequired);

router.get('/turnos', turnos.listar);
router.post('/turnos', turnos.crear);
router.patch('/turnos/:id/estado', turnos.cambiarEstado);
router.delete('/turnos/:id', turnos.eliminar);

module.exports = router;
