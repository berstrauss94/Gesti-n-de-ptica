// =====================================================================
// Rutas del Módulo de Stock: sucursales, productos y existencias.
// Todas protegidas por JWT.
// =====================================================================

const express = require('express');
const { authRequired } = require('../middlewares/auth');
const suc = require('../controllers/sucursalesController');
const prod = require('../controllers/productosController');
const stock = require('../controllers/stockController');

const router = express.Router();
router.use(authRequired);

// --- Sucursales ---
router.get('/sucursales', suc.listar);
router.post('/sucursales', suc.crear);
router.put('/sucursales/:id', suc.actualizar);

// --- Productos ---
router.get('/productos', prod.listar);
router.post('/productos', prod.crear);
router.post('/productos/recalcular-precios', prod.recalcularMasivo);
router.get('/productos/:id', prod.obtener);
router.put('/productos/:id', prod.actualizar);
router.delete('/productos/:id', prod.eliminar);

// --- Stock por sucursal ---
router.get('/stock', stock.listar);
router.post('/stock/movimiento', stock.registrarMovimiento);
router.get('/stock/movimientos', stock.listarMovimientos);

module.exports = router;
