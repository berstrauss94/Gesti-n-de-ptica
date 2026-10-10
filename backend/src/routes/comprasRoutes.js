// =====================================================================
// Rutas del Módulo Compras: proveedores, compras y órdenes de laboratorio.
// Protegidas por JWT.
// =====================================================================

const express = require('express');
const { authRequired, requireRole } = require('../middlewares/auth');
const prov = require('../controllers/proveedoresController');
const compras = require('../controllers/comprasController');
const ordenes = require('../controllers/ordenesLabController');

const router = express.Router();
router.use(authRequired);

// --- Proveedores / Laboratorios (altas/cambios: solo admin) ---
router.get('/proveedores', prov.listar);
router.post('/proveedores', requireRole('admin'), prov.crear);
router.put('/proveedores/:id', requireRole('admin'), prov.actualizar);

// --- Compras (confirmar impacta costos y stock: solo admin) ---
router.get('/compras', compras.listar);
router.post('/compras', compras.crear);
router.get('/compras/:id', compras.obtener);
router.post('/compras/:id/confirmar', requireRole('admin'), compras.confirmar);

// --- Órdenes de laboratorio ---
router.get('/ordenes-laboratorio', ordenes.listar);
router.post('/ordenes-laboratorio', ordenes.crear);
router.patch('/ordenes-laboratorio/:id/estado', ordenes.cambiarEstado);

module.exports = router;
