// =====================================================================
// Rutas del Módulo TPV: cajas, ventas, pagos, cuenta corriente.
// Protegidas por JWT.
// =====================================================================

const express = require('express');
const { authRequired, requireRole } = require('../middlewares/auth');
const cajas = require('../controllers/cajasController');
const ventas = require('../controllers/ventasController');

const router = express.Router();
router.use(authRequired);

// --- Cajas ---
router.get('/cajas/actual', cajas.actual);
router.post('/cajas/abrir', cajas.abrir);
router.post('/cajas/:id/cerrar', cajas.cerrar);

// --- Ventas / TPV ---
router.get('/ventas', ventas.listar);
router.post('/ventas', ventas.crear);
router.get('/ventas/:id', ventas.obtener);
router.post('/ventas/:id/pago', ventas.agregarPago);
router.post('/ventas/:id/entregar', ventas.entregar);
// Anular revierte stock y estado: solo admin
router.post('/ventas/:id/anular', requireRole('admin'), ventas.anular);

// --- Cuenta corriente ---
router.get('/cuenta-corriente/:clienteId', ventas.cuentaCorriente);

module.exports = router;
