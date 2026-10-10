// =====================================================================
// Rutas del Módulo de Stock: sucursales, productos y existencias.
// Todas protegidas por JWT.
// =====================================================================

const express = require('express');
const { authRequired, requireRole } = require('../middlewares/auth');
const suc = require('../controllers/sucursalesController');
const prod = require('../controllers/productosController');
const stock = require('../controllers/stockController');

const router = express.Router();
router.use(authRequired);

// --- Sucursales (altas/cambios: solo admin) ---
router.get('/sucursales', suc.listar);
router.post('/sucursales', requireRole('admin'), suc.crear);
router.put('/sucursales/:id', requireRole('admin'), suc.actualizar);

// --- Productos ---
router.get('/productos', prod.listar);
router.post('/productos', requireRole('admin'), prod.crear);
router.post('/productos/recalcular-precios', requireRole('admin'), prod.recalcularMasivo);
router.get('/productos/:id', prod.obtener);
router.put('/productos/:id', requireRole('admin'), prod.actualizar);
router.delete('/productos/:id', requireRole('admin'), prod.eliminar);

// --- Stock por sucursal ---
router.get('/stock', stock.listar);
router.post('/stock/movimiento', stock.registrarMovimiento);
router.get('/stock/movimientos', stock.listarMovimientos);

module.exports = router;
