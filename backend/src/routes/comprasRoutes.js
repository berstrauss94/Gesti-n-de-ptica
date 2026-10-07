// =====================================================================
// Rutas del Módulo Compras: proveedores, compras y órdenes de laboratorio.
// Protegidas por JWT.
// =====================================================================

const express = require('express');
const { authRequired } = require('../middlewares/auth');
const prov = require('../controllers/proveedoresController');
const compras = require('../controllers/comprasController');
const ordenes = require('../controllers/ordenesLabController');

const router = express.Router();
router.use(authRequired);

// --- Proveedores / Laboratorios ---
router.get('/proveedores', prov.listar);
router.post('/proveedores', prov.crear);
router.put('/proveedores/:id', prov.actualizar);

// --- Compras ---
router.get('/compras', compras.listar);
router.post('/compras', compras.crear);
router.get('/compras/:id', compras.obtener);
router.post('/compras/:id/confirmar', compras.confirmar);

// --- Órdenes de laboratorio ---
router.get('/ordenes-laboratorio', ordenes.listar);
router.post('/ordenes-laboratorio', ordenes.crear);
router.patch('/ordenes-laboratorio/:id/estado', ordenes.cambiarEstado);

module.exports = router;
