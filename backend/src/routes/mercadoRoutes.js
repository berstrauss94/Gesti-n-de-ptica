// =====================================================================
// Rutas del Catálogo de Mercado (enriquecido con IA). Protegidas por JWT.
// Enriquecer (gasta cuota de Gemini): solo admin. Listar: cualquier usuario.
// =====================================================================

const express = require('express');
const { authRequired, requireRole } = require('../middlewares/auth');
const mercado = require('../controllers/mercadoController');

const router = express.Router();
router.use(authRequired);

router.get('/mercado', mercado.listar);
// Sugerencia de género/material por marca para el alta de productos (sin IA, sin costo).
router.get('/mercado/predict-attributes', mercado.predecirAtributos);
router.post('/mercado/enriquecer', requireRole('admin'), mercado.enriquecer);

module.exports = router;
