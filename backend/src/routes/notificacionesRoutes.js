// =====================================================================
// Rutas del Módulo Notificaciones (WhatsApp / Telegram). JWT.
// =====================================================================

const express = require('express');
const { authRequired } = require('../middlewares/auth');
const notif = require('../controllers/notificacionesController');

const router = express.Router();
router.use(authRequired);

router.get('/notificaciones/config', notif.obtenerConfig);
router.put('/notificaciones/config', notif.guardarConfig);
router.get('/notificaciones', notif.listar);
router.post('/notificaciones/prueba', notif.prueba);

module.exports = router;
