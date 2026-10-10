// =====================================================================
// Rutas del Módulo Notificaciones (WhatsApp / Telegram). JWT.
// =====================================================================

const express = require('express');
const { authRequired, requireRole } = require('../middlewares/auth');
const notif = require('../controllers/notificacionesController');

const router = express.Router();
router.use(authRequired);

router.get('/notificaciones/config', notif.obtenerConfig);
// Guardar tokens (Telegram/WhatsApp/Gemini) es sensible: solo admin
router.put('/notificaciones/config', requireRole('admin'), notif.guardarConfig);
router.get('/notificaciones', notif.listar);
router.post('/notificaciones/prueba', requireRole('admin'), notif.prueba);

module.exports = router;
