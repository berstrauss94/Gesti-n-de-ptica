// =====================================================================
// Rutas del catálogo de lentes y servicios de laboratorio. Protegidas por JWT.
// Consultar y validar: cualquier usuario. Importar y ajustar precios: admin.
// =====================================================================
const express = require('express');
const { authRequired, requireRole } = require('../middlewares/auth');
const lab = require('../controllers/laboratorioController');

const router = express.Router();
router.use(authRequired);

router.get('/laboratorio/catalogo', lab.listar);
router.get('/laboratorio/categorias', lab.categorias);
router.post('/laboratorio/validar-receta', lab.validarReceta);
router.put('/laboratorio/actualizacion-masiva', requireRole('admin'), lab.actualizacionMasiva);
router.post('/laboratorio/importar', requireRole('admin'), lab.importar);

module.exports = router;
