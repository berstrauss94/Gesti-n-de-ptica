// =====================================================================
// Rutas del asistente virtual de ayuda. Protegidas por JWT.
// Consultar y valorar: cualquier usuario. Ver el historial: admin.
// =====================================================================
const express = require('express');
const { authRequired, requireRole } = require('../middlewares/auth');
const asistente = require('../controllers/asistenteController');

const router = express.Router();
router.use(authRequired);

router.get('/asistente/opciones', asistente.obtenerOpciones);
router.post('/asistente/consultar', asistente.consultar);
router.post('/asistente/valorar', asistente.valorar);
router.get('/asistente/consultas', requireRole('admin'), asistente.listarConsultas);

module.exports = router;
