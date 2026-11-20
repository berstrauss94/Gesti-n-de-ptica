// =====================================================================
// Rutas del Módulo Notificaciones (WhatsApp / Telegram). JWT.
// =====================================================================

const express = require('express');
const { authRequired, requireRole } = require('../middlewares/auth');
const notif = require('../controllers/notificacionesController');
const rec = require('../controllers/recordatoriosController');

const router = express.Router();
router.use(authRequired);

router.get('/notificaciones/config', notif.obtenerConfig);
// Guardar tokens (Telegram/WhatsApp/Gemini) es sensible: solo admin
router.put('/notificaciones/config', requireRole('admin'), notif.guardarConfig);
router.get('/notificaciones', notif.listar);
router.post('/notificaciones/prueba', requireRole('admin'), notif.prueba);

// Recordatorios automáticos de turnos / controles (cualquier usuario programa y cancela;
// correr la cola a mano es solo admin)
router.get('/notificaciones/recordatorios', rec.listar);
router.post('/notificaciones/recordatorios', rec.crear);
router.post('/notificaciones/recordatorios/procesar', requireRole('admin'), rec.procesarAhora);
router.patch('/notificaciones/recordatorios/:id/cancelar', rec.cancelar);
module.exports = router;
